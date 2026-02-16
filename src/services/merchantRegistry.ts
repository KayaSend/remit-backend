// =====================================================
// MERCHANT REGISTRY SERVICE - X402 MOCK DATA
// =====================================================
// Purpose: Mock merchant catalog for hackathon demo
// Design: Hardcoded Kenyan merchants with items/prices
// Note: In production, this would be a database table
// =====================================================

export interface MerchantItem {
    itemId: string;
    name: string;
    description: string;
    priceKes: number;      // Price in KES (whole units, not cents)
    priceUsd: number;      // Price in USD (whole units, not cents)
    category: string;      // Maps to spending_categories
}

export interface Merchant {
    merchantId: string;
    name: string;
    description: string;
    category: string;      // Maps to spending_categories
    mpesaNumber: string;   // M-Pesa paybill/till number
    items: MerchantItem[];
}

// =====================================================
// MOCK MERCHANT DATA
// =====================================================

const MERCHANTS: Merchant[] = [
    {
        merchantId: 'merchant_kplc_001',
        name: 'Kenya Power (KPLC)',
        description: 'Electricity utility - prepaid tokens',
        category: 'electricity',
        mpesaNumber: '888880',  // KPLC paybill
        items: [
            {
                itemId: 'kplc_token_500',
                name: 'Electricity Token - 500 KES',
                description: 'Prepaid electricity units worth 500 KES',
                priceKes: 500,
                priceUsd: 3.85,
                category: 'electricity'
            },
            {
                itemId: 'kplc_token_1000',
                name: 'Electricity Token - 1000 KES',
                description: 'Prepaid electricity units worth 1000 KES',
                priceKes: 1000,
                priceUsd: 7.69,
                category: 'electricity'
            },
            {
                itemId: 'kplc_token_2000',
                name: 'Electricity Token - 2000 KES',
                description: 'Prepaid electricity units worth 2000 KES',
                priceKes: 2000,
                priceUsd: 15.38,
                category: 'electricity'
            }
        ]
    },
    {
        merchantId: 'merchant_nairobi_water_001',
        name: 'Nairobi Water',
        description: 'Water utility - bill payment',
        category: 'water',
        mpesaNumber: '444400',  // Nairobi Water paybill
        items: [
            {
                itemId: 'water_bill_monthly',
                name: 'Monthly Water Bill',
                description: 'Average monthly water bill payment',
                priceKes: 800,
                priceUsd: 6.15,
                category: 'water'
            }
        ]
    },
    {
        merchantId: 'merchant_mama_janes_001',
        name: "Mama Jane's Grocery",
        description: 'Local grocery store in Nairobi',
        category: 'food',
        mpesaNumber: '254712345678',  // Till number
        items: [
            {
                itemId: 'grocery_basic_weekly',
                name: 'Weekly Grocery Basket',
                description: 'Basic weekly groceries: rice, beans, vegetables, cooking oil',
                priceKes: 1500,
                priceUsd: 11.54,
                category: 'food'
            },
            {
                itemId: 'grocery_premium_weekly',
                name: 'Premium Weekly Basket',
                description: 'Premium groceries with meat, fruits, dairy',
                priceKes: 3000,
                priceUsd: 23.08,
                category: 'food'
            }
        ]
    },
    {
        merchantId: 'merchant_greenfield_school_001',
        name: 'Greenfield Primary School',
        description: 'Primary school in Kiambu',
        category: 'education',
        mpesaNumber: '254723456789',
        items: [
            {
                itemId: 'school_lunch_monthly',
                name: 'Monthly School Lunch Fee',
                description: 'One month of school lunch program',
                priceKes: 1200,
                priceUsd: 9.23,
                category: 'education'
            },
            {
                itemId: 'school_tuition_term',
                name: 'Termly Tuition Fee',
                description: 'One term tuition (3 months)',
                priceKes: 15000,
                priceUsd: 115.38,
                category: 'education'
            }
        ]
    },
    {
        merchantId: 'merchant_kenyatta_pharmacy_001',
        name: 'Kenyatta Community Pharmacy',
        description: 'Community pharmacy in Nairobi',
        category: 'medical',
        mpesaNumber: '254734567890',
        items: [
            {
                itemId: 'medicine_prescription_basic',
                name: 'Basic Prescription Medicines',
                description: 'Common medications and basic prescriptions',
                priceKes: 800,
                priceUsd: 6.15,
                category: 'medical'
            },
            {
                itemId: 'medicine_chronic_monthly',
                name: 'Chronic Condition Monthly Supply',
                description: 'Monthly supply for chronic conditions (diabetes, BP, etc)',
                priceKes: 2500,
                priceUsd: 19.23,
                category: 'medical'
            }
        ]
    }
];

// =====================================================
// SERVICE FUNCTIONS
// =====================================================

/**
 * Get all merchants in the registry
 */
export function getAllMerchants(): Merchant[] {
    return MERCHANTS;
}

/**
 * Get a specific merchant by ID
 */
export function getMerchant(merchantId: string): Merchant | null {
    return MERCHANTS.find(m => m.merchantId === merchantId) || null;
}

/**
 * Get a specific merchant item
 */
export function getMerchantItem(merchantId: string, itemId: string): MerchantItem | null {
    const merchant = getMerchant(merchantId);
    if (!merchant) return null;
    
    return merchant.items.find(item => item.itemId === itemId) || null;
}

/**
 * Get all merchants by category
 */
export function getMerchantsByCategory(category: string): Merchant[] {
    return MERCHANTS.filter(m => m.category === category);
}

/**
 * Get all items by category across all merchants
 */
export function getItemsByCategory(category: string): Array<MerchantItem & { merchantId: string; merchantName: string }> {
    const items: Array<MerchantItem & { merchantId: string; merchantName: string }> = [];
    
    for (const merchant of MERCHANTS) {
        for (const item of merchant.items) {
            if (item.category === category) {
                items.push({
                    ...item,
                    merchantId: merchant.merchantId,
                    merchantName: merchant.name
                });
            }
        }
    }
    
    return items;
}

/**
 * Search merchants by name or description
 */
export function searchMerchants(query: string): Merchant[] {
    const lowerQuery = query.toLowerCase();
    return MERCHANTS.filter(m => 
        m.name.toLowerCase().includes(lowerQuery) || 
        m.description.toLowerCase().includes(lowerQuery)
    );
}
