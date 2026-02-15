-- Migration: Create offramp_transactions table and add missing payment_requests columns
-- Run: psql <DATABASE_URL> -f src/db/05_offramp_and_payment_request_columns.sql

-- 1. Create offramp_transactions table
CREATE TABLE IF NOT EXISTS offramp_transactions (
    offramp_transaction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_request_id UUID NOT NULL REFERENCES payment_requests(payment_request_id),
    pretium_transaction_code VARCHAR(50) UNIQUE NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    amount_kes_cents BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    mpesa_receipt VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT offramp_amount_positive CHECK (amount_kes_cents > 0),
    CONSTRAINT offramp_status_check CHECK (status IN ('pending', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_offramp_payment_request ON offramp_transactions(payment_request_id);
CREATE INDEX IF NOT EXISTS idx_offramp_pretium_code ON offramp_transactions(pretium_transaction_code);

-- Reuse existing update_updated_at_column() trigger function
CREATE TRIGGER update_offramp_transactions_updated_at
    BEFORE UPDATE ON offramp_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Add missing columns to payment_requests
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS rejected_by_user_id UUID REFERENCES users(user_id);
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS onchain_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS onchain_transaction_hash VARCHAR(255);
