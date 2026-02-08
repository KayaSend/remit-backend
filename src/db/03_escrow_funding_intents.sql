-- ESCROW FUNDING INTENTS
-- =====================================================
-- Purpose: Allow initiating M-Pesa/Pretium on-ramp BEFORE an escrow exists.
-- Escrow is created ONLY after webhook confirmation.
-- =====================================================

CREATE TABLE IF NOT EXISTS escrow_funding_intents (
  intent_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  sender_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,

  -- Escrow payload (stored so webhook can create escrow later)
  recipient_phone VARCHAR(32) NOT NULL,
  total_amount_usd_cents BIGINT NOT NULL,
  categories JSONB NOT NULL,
  memo TEXT,

  -- On-ramp request
  phone_number VARCHAR(20) NOT NULL,
  exchange_rate NUMERIC(10,4) NOT NULL,
  amount_kes_cents BIGINT NOT NULL,
  expected_usdc_cents BIGINT NOT NULL,
  settlement_address VARCHAR(255) NOT NULL,
  pretium_transaction_code VARCHAR(50) UNIQUE NOT NULL,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  webhook_payload JSONB,
  confirmed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,

  -- Linked escrow (set once created)
  escrow_id UUID REFERENCES escrows(escrow_id) ON DELETE RESTRICT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT escrow_funding_intents_amount_positive CHECK (
    total_amount_usd_cents > 0 AND amount_kes_cents > 0 AND expected_usdc_cents > 0
  ),
  CONSTRAINT escrow_funding_intents_status_check CHECK (
    status IN ('pending', 'confirmed', 'failed', 'timeout')
  )
);

CREATE INDEX IF NOT EXISTS idx_efi_sender ON escrow_funding_intents(sender_user_id);
CREATE INDEX IF NOT EXISTS idx_efi_status ON escrow_funding_intents(status);
CREATE INDEX IF NOT EXISTS idx_efi_created ON escrow_funding_intents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_efi_tx_code ON escrow_funding_intents(pretium_transaction_code);

CREATE TRIGGER update_escrow_funding_intents_updated_at
BEFORE UPDATE ON escrow_funding_intents
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
