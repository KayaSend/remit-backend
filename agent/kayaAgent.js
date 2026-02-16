#!/usr/bin/env node
// =====================================================
// KAYASEND X402 AUTONOMOUS AGENT
// =====================================================
// Purpose: AI agent that autonomously pays Kenyan merchants
// Protocol: x402 (HTTP 402 Payment Required)
// Flow: Discover → Decide → Pay → Receipt
// =====================================================

import { Wallet } from 'ethers';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// =====================================================
// CONFIGURATION
// =====================================================

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';
const AGENT_WALLET_ADDRESS = process.env.AGENT_WALLET_ADDRESS;
const CATEGORY = process.env.CATEGORY || 'utilities';

if (!process.env.AGENT_PRIVATE_KEY) {
    console.error('❌ AGENT_PRIVATE_KEY not set in .env file');
    process.exit(1);
}

if (!AGENT_WALLET_ADDRESS) {
    console.error('❌ AGENT_WALLET_ADDRESS not set in .env file');
    process.exit(1);
}

// =====================================================
// KAYASEND AGENT CLASS
// =====================================================

class KayaAgent {
    constructor() {
        this.wallet = new Wallet(process.env.AGENT_PRIVATE_KEY);
        
        // Verify wallet address matches
        if (this.wallet.address.toLowerCase() !== AGENT_WALLET_ADDRESS.toLowerCase()) {
            console.error('❌ Wallet address mismatch!');
            console.error(`   Private key generates: ${this.wallet.address}`);
            console.error(`   Expected address:      ${AGENT_WALLET_ADDRESS}`);
            process.exit(1);
        }
        
        console.log('\n🤖 KayaSend Agent Initialized');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📍 Wallet:   ${this.wallet.address}`);
        console.log(`🎯 Category: ${CATEGORY}`);
        console.log(`🌐 API:      ${API_BASE}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    /**
     * STEP 1: Discover merchants
     * Fetch all merchants from the API and filter by category
     */
    async discoverMerchants() {
        console.log('\n📡 STEP 1: Discovering merchants...');
        
        try {
            const response = await axios.get(`${API_BASE}/api/v1/agent/merchants`);
            
            if (!response.data.success) {
                throw new Error('Failed to fetch merchants');
            }
            
            const allMerchants = response.data.merchants;
            const merchants = allMerchants.filter(m => m.category === CATEGORY);
            
            console.log(`✅ Found ${allMerchants.length} total merchants`);
            console.log(`✅ Found ${merchants.length} merchants in "${CATEGORY}" category\n`);
            
            if (merchants.length === 0) {
                console.error(`❌ No merchants found for category: ${CATEGORY}`);
                console.log('\nAvailable categories:');
                const categories = [...new Set(allMerchants.map(m => m.category))];
                categories.forEach(cat => {
                    const count = allMerchants.filter(m => m.category === cat).length;
                    console.log(`   - ${cat} (${count} merchants)`);
                });
                return [];
            }
            
            // Display merchants
            merchants.forEach((m, i) => {
                console.log(`${i + 1}. ${m.name} (${m.description})`);
                m.items.forEach(item => {
                    console.log(`   • ${item.name}: ${item.priceKes} KES / $${item.priceUsd} USD`);
                });
            });
            
            return merchants;
            
        } catch (error) {
            console.error('❌ Error discovering merchants:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', error.response.data);
            }
            throw error;
        }
    }

    /**
     * STEP 2: Select best option
     * Decision algorithm: Find cheapest item that meets needs
     */
    selectBestOption(merchants) {
        console.log('\n🧠 STEP 2: Analyzing options...');
        
        if (merchants.length === 0) {
            throw new Error('No merchants to choose from');
        }
        
        let bestOption = null;
        let bestPrice = Infinity;
        
        // Strategy: Select the cheapest option
        merchants.forEach(merchant => {
            merchant.items.forEach(item => {
                if (item.priceUsdCents < bestPrice) {
                    bestPrice = item.priceUsdCents;
                    bestOption = { merchant, item };
                }
            });
        });
        
        if (!bestOption) {
            throw new Error('No valid options found');
        }
        
        console.log(`✅ Decision made!`);
        console.log(`   Merchant:   ${bestOption.merchant.name}`);
        console.log(`   Item:       ${bestOption.item.name}`);
        console.log(`   Price:      ${bestOption.item.priceKes} KES ($${bestOption.item.priceUsd} USD)`);
        console.log(`   Reason:     Best value in ${CATEGORY} category`);
        
        return bestOption;
    }

    /**
     * STEP 3: Order from merchant (x402 flow)
     * First attempt: no payment (expect 402)
     * Second attempt: with payment signature
     */
    async orderFromMerchant(merchant, item) {
        console.log(`\n💳 STEP 3: Ordering from ${merchant.name}...`);
        
        const orderPayload = {
            itemId: item.itemId,
            agentWallet: AGENT_WALLET_ADDRESS,
            category: CATEGORY
        };
        
        const orderUrl = `${API_BASE}/api/v1/agent/merchant/${merchant.merchantId}/order`;
        
        try {
            // ============================================
            // ATTEMPT 1: Order without payment (expect 402)
            // ============================================
            console.log(`   → POST ${orderUrl}`);
            console.log(`   Body:`, JSON.stringify(orderPayload, null, 2));
            
            const response = await axios.post(orderUrl, orderPayload);
            
            // If we got 200 without payment challenge, something's wrong
            console.log('⚠️  Unexpected: Order completed without payment challenge');
            return response.data;
            
        } catch (error) {
            if (error.response && error.response.status === 402) {
                // ============================================
                // EXPECTED: 402 Payment Required
                // ============================================
                console.log('   ← 402 Payment Required ✓');
                
                // Extract payment requirements from header
                const paymentRequiredHeader = error.response.headers['payment-required'];
                if (!paymentRequiredHeader) {
                    throw new Error('402 response missing payment-required header');
                }
                
                const paymentRequired = JSON.parse(paymentRequiredHeader);
                const requirement = paymentRequired.accepts[0];
                
                console.log(`\n💰 Payment Details:`);
                console.log(`   Amount:    $${requirement.maxAmountRequired / 100} USDC`);
                console.log(`   Network:   ${requirement.network}`);
                console.log(`   Asset:     ${requirement.asset}`);
                console.log(`   Resource:  ${requirement.resource}`);
                
                // ============================================
                // Sign payment authorization
                // ============================================
                console.log(`\n🔐 Signing payment authorization...`);
                
                // MVP: Create simple signature (not ERC-3009 yet)
                const signatureMessage = `x402:${merchant.merchantId}:${item.itemId}:${requirement.maxAmountRequired}`;
                console.log(`   Message: ${signatureMessage}`);
                
                const signature = await this.wallet.signMessage(signatureMessage);
                console.log(`   ✓ Signature: ${signature.slice(0, 32)}...${signature.slice(-8)}`);
                
                // ============================================
                // ATTEMPT 2: Retry with payment proof
                // ============================================
                console.log(`\n🔄 Retrying with payment...`);
                
                const paymentHeader = {
                    signature,
                    amount: parseInt(requirement.maxAmountRequired),
                    network: requirement.network,
                    asset: requirement.asset
                };
                
                console.log(`   Header:`, JSON.stringify(paymentHeader, null, 2));
                
                try {
                    const paidResponse = await axios.post(
                        orderUrl,
                        orderPayload,
                        {
                            headers: {
                                'x-payment': JSON.stringify(paymentHeader)
                            }
                        }
                    );
                    
                    console.log('   ← 200 OK - Payment accepted! ✓');
                    return paidResponse.data;
                    
                } catch (retryError) {
                    console.error('\n❌ Payment rejected:');
                    if (retryError.response) {
                        console.error(`   Status: ${retryError.response.status}`);
                        console.error(`   Error:  ${retryError.response.data.error}`);
                        console.error(`   Reason: ${retryError.response.data.reason || retryError.response.data.message}`);
                    }
                    throw retryError;
                }
                
            } else if (error.response && error.response.status === 403) {
                // Agent not authorized
                console.error('\n❌ Payment rejected - Agent not authorized');
                console.error(`   Status: ${error.response.status}`);
                console.error(`   Reason: ${error.response.data.reason || error.response.data.message}`);
                console.log('\n💡 Fix: Add agent authorization to database:');
                console.log(`   Agent Wallet: ${AGENT_WALLET_ADDRESS}`);
                console.log(`   Category:     ${CATEGORY}`);
                throw error;
                
            } else {
                // Other error
                console.error('\n❌ Unexpected error:', error.message);
                if (error.response) {
                    console.error(`   Status: ${error.response.status}`);
                    console.error(`   Data:`, error.response.data);
                }
                throw error;
            }
        }
    }

    /**
     * STEP 4: Display receipt
     */
    displayReceipt(result) {
        console.log('\n✅ PAYMENT COMPLETE!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        const receipt = result.receipt;
        
        console.log('\n🏪 MERCHANT');
        console.log(`   Name:        ${receipt.merchant.name}`);
        console.log(`   ID:          ${receipt.merchant.id}`);
        console.log(`   M-Pesa:      ${receipt.merchant.mpesaNumber}`);
        
        console.log('\n📦 ITEM');
        console.log(`   Name:        ${receipt.item.name}`);
        console.log(`   Description: ${receipt.item.description}`);
        console.log(`   Price:       ${receipt.item.priceKes} KES / $${receipt.item.priceUsd} USD`);
        
        console.log('\n💸 SETTLEMENT');
        console.log(`   Transaction: ${receipt.transactionId}`);
        console.log(`   M-Pesa Code: ${receipt.settlement.mpesaTransactionCode}`);
        console.log(`   Status:      ${receipt.settlement.status}`);
        console.log(`   Settled At:  ${new Date(receipt.settlement.settledAt).toLocaleString()}`);
        
        console.log('\n💰 BUDGET');
        console.log(`   Spent Today:  $${receipt.budget.spent.toFixed(2)} USD`);
        console.log(`   Remaining:    $${receipt.budget.remaining.toFixed(2)} USD`);
        console.log(`   Daily Limit:  $${receipt.budget.dailyLimit.toFixed(2)} USD`);
        
        console.log('\n🔐 AUTHORIZATION');
        console.log(`   ID:          ${receipt.authorization.id}`);
        console.log(`   Category:    ${receipt.authorization.allowedCategory}`);
        
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ Agent task completed successfully!');
    }

    /**
     * Main execution flow
     */
    async run() {
        try {
            console.log('\n🚀 Starting autonomous agent...\n');
            
            // Step 1: Discover merchants
            const merchants = await this.discoverMerchants();
            
            if (merchants.length === 0) {
                console.error('\n❌ No merchants available in category. Exiting.');
                process.exit(1);
            }
            
            // Step 2: Select best option
            const { merchant, item } = this.selectBestOption(merchants);
            
            // Step 3: Order from merchant (x402 flow)
            const result = await this.orderFromMerchant(merchant, item);
            
            // Step 4: Display receipt
            if (result.success && result.receipt) {
                this.displayReceipt(result);
            } else {
                console.log('\n⚠️  Order completed but no receipt received');
                console.log(JSON.stringify(result, null, 2));
            }
            
            console.log('\n✅ Agent execution complete!\n');
            
        } catch (error) {
            console.error('\n❌ Agent execution failed:', error.message);
            process.exit(1);
        }
    }
}

// =====================================================
// MAIN EXECUTION
// =====================================================

const agent = new KayaAgent();
agent.run();
