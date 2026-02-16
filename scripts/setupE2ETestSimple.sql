-- =====================================================
-- X402 E2E TEST SETUP - SIMPLE SQL VERSION
-- =====================================================
-- Purpose: Create minimal test data for agent testing
-- Run: PGPASSWORD='Kikis_216' psql -h localhost -U postgres -d remit_production -f scripts/setupE2ETestSimple.sql
-- =====================================================

\echo '🔧 X402 E2E Test Setup (SQL)'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo ''

-- Test configuration
\set agent_wallet '''0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'''
\set category '''electricity'''
\set daily_limit_cents 5000
\set escrow_amount_cents 10000

BEGIN;

-- =====================================================
-- STEP 1: Create test user (with simple encryption placeholder)
-- =====================================================
\echo '📝 Step 1: Creating test user...'

-- For testing, we'll use simple placeholder encryption
-- In production, the app uses AES-256-GCM encryption
INSERT INTO users (
    user_id,
    privy_user_id,
    phone_number_encrypted,
    phone_number_hash,
    full_name_encrypted,
    email_encrypted,
    country_code,
    kyc_status,
    status,
    created_at,
    updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'did:privy:x402-test-sender',
    'ENCRYPTED:+254700000001',  -- Placeholder (real app uses AES-256-GCM)
    encode(sha256('+254700000001'::bytea), 'hex'),
    'ENCRYPTED:Test Sender',
    'ENCRYPTED:test@example.com',
    'US',
    'verified',
    'active',
    NOW(),
    NOW()
)
ON CONFLICT (privy_user_id) DO UPDATE 
SET updated_at = NOW();

\echo '   ✓ User created'

-- =====================================================
-- STEP 2: Create test recipient
-- =====================================================
\echo '📝 Step 2: Creating test recipient...'

INSERT INTO recipients (
    recipient_id,
    created_by_user_id,
    phone_number_encrypted,
    phone_number_hash,
    full_name_encrypted,
    country_code,
    is_verified,
    created_at,
    updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000002'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'ENCRYPTED:+254712345678',  -- Placeholder
    encode(sha256('+254712345678'::bytea), 'hex'),
    'ENCRYPTED:Test Recipient Kenya',
    'KE',
    true,
    NOW(),
    NOW()
)
ON CONFLICT (created_by_user_id, phone_number_hash) DO UPDATE
SET updated_at = NOW();

\echo '   ✓ Recipient created'

-- =====================================================
-- STEP 3: Create test escrow
-- =====================================================
\echo '📝 Step 3: Creating test escrow...'

-- Delete existing test escrow if it exists
DELETE FROM escrows WHERE escrow_id = '00000000-0000-0000-0000-000000000003'::uuid;

INSERT INTO escrows (
    escrow_id,
    sender_user_id,
    recipient_id,
    total_amount_usd_cents,
    remaining_balance_usd_cents,
    total_spent_usd_cents,
    status,
    expires_at,
    created_at,
    funded_at,
    activated_at,
    updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000003'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid,
    :escrow_amount_cents,
    :escrow_amount_cents,
    0,
    'active',
    NOW() + INTERVAL '90 days',
    NOW(),
    NOW(),
    NOW(),
    NOW()
);

\echo '   ✓ Escrow created: $100.00 USD'

-- =====================================================
-- STEP 4: Create spending category
-- =====================================================
\echo '📝 Step 4: Creating spending category...'

INSERT INTO spending_categories (
    escrow_id,
    category_name,
    allocated_amount_usd_cents,
    spent_amount_usd_cents,
    remaining_amount_usd_cents
) VALUES (
    '00000000-0000-0000-0000-000000000003'::uuid,
    :category,
    :escrow_amount_cents,
    0,
    :escrow_amount_cents
)
ON CONFLICT (escrow_id, category_name) DO UPDATE
SET allocated_amount_usd_cents = :escrow_amount_cents,
    remaining_amount_usd_cents = :escrow_amount_cents,
    spent_amount_usd_cents = 0;

\echo '   ✓ Category created: electricity $100.00 USD'

-- =====================================================
-- STEP 5: Create agent authorization
-- =====================================================
\echo '📝 Step 5: Creating agent authorization...'

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
    '00000000-0000-0000-0000-000000000003'::uuid,
    :agent_wallet,
    :daily_limit_cents,
    0,
    :category,
    'active',
    NOW(),
    NOW()
)
ON CONFLICT (agent_wallet_address, escrow_id) DO UPDATE
SET max_daily_usd_cents = :daily_limit_cents,
    spent_today_usd_cents = 0,
    allowed_category = :category,
    status = 'active',
    updated_at = NOW();

\echo '   ✓ Authorization created'

COMMIT;

-- =====================================================
-- VERIFICATION
-- =====================================================
\echo ''
\echo '✅ Verification'
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

SELECT 
    'Authorization' as type,
    aa.authorization_id::text as id,
    aa.agent_wallet_address as wallet,
    aa.allowed_category as category,
    (aa.max_daily_usd_cents / 100.0)::text || ' USD' as daily_limit,
    (aa.spent_today_usd_cents / 100.0)::text || ' USD' as spent_today,
    aa.status
FROM agent_authorizations aa
WHERE aa.agent_wallet_address = :agent_wallet;

\echo ''

SELECT 
    'Escrow' as type,
    e.escrow_id::text as id,
    e.status,
    (e.total_amount_usd_cents / 100.0)::text || ' USD' as total,
    (e.remaining_balance_usd_cents / 100.0)::text || ' USD' as remaining,
    (e.total_spent_usd_cents / 100.0)::text || ' USD' as spent
FROM escrows e
WHERE e.escrow_id = '00000000-0000-0000-0000-000000000003'::uuid;

\echo ''
\echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
\echo '✅ Setup Complete!'
\echo ''
\echo '📋 Next Steps:'
\echo '   1. Start backend:  npm run dev'
\echo '   2. Run agent:      cd agent && npm start'
\echo '   3. Watch logs for payment flow'
\echo ''
