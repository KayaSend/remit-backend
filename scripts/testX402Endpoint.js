#!/usr/bin/env node
// =====================================================
// X402 ENDPOINT MANUAL TEST SCRIPT
// =====================================================
// Purpose: Test X402 merchant endpoints without database
// Usage: node scripts/testX402Endpoint.js
// =====================================================

import axios from 'axios';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';
const AGENT_WALLET = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
const TEST_CATEGORY = 'utilities';

console.log('\n=== X402 ENDPOINT MANUAL TEST ===\n');
console.log('API Base:', API_BASE);
console.log('Agent Wallet:', AGENT_WALLET);
console.log('Category:', TEST_CATEGORY);
console.log('\n');

// =====================================================
// TEST 1: List merchants
// =====================================================
async function testListMerchants() {
    console.log('📋 TEST 1: List all merchants');
    console.log('GET /api/v1/agent/merchants\n');
    
    try {
        const response = await axios.get(`${API_BASE}/api/v1/agent/merchants`);
        
        console.log('✅ Status:', response.status);
        console.log('✅ Merchants found:', response.data.count);
        
        if (response.data.merchants && response.data.merchants.length > 0) {
            const merchant = response.data.merchants[0];
            console.log('\n📦 Sample merchant:');
            console.log('  ID:', merchant.merchantId);
            console.log('  Name:', merchant.name);
            console.log('  Category:', merchant.category);
            console.log('  Items:', merchant.itemCount);
            
            if (merchant.items && merchant.items.length > 0) {
                const item = merchant.items[0];
                console.log('\n  Sample item:');
                console.log('    ID:', item.itemId);
                console.log('    Name:', item.name);
                console.log('    Price:', `${item.priceKes} KES / $${item.priceUsd} USD`);
            }
        }
        
        return response.data.merchants;
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', error.response.data);
        }
        throw error;
    }
}

// =====================================================
// TEST 2: Order without payment (expect 402)
// =====================================================
async function testOrderWithoutPayment(merchantId, itemId) {
    console.log('\n\n💳 TEST 2: Order without payment header (expect 402)');
    console.log(`POST /api/v1/agent/merchant/${merchantId}/order\n`);
    
    const orderPayload = {
        itemId,
        agentWallet: AGENT_WALLET,
        category: TEST_CATEGORY
    };
    
    console.log('Request body:', JSON.stringify(orderPayload, null, 2));
    
    try {
        const response = await axios.post(
            `${API_BASE}/api/v1/agent/merchant/${merchantId}/order`,
            orderPayload
        );
        
        console.log('⚠️  Unexpected success (should get 402)');
        console.log('Status:', response.status);
        console.log('Data:', response.data);
        
    } catch (error) {
        if (error.response && error.response.status === 402) {
            console.log('✅ Got expected 402 Payment Required');
            console.log('✅ Status:', error.response.status);
            
            const paymentRequired = error.response.headers['payment-required'];
            if (paymentRequired) {
                const parsed = JSON.parse(paymentRequired);
                console.log('\n📄 Payment Required Header:');
                console.log('  x402Version:', parsed.x402Version);
                console.log('  Network:', parsed.accepts[0].network);
                console.log('  Asset:', parsed.accepts[0].asset);
                console.log('  Amount (cents):', parsed.accepts[0].maxAmountRequired);
                console.log('  Resource:', parsed.accepts[0].resource);
                console.log('  Description:', parsed.accepts[0].description);
                
                return parsed.accepts[0];
            }
        } else {
            console.error('❌ Unexpected error:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', error.response.data);
            }
            throw error;
        }
    }
}

// =====================================================
// TEST 3: Order with payment (will fail without auth)
// =====================================================
async function testOrderWithPayment(merchantId, itemId, paymentRequirement) {
    console.log('\n\n💰 TEST 3: Order with payment header');
    console.log('NOTE: This will fail with 403 because agent authorization is not set up in DB');
    console.log(`POST /api/v1/agent/merchant/${merchantId}/order\n`);
    
    const orderPayload = {
        itemId,
        agentWallet: AGENT_WALLET,
        category: TEST_CATEGORY
    };
    
    const paymentHeader = {
        signature: 'mock_signature_for_testing_0x123456789abcdef',
        amount: parseInt(paymentRequirement.maxAmountRequired),
        network: paymentRequirement.network,
        asset: paymentRequirement.asset
    };
    
    console.log('Request body:', JSON.stringify(orderPayload, null, 2));
    console.log('Payment header:', JSON.stringify(paymentHeader, null, 2));
    
    try {
        const response = await axios.post(
            `${API_BASE}/api/v1/agent/merchant/${merchantId}/order`,
            orderPayload,
            {
                headers: {
                    'x-payment': JSON.stringify(paymentHeader)
                }
            }
        );
        
        console.log('✅ Payment accepted!');
        console.log('Status:', response.status);
        console.log('\n📧 Receipt:');
        console.log(JSON.stringify(response.data.receipt, null, 2));
        
        const paymentResponse = response.headers['payment-response'];
        if (paymentResponse) {
            console.log('\n📄 Payment Response Header:');
            console.log(JSON.parse(paymentResponse));
        }
        
    } catch (error) {
        if (error.response && error.response.status === 403) {
            console.log('⚠️  Expected 403: Agent not authorized');
            console.log('Reason:', error.response.data.reason);
            console.log('\n💡 To fix: Insert agent authorization into database:');
            console.log(`   Agent Wallet: ${AGENT_WALLET}`);
            console.log(`   Category: ${TEST_CATEGORY}`);
        } else {
            console.error('❌ Unexpected error:', error.message);
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', JSON.stringify(error.response.data, null, 2));
            }
        }
    }
}

// =====================================================
// RUN ALL TESTS
// =====================================================
async function runTests() {
    try {
        // Test 1: List merchants
        const merchants = await testListMerchants();
        
        if (!merchants || merchants.length === 0) {
            console.log('\n❌ No merchants found. Cannot continue tests.');
            return;
        }
        
        // Find a utilities merchant for testing
        const utilityMerchant = merchants.find(m => m.category === TEST_CATEGORY);
        if (!utilityMerchant) {
            console.log(`\n❌ No ${TEST_CATEGORY} merchant found. Cannot continue tests.`);
            return;
        }
        
        const testMerchantId = utilityMerchant.merchantId;
        const testItemId = utilityMerchant.items[0].itemId;
        
        // Test 2: Order without payment (expect 402)
        const paymentRequirement = await testOrderWithoutPayment(testMerchantId, testItemId);
        
        if (!paymentRequirement) {
            console.log('\n❌ No payment requirement received. Cannot continue tests.');
            return;
        }
        
        // Test 3: Order with payment (will fail without DB setup)
        await testOrderWithPayment(testMerchantId, testItemId, paymentRequirement);
        
        console.log('\n\n=== TEST SUMMARY ===');
        console.log('✅ Test 1: List merchants - PASSED');
        console.log('✅ Test 2: 402 Payment Required - PASSED');
        console.log('⚠️  Test 3: Payment processing - EXPECTED FAILURE (no DB auth)');
        console.log('\n💡 Next steps:');
        console.log('   1. Insert agent authorization into database');
        console.log('   2. Run test again to verify full payment flow');
        console.log('   3. Check agent_transactions table for audit trail\n');
        
    } catch (error) {
        console.error('\n\n❌ Tests failed:', error.message);
        process.exit(1);
    }
}

// Run tests
runTests();
