-- =====================================================
-- AGENT AUTHORIZATION SETUP FOR TESTING
-- =====================================================
-- Purpose: Insert test agent authorization for MVP demo
-- Agent Wallet: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
-- Category: utilities
-- Daily Limit: $50.00 USD
-- =====================================================

-- IMPORTANT: Replace 'your-escrow-uuid-here' with an actual escrow_id from your database
-- To find an escrow: SELECT escrow_id FROM escrows LIMIT 1;

-- Insert agent authorization
INSERT INTO agent_authorizations (
    escrow_id,
    agent_wallet_address,
    max_daily_usd_cents,
    spent_today_usd_cents,
    allowed_category,
    status,
    created_at,
    updated_at
) VALUES (
    'your-escrow-uuid-here',  -- 🔴 REPLACE WITH ACTUAL ESCROW ID
    '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',  -- Test agent wallet
    5000,                      -- $50.00 daily limit (in cents)
    0,                        -- No spending yet
    'utilities',              -- Allowed category
    'active',                 -- Active status
    NOW(),
    NOW()
) ON CONFLICT (agent_wallet_address, escrow_id) 
DO UPDATE SET
    max_daily_usd_cents = 5000,
    spent_today_usd_cents = 0,
    allowed_category = 'utilities',
    status = 'active',
    updated_at = NOW();

-- Verify insertion
SELECT 
    authorization_id,
    agent_wallet_address,
    max_daily_usd_cents / 100.0 as daily_limit_usd,
    spent_today_usd_cents / 100.0 as spent_today_usd,
    allowed_category,
    status,
    created_at
FROM agent_authorizations
WHERE agent_wallet_address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

-- =====================================================
-- ALTERNATE: Create a test escrow first (if needed)
-- =====================================================
-- Uncomment below if you need to create a test escrow

/*
-- Create test user (sender)
INSERT INTO users (user_id, privy_did, wallet_address, created_at)
VALUES (
    gen_random_uuid(),
    'did:privy:test-sender',
    '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    NOW()
) ON CONFLICT (privy_did) DO NOTHING
RETURNING user_id;

-- Create test recipient
INSERT INTO recipients (recipient_id, user_id, name, phone_number, created_at)
VALUES (
    gen_random_uuid(),
    (SELECT user_id FROM users WHERE privy_did = 'did:privy:test-sender'),
    'Test Recipient',
    '254712345678',
    NOW()
) ON CONFLICT DO NOTHING
RETURNING recipient_id;

-- Create test escrow
INSERT INTO escrows (
    escrow_id,
    sender_user_id,
    recipient_id,
    total_amount_usd_cents,
    remaining_balance_usd_cents,
    total_spent_usd_cents,
    status,
    expires_at,
    created_at
) VALUES (
    gen_random_uuid(),
    (SELECT user_id FROM users WHERE privy_did = 'did:privy:test-sender'),
    (SELECT recipient_id FROM recipients LIMIT 1),
    10000,  -- $100.00
    10000,  -- $100.00 remaining
    0,      -- $0.00 spent
    'active',
    NOW() + INTERVAL '90 days',
    NOW()
) RETURNING escrow_id;

-- Now use the returned escrow_id in the agent authorization INSERT above
*/

-- =====================================================
-- NOTES
-- =====================================================
-- After inserting the authorization, you can test the agent:
--   cd /home/ken/Projects/remit_backend
--   npm run dev  (in one terminal)
--   cd agent && npm start  (in another terminal)
--
-- The agent should:
-- 1. Discover utilities merchants (KPLC, Nairobi Water)
-- 2. Select cheapest option
-- 3. Get 402 payment challenge
-- 4. Sign and submit payment
-- 5. Display receipt with M-Pesa transaction code
-- =====================================================
