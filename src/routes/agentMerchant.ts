// =====================================================
// X402 AGENT MERCHANT ROUTES - MVP
// =====================================================
// Purpose: HTTP 402 paywall endpoints for AI agent payments
// Design: x402 protocol for autonomous USDC -> M-Pesa settlements
// =====================================================

import { FastifyInstance } from 'fastify';
import { 
    getAllMerchants, 
    getMerchant, 
    getMerchantItem 
} from '../services/merchantRegistry.js';
import { 
    validateAgentPayment, 
    deductBudget, 
    logTransaction,
    updateTransactionStatus,
    refundBudget
} from '../services/agentPolicyService.js';
import { disburseKes } from '../services/pretiumDisburse.js';

// =====================================================
// TYPE DEFINITIONS
// =====================================================

interface OrderRequestBody {
    itemId: string;
    agentWallet: string;
    category: string;
}

interface PaymentHeader {
    signature?: string;
    amount: number;
    network: string;
    asset: string;
}

// =====================================================
// ROUTES
// =====================================================

export async function agentMerchantRoutes(fastify: FastifyInstance) {
    
    // =====================================================
    // GET /merchants - List all available merchants
    // =====================================================
    fastify.get('/merchants', async (request, reply) => {
        try {
            const merchants = getAllMerchants();
            
            return {
                success: true,
                count: merchants.length,
                merchants: merchants.map(m => ({
                    merchantId: m.merchantId,
                    name: m.name,
                    description: m.description,
                    category: m.category,
                    itemCount: m.items.length,
                    items: m.items.map(item => ({
                        itemId: item.itemId,
                        name: item.name,
                        description: item.description,
                        priceKes: item.priceKes,
                        priceUsd: item.priceUsd,
                        priceUsdCents: item.priceUsd * 100,
                        category: item.category
                    }))
                }))
            };
        } catch (error: any) {
            fastify.log.error('Error listing merchants:', error);
            return reply.code(500).send({
                success: false,
                error: 'Failed to retrieve merchants',
                message: error.message
            });
        }
    });

    // =====================================================
    // POST /merchant/:merchantId/order - X402 Payment Endpoint
    // =====================================================
    fastify.post<{
        Params: { merchantId: string };
        Body: OrderRequestBody;
    }>('/merchant/:merchantId/order', async (request, reply) => {
        const { merchantId } = request.params;
        const { itemId, agentWallet, category } = request.body;

        fastify.log.info({ merchantId, itemId, agentWallet, category }, 'X402 Order Request');

        // =====================================================
        // STEP 1: Validate merchant and item
        // =====================================================
        const merchant = getMerchant(merchantId);
        if (!merchant) {
            return reply.code(404).send({ 
                success: false,
                error: 'Merchant not found',
                merchantId 
            });
        }

        const item = getMerchantItem(merchantId, itemId);
        if (!item) {
            return reply.code(404).send({ 
                success: false,
                error: 'Item not found',
                itemId,
                merchantId
            });
        }

        const priceUsdCents = Math.round(item.priceUsd * 100);
        const priceKesCents = Math.round(item.priceKes * 100);

        // =====================================================
        // STEP 2: Check for payment header (x402 protocol)
        // =====================================================
        const paymentHeaderRaw = 
            request.headers['x-payment'] || 
            request.headers['payment-signature'];

        if (!paymentHeaderRaw) {
            // NO PAYMENT → Return HTTP 402 Payment Required
            fastify.log.info('No payment header - returning 402');

            const paymentRequiredHeader = {
                x402Version: 2,
                accepts: [{
                    scheme: 'exact',
                    network: 'eip155:8453', // Base mainnet
                    asset: process.env.BASE_USDC_CONTRACT || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
                    maxAmountRequired: priceUsdCents.toString(),
                    payTo: process.env.BACKEND_SETTLEMENT_WALLET || agentWallet,
                    resource: `/api/v1/agent/merchant/${merchantId}/order`,
                    description: `${merchant.name} - ${item.name} (${item.priceKes} KES)`
                }]
            };

            reply.code(402);
            reply.header('payment-required', JSON.stringify(paymentRequiredHeader));
            
            return {
                success: false,
                error: 'Payment Required',
                merchant: {
                    id: merchant.merchantId,
                    name: merchant.name
                },
                item: {
                    id: item.itemId,
                    name: item.name,
                    priceKes: item.priceKes,
                    priceUsd: item.priceUsd,
                    priceUsdCents
                },
                paymentRequired: paymentRequiredHeader
            };
        }

        // =====================================================
        // STEP 3: Parse payment header
        // =====================================================
        let paymentHeader: PaymentHeader;
        try {
            paymentHeader = typeof paymentHeaderRaw === 'string' 
                ? JSON.parse(paymentHeaderRaw)
                : paymentHeaderRaw;
        } catch (error) {
            fastify.log.error({ error }, 'Invalid payment header format');
            return reply.code(400).send({
                success: false,
                error: 'Invalid payment header format',
                message: 'Payment header must be valid JSON'
            });
        }

        // =====================================================
        // STEP 4: Validate agent authorization and budget
        // =====================================================
        fastify.log.info({ agentWallet, category, priceUsdCents }, 'Validating agent payment');
        
        let validation;
        try {
            validation = await validateAgentPayment(agentWallet, category, priceUsdCents);
        } catch (error: any) {
            fastify.log.error({ error }, 'Validation error');
            return reply.code(500).send({
                success: false,
                error: 'Payment validation failed',
                message: error.message
            });
        }

        if (!validation.allowed || !validation.authorization) {
            fastify.log.warn({ reason: validation.reason }, 'Payment rejected');
            return reply.code(403).send({
                success: false,
                error: 'Payment rejected',
                reason: validation.reason
            });
        }

        const authorization = validation.authorization;

        // =====================================================
        // STEP 5: Deduct budget atomically
        // =====================================================
        fastify.log.info({ 
            authorizationId: authorization.authorizationId,
            amount: priceUsdCents 
        }, 'Deducting budget');

        let budgetResult;
        try {
            budgetResult = await deductBudget(authorization.authorizationId, priceUsdCents);
        } catch (error: any) {
            fastify.log.error({ error }, 'Budget deduction error');
            return reply.code(500).send({
                success: false,
                error: 'Budget deduction failed',
                message: error.message
            });
        }

        if (!budgetResult.success) {
            fastify.log.warn({ reason: budgetResult.reason }, 'Insufficient budget');
            return reply.code(403).send({
                success: false,
                error: 'Insufficient budget',
                reason: budgetResult.reason,
                budget: {
                    spent: budgetResult.newSpentAmount,
                    remaining: budgetResult.remainingBudget
                }
            });
        }

        // =====================================================
        // STEP 6: Log transaction as pending
        // =====================================================
        let txId: string;
        try {
            txId = await logTransaction({
                authorizationId: authorization.authorizationId,
                merchantId: merchant.merchantId,
                merchantName: merchant.name,
                amountUsdCents: priceUsdCents,
                amountKesCents: priceKesCents,
                status: 'pending'
            });
            fastify.log.info({ txId }, 'Transaction logged');
        } catch (error: any) {
            fastify.log.error({ error }, 'Transaction logging error');
            
            // Refund budget since we failed to log
            await refundBudget(authorization.authorizationId, priceUsdCents);
            
            return reply.code(500).send({
                success: false,
                error: 'Transaction logging failed',
                message: error.message
            });
        }

        // =====================================================
        // STEP 7: Settle via M-Pesa (Pretium off-ramp)
        // =====================================================
        fastify.log.info({
            phone: merchant.mpesaNumber,
            amountKes: item.priceKes
        }, 'Disbursing to M-Pesa');

        let mpesaResult;
        try {
            // For MVP: Use a mock transaction hash since we don't have on-chain settlement yet
            const mockTxHash = `0x${Date.now().toString(16).padStart(64, '0')}`;
            
            mpesaResult = await disburseKes({
                phone: merchant.mpesaNumber,
                amountKes: item.priceKes,
                transactionHash: mockTxHash
            });

            fastify.log.info({ mpesaResult }, 'M-Pesa disbursement initiated');

            // Update transaction status to settling
            await updateTransactionStatus(
                txId,
                'settling',
                mpesaResult.transaction_code
            );

        } catch (error: any) {
            fastify.log.error({ error }, 'M-Pesa disbursement error');

            // Mark transaction as failed
            await updateTransactionStatus(txId, 'failed');

            // Refund budget
            await refundBudget(authorization.authorizationId, priceUsdCents);

            return reply.code(500).send({
                success: false,
                error: 'M-Pesa disbursement failed',
                message: error.message,
                txId
            });
        }

        // =====================================================
        // STEP 8: Return success with receipt
        // =====================================================
        const receipt = {
            transactionId: txId,
            merchant: {
                id: merchant.merchantId,
                name: merchant.name,
                mpesaNumber: merchant.mpesaNumber
            },
            item: {
                id: item.itemId,
                name: item.name,
                description: item.description,
                priceKes: item.priceKes,
                priceUsd: item.priceUsd
            },
            settlement: {
                mpesaTransactionCode: mpesaResult.transaction_code,
                status: mpesaResult.status,
                settledAt: new Date().toISOString()
            },
            budget: {
                spent: budgetResult.newSpentAmount / 100,
                remaining: budgetResult.remainingBudget / 100,
                dailyLimit: authorization.maxDailyUsdCents / 100
            },
            authorization: {
                id: authorization.authorizationId,
                allowedCategory: authorization.allowedCategory
            }
        };

        // Add x402 payment-response header
        reply.header('payment-response', JSON.stringify({
            settled: true,
            transactionId: txId,
            mpesaTransactionCode: mpesaResult.transaction_code
        }));

        fastify.log.info({ txId, receipt }, 'Payment completed successfully');

        return {
            success: true,
            message: 'Payment completed successfully',
            receipt
        };
    });
}
