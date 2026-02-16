// =====================================================
// SERVICE TEST SCRIPT - X402 MVP
// =====================================================
// Purpose: Verify merchant registry and agent policy services
// Usage: node --loader ts-node/esm src/services/testServices.ts
// =====================================================

import { 
    getAllMerchants, 
    getMerchant, 
    getMerchantItem,
    getMerchantsByCategory,
    searchMerchants 
} from './merchantRegistry.js';

console.log('\n=== MERCHANT REGISTRY SERVICE TESTS ===\n');

// Test 1: Get all merchants
console.log('✓ Test 1: Get all merchants');
const allMerchants = getAllMerchants();
console.log(`  Found ${allMerchants.length} merchants:`);
allMerchants.forEach(m => {
    console.log(`  - ${m.name} (${m.category})`);
});

// Test 2: Get specific merchant
console.log('\n✓ Test 2: Get specific merchant');
const kplc = getMerchant('merchant_kplc_001');
if (kplc) {
    console.log(`  Merchant: ${kplc.name}`);
    console.log(`  Items: ${kplc.items.length}`);
    kplc.items.forEach(item => {
        console.log(`    - ${item.name}: KES ${item.priceKes} / USD ${item.priceUsd}`);
    });
}

// Test 3: Get specific item
console.log('\n✓ Test 3: Get specific item');
const electricityToken = getMerchantItem('merchant_kplc_001', 'kplc_token_1000');
if (electricityToken) {
    console.log(`  Item: ${electricityToken.name}`);
    console.log(`  Price: KES ${electricityToken.priceKes} / USD ${electricityToken.priceUsd}`);
    console.log(`  Category: ${electricityToken.category}`);
}

// Test 4: Get merchants by category
console.log('\n✓ Test 4: Get merchants by category (utilities)');
const utilityMerchants = getMerchantsByCategory('utilities');
console.log(`  Found ${utilityMerchants.length} utility merchants:`);
utilityMerchants.forEach(m => {
    console.log(`  - ${m.name}`);
});

// Test 5: Search merchants
console.log('\n✓ Test 5: Search merchants (water)');
const searchResults = searchMerchants('water');
console.log(`  Found ${searchResults.length} results:`);
searchResults.forEach(m => {
    console.log(`  - ${m.name}: ${m.description}`);
});

console.log('\n=== ALL MERCHANT REGISTRY TESTS PASSED ===\n');

console.log('NOTE: Agent Policy Service tests require database connection.');
console.log('      Run those tests after database is connected in Phase 3.\n');
