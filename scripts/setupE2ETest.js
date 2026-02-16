#!/usr/bin/env node
// =====================================================
// X402 E2E TEST SETUP SCRIPT
// =====================================================
// Purpose: Set up database for end-to-end agent testing
// Creates: Test user, recipient, escrow, and agent authorization
// =====================================================

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment from parent directory
dotenv.config({ path: resolve(__dirname, '../.env') });

const { Pool } = pg;

// Database connection
const pool = new Pool({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT) || 5432,
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// Test agent wallet (Hardhat test account #0)
const AGENT_WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const CATEGORY = 'utilities';
const DAILY_LIMIT_USD = 50.00;

console.log('\n🔧 X402 E2E Test Setup');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Database: ${process.env.DATABASE_HOST}/${process.env.DATABASE_NAME}`);
console.log(`Agent:    ${AGENT_WALLET}`);
console.log(`Category: ${CATEGORY}`);
console.log(`Limit:    $${DAILY_LIMIT_USD} USD`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function setupTestData() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // =====================================================
        // STEP 1: Create or get test user (sender)
        // =====================================================
        console.log('📝 Step 1: Setting up test user...');
        
        const testPrivyDid = 'did:privy:x402-test-sender';
        const testWalletAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // Hardhat account #1
        
        let userId;
        const userResult = await client.query(
            `INSERT INTO users (privy_did, wallet_address, created_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (privy_did) DO UPDATE SET wallet_address = $2
            RETURNING user_id`,
            [testPrivyDid, testWalletAddress]
        );
        userId = userResult.rows[0].user_id;
        console.log(`   ✓ User ID: ${userId}`);
        
        // =====================================================
        // STEP 2: Create or get test recipient
        // =====================================================
        console.log('\n📝 Step 2: Setting up test recipient...');
        
        let recipientId;
        const recipientResult = await client.query(
            `INSERT INTO recipients (user_id, name, phone_number, created_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (user_id, phone_number) DO UPDATE SET name = $2
            RETURNING recipient_id`,
            [userId, 'Test Recipient Kenya', '254712345678']
        );
        recipientId = recipientResult.rows[0].recipient_id;
        console.log(`   ✓ Recipient ID: ${recipientId}`);
        
        // =====================================================
        // STEP 3: Create test escrow
        // =====================================================
        console.log('\n📝 Step 3: Creating test escrow...');
        
        // Check if active escrow exists
        const existingEscrow = await client.query(
            `SELECT escrow_id, remaining_balance_usd_cents 
            FROM escrows 
            WHERE sender_user_id = $1 AND status = 'active' 
            ORDER BY created_at DESC LIMIT 1`,
            [userId]
        );
        
        let escrowId;
        if (existingEscrow.rows.length > 0) {
            escrowId = existingEscrow.rows[0].escrow_id;
            const balance = existingEscrow.rows[0].remaining_balance_usd_cents;
            console.log(`   ✓ Using existing escrow: ${escrowId}`);
            console.log(`   ✓ Balance: $${(balance / 100).toFixed(2)} USD`);
        } else {
            const escrowResult = await client.query(
                `INSERT INTO escrows (
                    sender_user_id,
                    recipient_id,
                    total_amount_usd_cents,
                    remaining_balance_usd_cents,
                    total_spent_usd_cents,
                    status,
                    expires_at,
                    created_at
                ) VALUES ($1, $2, $3, $4, 0, 'active', NOW() + INTERVAL '90 days', NOW())
                RETURNING escrow_id`,
                [userId, recipientId, 10000, 10000] // $100.00
            );
            escrowId = escrowResult.rows[0].escrow_id;
            console.log(`   ✓ Created new escrow: ${escrowId}`);
            console.log(`   ✓ Balance: $100.00 USD`);
            
            // Create spending category
            await client.query(
                `INSERT INTO spending_categories (
                    escrow_id,
                    category_name,
                    allocated_amount_usd_cents,
                    spent_amount_usd_cents,
                    remaining_amount_usd_cents
                ) VALUES ($1, $2, $3, 0, $4)`,
                [escrowId, CATEGORY, 10000, 10000]
            );
            console.log(`   ✓ Created ${CATEGORY} spending category: $100.00 USD`);
        }
        
        // =====================================================
        // STEP 4: Create or update agent authorization
        // =====================================================
        console.log('\n📝 Step 4: Setting up agent authorization...');
        
        const dailyLimitCents = Math.round(DAILY_LIMIT_USD * 100);
        
        const authResult = await client.query(
            `INSERT INTO agent_authorizations (
                escrow_id,
                agent_wallet_address,
                max_daily_usd_cents,
                spent_today_usd_cents,
                allowed_category,
                status,
                created_at,
                updated_at
            ) VALUES ($1, $2, $3, 0, $4, 'active', NOW(), NOW())
            ON CONFLICT (agent_wallet_address, escrow_id) 
            DO UPDATE SET
                max_daily_usd_cents = $3,
                spent_today_usd_cents = 0,
                allowed_category = $4,
                status = 'active',
                updated_at = NOW()
            RETURNING authorization_id`,
            [escrowId, AGENT_WALLET, dailyLimitCents, CATEGORY]
        );
        
        const authorizationId = authResult.rows[0].authorization_id;
        console.log(`   ✓ Authorization ID: ${authorizationId}`);
        console.log(`   ✓ Wallet: ${AGENT_WALLET}`);
        console.log(`   ✓ Daily Limit: $${DAILY_LIMIT_USD} USD`);
        console.log(`   ✓ Category: ${CATEGORY}`);
        console.log(`   ✓ Status: active`);
        
        await client.query('COMMIT');
        
        // =====================================================
        // STEP 5: Verify setup
        // =====================================================
        console.log('\n✅ Verification');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        const verification = await client.query(
            `SELECT 
                aa.authorization_id,
                aa.agent_wallet_address,
                aa.max_daily_usd_cents / 100.0 as daily_limit_usd,
                aa.spent_today_usd_cents / 100.0 as spent_today_usd,
                aa.allowed_category,
                aa.status,
                e.escrow_id,
                e.remaining_balance_usd_cents / 100.0 as escrow_balance_usd
            FROM agent_authorizations aa
            JOIN escrows e ON aa.escrow_id = e.escrow_id
            WHERE aa.agent_wallet_address = $1`,
            [AGENT_WALLET]
        );
        
        if (verification.rows.length > 0) {
            const auth = verification.rows[0];
            console.log(`Authorization: ${auth.authorization_id}`);
            console.log(`Escrow:        ${auth.escrow_id}`);
            console.log(`Agent Wallet:  ${auth.agent_wallet_address}`);
            console.log(`Category:      ${auth.allowed_category}`);
            console.log(`Daily Limit:   $${auth.daily_limit_usd}`);
            console.log(`Spent Today:   $${auth.spent_today_usd}`);
            console.log(`Status:        ${auth.status}`);
            console.log(`Escrow Balance: $${auth.escrow_balance_usd}`);
        }
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n✅ Setup Complete!');
        console.log('\n📋 Next Steps:');
        console.log('   1. Start backend:  npm run dev');
        console.log('   2. Run agent:      cd agent && npm start');
        console.log('   3. Watch logs for payment flow\n');
        
        return {
            userId,
            recipientId,
            escrowId,
            authorizationId
        };
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('\n❌ Setup failed:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

// =====================================================
// MAIN EXECUTION
// =====================================================

async function main() {
    try {
        // Test connection
        await pool.query('SELECT NOW()');
        console.log('✓ Database connection successful\n');
        
        // Setup test data
        const result = await setupTestData();
        
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
