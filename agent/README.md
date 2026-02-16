# KayaSend X402 Autonomous Agent

AI agent that autonomously discovers merchants, makes decisions, and pays Kenyan merchants via HTTP 402 paywall using x402 protocol.

## Overview

This agent demonstrates autonomous payments using the x402 protocol:
1. **Discover** - Fetches available merchants from API
2. **Decide** - Selects best option (cheapest in category)
3. **Pay** - Signs x402 payment and submits
4. **Receipt** - Displays settlement proof with M-Pesa details

## Architecture

```
KayaAgent
  │
  ├─ discoverMerchants()     → GET /api/v1/agent/merchants
  ├─ selectBestOption()      → Cheapest item algorithm
  ├─ orderFromMerchant()     → x402 payment flow
  │    ├─ Attempt 1: No payment → 402
  │    ├─ Sign authorization
  │    └─ Attempt 2: With payment → 200
  └─ displayReceipt()        → Show settlement details
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

Dependencies:
- `ethers@6.16.0` - Wallet and signing
- `axios@1.13.5` - HTTP requests
- `dotenv@17.3.1` - Environment configuration

### 2. Configure Environment

Copy `.env.example` to `.env` and update:

```bash
cp .env.example .env
```

**Required Configuration**:

```env
# Agent wallet (generate your own for production)
AGENT_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
AGENT_WALLET_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

# API endpoint
API_BASE_URL=http://localhost:3000

# Spending category
CATEGORY=utilities
```

**Available Categories**:
- `utilities` - Electricity (KPLC), Water (Nairobi Water)
- `food` - Groceries (Mama Jane's)
- `education` - School fees (Greenfield Primary)
- `healthcare` - Pharmacy (Kenyatta Pharmacy)

### 3. Database Authorization

The agent needs authorization in the database to make payments.

**Option A: Use provided SQL script**

```bash
# Connect to database
psql $DATABASE_URL

# Run setup script (update escrow_id first!)
\i ../scripts/setupAgentAuth.sql
```

**Option B: Manual insertion**

```sql
-- Get an existing escrow_id
SELECT escrow_id FROM escrows LIMIT 1;

-- Insert authorization
INSERT INTO agent_authorizations (
    escrow_id,
    agent_wallet_address,
    max_daily_usd_cents,
    allowed_category,
    status
) VALUES (
    'your-escrow-uuid',
    '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    5000,        -- $50 daily limit
    'utilities',
    'active'
);
```

## Usage

### Start Backend Server

In one terminal:

```bash
cd /home/ken/Projects/remit_backend
npm run dev
```

Wait for: `🚀 Server ready at http://localhost:3000`

### Run Agent

In another terminal:

```bash
cd /home/ken/Projects/remit_backend/agent
npm start
```

### Expected Output

```
🤖 KayaSend Agent Initialized
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Wallet:   0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
🎯 Category: utilities
🌐 API:      http://localhost:3000
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 Starting autonomous agent...

📡 STEP 1: Discovering merchants...
✅ Found 5 total merchants
✅ Found 2 merchants in "utilities" category

1. Kenya Power (KPLC) (Electricity utility - prepaid tokens)
   • Electricity Token - 500 KES: 500 KES / $3.85 USD
   • Electricity Token - 1000 KES: 1000 KES / $7.69 USD
   • Electricity Token - 2000 KES: 2000 KES / $15.38 USD
2. Nairobi Water (Water utility - bill payment)
   • Monthly Water Bill: 800 KES / $6.15 USD

🧠 STEP 2: Analyzing options...
✅ Decision made!
   Merchant:   Kenya Power (KPLC)
   Item:       Electricity Token - 500 KES
   Price:      500 KES ($3.85 USD)
   Reason:     Best value in utilities category

💳 STEP 3: Ordering from Kenya Power (KPLC)...
   → POST http://localhost:3000/api/v1/agent/merchant/merchant_kplc_001/order
   ← 402 Payment Required ✓

💰 Payment Details:
   Amount:    $3.85 USDC
   Network:   eip155:8453
   Asset:     0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

🔐 Signing payment authorization...
   Message: x402:merchant_kplc_001:kplc_token_500:385
   ✓ Signature: 0x1234...5678

🔄 Retrying with payment...
   ← 200 OK - Payment accepted! ✓

✅ PAYMENT COMPLETE!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏪 MERCHANT
   Name:        Kenya Power (KPLC)
   M-Pesa:      888880

📦 ITEM
   Name:        Electricity Token - 500 KES
   Price:       500 KES / $3.85 USD

💸 SETTLEMENT
   Transaction: abc-123-def
   M-Pesa Code: XYZ789
   Status:      processing
   Settled At:  2/16/2026, 3:45:00 PM

💰 BUDGET
   Spent Today:  $3.85 USD
   Remaining:    $46.15 USD
   Daily Limit:  $50.00 USD

✅ Agent task completed successfully!
```

## Error Scenarios

### 1. No Authorization in Database

```
❌ Payment rejected - Agent not authorized
   Status: 403
   Reason: No active authorization found for this agent wallet

💡 Fix: Add agent authorization to database
```

**Solution**: Run `setupAgentAuth.sql` with correct escrow_id

### 2. Insufficient Budget

```
❌ Payment rejected
   Reason: Insufficient daily budget. Requested: $15.38, Available: $5.00
```

**Solution**: Increase `max_daily_usd_cents` or wait for daily reset

### 3. Category Mismatch

```
❌ Payment rejected
   Reason: Agent not authorized for category "food". Allowed: "utilities"
```

**Solution**: Change `CATEGORY` in `.env` or update database authorization

### 4. API Unreachable

```
❌ Error discovering merchants: connect ECONNREFUSED 127.0.0.1:3000
```

**Solution**: Start the backend server first (`npm run dev`)

## X402 Protocol Flow

### 1. Initial Request (No Payment)

```http
POST /api/v1/agent/merchant/merchant_kplc_001/order
Content-Type: application/json

{
  "itemId": "kplc_token_500",
  "agentWallet": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "category": "utilities"
}
```

### 2. Server Response (402)

```http
HTTP/1.1 402 Payment Required
payment-required: {
  "x402Version": 2,
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:8453",
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "maxAmountRequired": "385",
    "payTo": "0x...",
    "resource": "/api/v1/agent/merchant/merchant_kplc_001/order"
  }]
}
```

### 3. Agent Signs Payment

```javascript
const message = `x402:${merchantId}:${itemId}:${amount}`;
const signature = await wallet.signMessage(message);
```

### 4. Retry with Payment

```http
POST /api/v1/agent/merchant/merchant_kplc_001/order
Content-Type: application/json
x-payment: {"signature":"0x...","amount":385,"network":"eip155:8453","asset":"0x833..."}

{
  "itemId": "kplc_token_500",
  "agentWallet": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "category": "utilities"
}
```

### 5. Server Response (200)

```http
HTTP/1.1 200 OK
payment-response: {"settled":true,"transactionId":"abc-123","mpesaTransactionCode":"XYZ789"}

{
  "success": true,
  "receipt": {
    "merchant": {...},
    "item": {...},
    "settlement": {...},
    "budget": {...}
  }
}
```

## Development

### Watch Mode

Auto-restart on file changes:

```bash
npm run dev
```

### Manual Testing

Test without running full agent:

```bash
# List merchants
curl http://localhost:3000/api/v1/agent/merchants

# Try order without payment (expect 402)
curl -X POST http://localhost:3000/api/v1/agent/merchant/merchant_kplc_001/order \
  -H "Content-Type: application/json" \
  -d '{"itemId":"kplc_token_500","agentWallet":"0xf39...","category":"utilities"}'
```

## Database Queries

### Check Agent Authorization

```sql
SELECT 
    authorization_id,
    agent_wallet_address,
    max_daily_usd_cents / 100.0 as daily_limit_usd,
    spent_today_usd_cents / 100.0 as spent_today_usd,
    allowed_category,
    status
FROM agent_authorizations
WHERE agent_wallet_address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
```

### Check Transaction History

```sql
SELECT 
    tx_id,
    merchant_name,
    amount_usd_cents / 100.0 as amount_usd,
    amount_kes_cents / 100.0 as amount_kes,
    mpesa_receipt,
    status,
    created_at
FROM agent_transactions
WHERE authorization_id = 'your-auth-id'
ORDER BY created_at DESC;
```

### Reset Daily Spending

```sql
UPDATE agent_authorizations
SET spent_today_usd_cents = 0, updated_at = NOW()
WHERE agent_wallet_address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
```

## Security Notes

⚠️ **TEST WALLET ONLY**: The default private key is from Hardhat's test accounts. Never use in production or with real funds.

For production:
1. Generate secure private key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Store in secure vault (AWS Secrets Manager, HashiCorp Vault)
3. Use environment-specific configurations
4. Enable ERC-3009 signature verification

## Troubleshooting

### Issue: "Wallet address mismatch"

**Cause**: Private key doesn't match the wallet address in config.

**Fix**: Generate address from private key:
```javascript
import { Wallet } from 'ethers';
const wallet = new Wallet('your-private-key');
console.log(wallet.address);
```

### Issue: "No merchants found for category"

**Cause**: Invalid category in `.env`.

**Fix**: Use one of: `utilities`, `food`, `education`, `healthcare`

### Issue: Daily limit exceeded

**Cause**: Agent spent more than `max_daily_usd_cents` today.

**Fix**: 
- Wait for automatic midnight reset (EAT timezone)
- Or manually reset: `UPDATE agent_authorizations SET spent_today_usd_cents = 0`

## Architecture Diagram

```
┌─────────────┐
│ KayaAgent   │
│  (Node.js)  │
└──────┬──────┘
       │
       │ 1. GET /merchants
       ├──────────────────────►┌─────────────────┐
       │                       │  Fastify API    │
       │◄──────────────────────┤  (Backend)      │
       │   Merchant list       └────────┬────────┘
       │                                │
       │ 2. POST /order (no payment)   │
       ├──────────────────────►        │
       │◄──────────────────────┤        │
       │   402 + challenge              │
       │                                │
       │ 3. Sign payment                │
       │    (ethers.js)                 │
       │                                │
       │ 4. POST /order + payment       │
       ├──────────────────────►        │
       │                         ┌──────▼──────────┐
       │                         │ Policy Service  │
       │                         │ - Validate auth │
       │                         │ - Deduct budget │
       │                         └──────┬──────────┘
       │                                │
       │                         ┌──────▼──────────┐
       │                         │ Pretium API     │
       │                         │ M-Pesa Disburse │
       │                         └──────┬──────────┘
       │                                │
       │◄──────────────────────┤        │
       │   200 + receipt         └────────────────┘
       │
       └─► Display receipt
```

## License

ISC
