-- =====================================================
-- X402 AGENT AUTHORIZATION - MINIMAL SCHEMA FOR MVP
-- =====================================================
-- Purpose: Enable AI agents to make autonomous payments
-- Design: Minimal viable schema for demo
-- =====================================================

-- =====================================================
-- TABLE: agent_authorizations
-- =====================================================
-- Purpose: Human-authorized agent spending permissions
-- MVP: Single category, basic budget tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS agent_authorizations (
    -- Identity
    authorization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relationships
    escrow_id UUID NOT NULL REFERENCES escrows(escrow_id) ON DELETE CASCADE,
    
    -- Agent Identity
    agent_wallet_address VARCHAR(255) NOT NULL,
    
    -- Spending Limits (in USD cents)
    max_daily_usd_cents BIGINT NOT NULL CHECK (max_daily_usd_cents > 0),
    spent_today_usd_cents BIGINT NOT NULL DEFAULT 0 CHECK (spent_today_usd_cents >= 0),
    
    -- Policy Control (MVP: single category only)
    allowed_category VARCHAR(50) NOT NULL,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'active' 
        CHECK (status IN ('active', 'paused', 'revoked', 'expired')),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT agent_auth_wallet_escrow_unique UNIQUE(agent_wallet_address, escrow_id)
);

-- Indexes for performance
CREATE INDEX idx_agent_auth_wallet ON agent_authorizations(agent_wallet_address) 
    WHERE status = 'active';
CREATE INDEX idx_agent_auth_escrow ON agent_authorizations(escrow_id) 
    WHERE status = 'active';
CREATE INDEX idx_agent_auth_status ON agent_authorizations(status);

-- Comments
COMMENT ON TABLE agent_authorizations IS 'AI agent spending permissions with budget caps (MVP)';
COMMENT ON COLUMN agent_authorizations.agent_wallet_address IS 'Agent wallet that signs x402 payments';
COMMENT ON COLUMN agent_authorizations.spent_today_usd_cents IS 'Resets daily at midnight EAT';
COMMENT ON COLUMN agent_authorizations.allowed_category IS 'Single category allowed (food, electricity, etc.)';

-- =====================================================
-- TABLE: agent_transactions
-- =====================================================
-- Purpose: Full audit trail of autonomous agent payments
-- MVP: Essential fields for demo and compliance
-- =====================================================

CREATE TABLE IF NOT EXISTS agent_transactions (
    -- Identity
    tx_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relationships
    authorization_id UUID NOT NULL REFERENCES agent_authorizations(authorization_id) ON DELETE CASCADE,
    
    -- Merchant Information
    merchant_id VARCHAR(100) NOT NULL,
    merchant_name VARCHAR(255) NOT NULL,
    
    -- Financial Amounts (in cents)
    amount_usd_cents BIGINT NOT NULL CHECK (amount_usd_cents > 0),
    amount_kes_cents BIGINT NOT NULL CHECK (amount_kes_cents > 0),
    
    -- Settlement
    mpesa_receipt VARCHAR(100),
    
    -- Status
    status VARCHAR(30) NOT NULL DEFAULT 'completed'
        CHECK (status IN ('pending', 'authorized', 'settling', 'completed', 'failed', 'rejected')),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_agent_tx_auth ON agent_transactions(authorization_id);
CREATE INDEX idx_agent_tx_merchant ON agent_transactions(merchant_id);
CREATE INDEX idx_agent_tx_status ON agent_transactions(status);
CREATE INDEX idx_agent_tx_created ON agent_transactions(created_at DESC);

-- Comments
COMMENT ON TABLE agent_transactions IS 'Audit trail of x402 agent payments (MVP)';
COMMENT ON COLUMN agent_transactions.mpesa_receipt IS 'M-Pesa confirmation code from Pretium';
COMMENT ON COLUMN agent_transactions.status IS 'Payment lifecycle status';

-- =====================================================
-- INDEXES AND CONSTRAINTS SUMMARY
-- =====================================================
-- agent_authorizations: 3 indexes (wallet, escrow, status)
-- agent_transactions: 4 indexes (auth, merchant, status, created)
-- Foreign keys: 2 (escrow_id, authorization_id)
-- Check constraints: 6 (amounts, status values)
-- =====================================================
