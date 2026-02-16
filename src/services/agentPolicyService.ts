// =====================================================
// AGENT POLICY SERVICE - X402 AUTHORIZATION & BUDGET
// =====================================================
// Purpose: Validate agent payments against human-set policies
// Design: Budget enforcement, category restrictions, audit logging
// =====================================================

import { pool } from './database.js';
import type { PoolClient } from 'pg';

// =====================================================
// TYPE DEFINITIONS
// =====================================================

export interface AgentAuthorization {
    authorizationId: string;
    escrowId: string;
    agentWalletAddress: string;
    maxDailyUsdCents: number;
    spentTodayUsdCents: number;
    allowedCategory: string;
    status: 'active' | 'paused' | 'revoked' | 'expired';
    createdAt: Date;
    updatedAt: Date;
}

export interface ValidationResult {
    allowed: boolean;
    reason?: string;
    authorization?: AgentAuthorization;
}

export interface DeductBudgetResult {
    success: boolean;
    newSpentAmount: number;
    remainingBudget: number;
    reason?: string;
}

export interface LogTransactionInput {
    authorizationId: string;
    merchantId: string;
    merchantName: string;
    amountUsdCents: number;
    amountKesCents: number;
    mpesaReceipt?: string;
    status: 'pending' | 'authorized' | 'settling' | 'completed' | 'failed' | 'rejected';
}

// =====================================================
// VALIDATION FUNCTIONS
// =====================================================

/**
 * Validate if an agent payment is allowed under current policy
 * Checks: authorization exists, status active, budget available, category match
 */
export async function validateAgentPayment(
    agentWalletAddress: string,
    category: string,
    amountUsdCents: number
): Promise<ValidationResult> {
    const client = await pool.connect();

    try {
        // Get active authorization for this agent
        const result = await client.query<AgentAuthorization>(
            `SELECT 
                authorization_id as "authorizationId",
                escrow_id as "escrowId",
                agent_wallet_address as "agentWalletAddress",
                max_daily_usd_cents as "maxDailyUsdCents",
                spent_today_usd_cents as "spentTodayUsdCents",
                allowed_category as "allowedCategory",
                status,
                created_at as "createdAt",
                updated_at as "updatedAt"
            FROM agent_authorizations
            WHERE agent_wallet_address = $1
            AND status = 'active'
            LIMIT 1`,
            [agentWalletAddress]
        );

        if (result.rows.length === 0) {
            return {
                allowed: false,
                reason: 'No active authorization found for this agent wallet'
            };
        }

        const auth = result.rows[0];

        // Check category match
        if (auth.allowedCategory !== category) {
            return {
                allowed: false,
                reason: `Agent not authorized for category "${category}". Allowed: "${auth.allowedCategory}"`,
                authorization: auth
            };
        }

        // Check daily budget
        const remainingBudget = auth.maxDailyUsdCents - auth.spentTodayUsdCents;
        if (amountUsdCents > remainingBudget) {
            return {
                allowed: false,
                reason: `Insufficient daily budget. Requested: $${(amountUsdCents / 100).toFixed(2)}, Available: $${(remainingBudget / 100).toFixed(2)}`,
                authorization: auth
            };
        }

        // Check for negative amounts
        if (amountUsdCents <= 0) {
            return {
                allowed: false,
                reason: 'Payment amount must be positive',
                authorization: auth
            };
        }

        // All checks passed
        return {
            allowed: true,
            authorization: auth
        };

    } finally {
        client.release();
    }
}

/**
 * Atomically deduct amount from agent's daily budget
 * Uses row-level locking to prevent race conditions
 * Handles daily reset logic (resets spent_today if last update was yesterday)
 */
export async function deductBudget(
    authorizationId: string,
    amountUsdCents: number
): Promise<DeductBudgetResult> {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Lock the authorization row and check if daily reset is needed
        const lockResult = await client.query(
            `SELECT 
                authorization_id,
                max_daily_usd_cents,
                spent_today_usd_cents,
                updated_at,
                status
            FROM agent_authorizations
            WHERE authorization_id = $1
            FOR UPDATE`,
            [authorizationId]
        );

        if (lockResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return {
                success: false,
                newSpentAmount: 0,
                remainingBudget: 0,
                reason: 'Authorization not found'
            };
        }

        const auth = lockResult.rows[0];

        if (auth.status !== 'active') {
            await client.query('ROLLBACK');
            return {
                success: false,
                newSpentAmount: 0,
                remainingBudget: 0,
                reason: `Authorization status is ${auth.status}`
            };
        }

        // Check if we need to reset daily spending (new day check)
        const lastUpdated = new Date(auth.updated_at);
        const now = new Date();
        const isNewDay = lastUpdated.toDateString() !== now.toDateString();

        let currentSpent = isNewDay ? 0 : auth.spent_today_usd_cents;
        const newSpent = currentSpent + amountUsdCents;

        // Check if new amount exceeds daily limit
        if (newSpent > auth.max_daily_usd_cents) {
            await client.query('ROLLBACK');
            return {
                success: false,
                newSpentAmount: currentSpent,
                remainingBudget: auth.max_daily_usd_cents - currentSpent,
                reason: `Would exceed daily budget. Current: $${(currentSpent / 100).toFixed(2)}, Requested: $${(amountUsdCents / 100).toFixed(2)}, Limit: $${(auth.max_daily_usd_cents / 100).toFixed(2)}`
            };
        }

        // Deduct budget
        const updateResult = await client.query(
            `UPDATE agent_authorizations
            SET 
                spent_today_usd_cents = $1,
                updated_at = NOW()
            WHERE authorization_id = $2
            RETURNING spent_today_usd_cents, max_daily_usd_cents`,
            [newSpent, authorizationId]
        );

        await client.query('COMMIT');

        const updated = updateResult.rows[0];
        return {
            success: true,
            newSpentAmount: updated.spent_today_usd_cents,
            remainingBudget: updated.max_daily_usd_cents - updated.spent_today_usd_cents
        };

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Log an agent transaction to the audit trail
 */
export async function logTransaction(input: LogTransactionInput): Promise<string> {
    const client = await pool.connect();

    try {
        const result = await client.query(
            `INSERT INTO agent_transactions (
                authorization_id,
                merchant_id,
                merchant_name,
                amount_usd_cents,
                amount_kes_cents,
                mpesa_receipt,
                status,
                completed_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING tx_id`,
            [
                input.authorizationId,
                input.merchantId,
                input.merchantName,
                input.amountUsdCents,
                input.amountKesCents,
                input.mpesaReceipt || null,
                input.status,
                input.status === 'completed' ? new Date() : null
            ]
        );

        return result.rows[0].tx_id;

    } finally {
        client.release();
    }
}

/**
 * Update transaction status (e.g., from pending -> completed)
 */
export async function updateTransactionStatus(
    txId: string,
    status: 'pending' | 'authorized' | 'settling' | 'completed' | 'failed' | 'rejected',
    mpesaReceipt?: string
): Promise<void> {
    const client = await pool.connect();

    try {
        const updates: string[] = ['status = $2'];
        const values: any[] = [txId, status];
        let paramIndex = 3;

        if (status === 'completed') {
            updates.push('completed_at = NOW()');
        }

        if (mpesaReceipt) {
            updates.push(`mpesa_receipt = $${paramIndex}`);
            values.push(mpesaReceipt);
            paramIndex++;
        }

        await client.query(
            `UPDATE agent_transactions
            SET ${updates.join(', ')}
            WHERE tx_id = $1`,
            values
        );

    } finally {
        client.release();
    }
}

/**
 * Get authorization by wallet address
 */
export async function getAuthorizationByWallet(
    agentWalletAddress: string
): Promise<AgentAuthorization | null> {
    const client = await pool.connect();

    try {
        const result = await client.query<AgentAuthorization>(
            `SELECT 
                authorization_id as "authorizationId",
                escrow_id as "escrowId",
                agent_wallet_address as "agentWalletAddress",
                max_daily_usd_cents as "maxDailyUsdCents",
                spent_today_usd_cents as "spentTodayUsdCents",
                allowed_category as "allowedCategory",
                status,
                created_at as "createdAt",
                updated_at as "updatedAt"
            FROM agent_authorizations
            WHERE agent_wallet_address = $1
            AND status = 'active'
            LIMIT 1`,
            [agentWalletAddress]
        );

        return result.rows.length > 0 ? result.rows[0] : null;

    } finally {
        client.release();
    }
}

/**
 * Get transaction history for an authorization
 */
export async function getTransactionHistory(
    authorizationId: string,
    limit: number = 50
): Promise<any[]> {
    const client = await pool.connect();

    try {
        const result = await client.query(
            `SELECT 
                tx_id as "txId",
                authorization_id as "authorizationId",
                merchant_id as "merchantId",
                merchant_name as "merchantName",
                amount_usd_cents as "amountUsdCents",
                amount_kes_cents as "amountKesCents",
                mpesa_receipt as "mpesaReceipt",
                status,
                created_at as "createdAt",
                completed_at as "completedAt"
            FROM agent_transactions
            WHERE authorization_id = $1
            ORDER BY created_at DESC
            LIMIT $2`,
            [authorizationId, limit]
        );

        return result.rows;

    } finally {
        client.release();
    }
}

/**
 * Refund a deducted budget amount (e.g., if transaction failed)
 */
export async function refundBudget(
    authorizationId: string,
    amountUsdCents: number
): Promise<DeductBudgetResult> {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Lock the authorization row
        const lockResult = await client.query(
            `SELECT 
                authorization_id,
                max_daily_usd_cents,
                spent_today_usd_cents,
                status
            FROM agent_authorizations
            WHERE authorization_id = $1
            FOR UPDATE`,
            [authorizationId]
        );

        if (lockResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return {
                success: false,
                newSpentAmount: 0,
                remainingBudget: 0,
                reason: 'Authorization not found'
            };
        }

        const auth = lockResult.rows[0];
        const newSpent = Math.max(0, auth.spent_today_usd_cents - amountUsdCents);

        // Refund budget
        const updateResult = await client.query(
            `UPDATE agent_authorizations
            SET 
                spent_today_usd_cents = $1,
                updated_at = NOW()
            WHERE authorization_id = $2
            RETURNING spent_today_usd_cents, max_daily_usd_cents`,
            [newSpent, authorizationId]
        );

        await client.query('COMMIT');

        const updated = updateResult.rows[0];
        return {
            success: true,
            newSpentAmount: updated.spent_today_usd_cents,
            remainingBudget: updated.max_daily_usd_cents - updated.spent_today_usd_cents
        };

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
