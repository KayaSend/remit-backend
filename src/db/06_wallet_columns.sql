-- Add wallet columns to users table for Privy embedded wallet persistence
ALTER TABLE users
ADD COLUMN wallet_address VARCHAR(255),
ADD COLUMN wallet_chain_type VARCHAR(20) DEFAULT 'evm',
ADD COLUMN wallet_configured_at TIMESTAMPTZ;

CREATE INDEX idx_users_wallet_address ON users(wallet_address)
  WHERE wallet_address IS NOT NULL;
