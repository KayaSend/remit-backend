# Remit Backend API

A production-ready TypeScript backend for cross-border remittance enabling category-based spending controls with blockchain transparency and M-Pesa integration.

**Production URL:** https://remit-backend-yblg.onrender.com

## Overview

The Remit Backend powers a remittance platform that allows diaspora workers to send money to Kenya with invoice-locked spending controls. Recipients can request payments against specific categories, and funds are disbursed instantly via M-Pesa, backed by blockchain-based USDC transactions on Base network.

## Core Features

- ✅ **Category-Based Escrow System**: Create escrows with spending allocations (food, rent, education, healthcare, etc.)
- ✅ **Blockchain Integration**: USDC transactions on Base L2 network for transparency and security
- ✅ **M-Pesa Integration**: Instant on-ramp (funding) and off-ramp (disbursement) via Pretium API
- ✅ **Daily Spending Limits**: Enforce per-category daily spending caps with automatic reset
- ✅ **Real-Time Payment Tracking**: Multi-stage payment status tracking with polling support
- ✅ **OTP Authentication**: Secure phone-based authentication using Privy
- ✅ **Job Queue System**: BullMQ with Redis for background processing
- ✅ **PII Encryption**: Application-level encryption for sensitive data
- ✅ **Comprehensive API**: 11 production endpoints with full documentation

## System Architecture

### Technology Stack

- **Runtime**: Node.js 22+ with TypeScript (ES2022 modules)
- **Web Framework**: Fastify (high-performance HTTP server)
- **Database**: PostgreSQL with connection pooling
- **Cache/Queue**: Redis with BullMQ for job processing
- **Blockchain**: Ethers.js for Base network (USDC escrow contracts)
- **Authentication**: Privy (OTP-based phone authentication)
- **Payment Gateway**: Pretium API for M-Pesa integration
- **Logging**: Pino with structured logging
- **Testing**: Vitest for unit and integration tests

### Project Structure

```
src/
├── server.ts                    # Application entry point
├── app.ts                       # Fastify app configuration
├── routes/                      # API endpoint handlers
│   ├── auth.ts                  # OTP authentication
│   ├── escrows.ts               # Escrow creation and management
│   ├── paymentRequests.ts       # Payment request handling
│   ├── recipients.ts            # Recipient dashboard data
│   ├── onramp.ts                # M-Pesa funding (STK push)
│   ├── offramp.ts               # M-Pesa disbursement
│   ├── blockchain.ts            # Blockchain queries and operations
│   ├── wallets.ts               # Wallet management
│   ├── pretiumWebhook.ts        # M-Pesa on-ramp webhooks
│   └── pretiumOfframpWebhook.ts # M-Pesa off-ramp webhooks
├── services/                    # Business logic layer
│   ├── database.ts              # PostgreSQL queries and transactions
│   ├── onchainService.ts        # Blockchain interaction (USDC escrow)
│   ├── contractEventMonitor.ts  # Blockchain event listener
│   ├── dailySpendService.ts     # Daily spending limit enforcement
│   ├── pretium.ts               # M-Pesa API integration
│   ├── pretiumDisburse.ts       # M-Pesa disbursement logic
│   └── redis.ts                 # Redis connection and caching
├── middleware/                  # Request middleware
│   └── auth.ts                  # JWT authentication middleware
├── workers/                     # Background job processors
│   └── usdcSpendingWorker.ts    # USDC payment processing
├── jobs/                        # Scheduled tasks
│   └── dailySpendReset.ts       # Daily limit reset cron job
├── blockchain/                  # Smart contract artifacts
│   ├── SimpleEscrowUSDC.json    # USDC escrow contract ABI
│   └── compile-usdc-escrow.ts   # Contract compilation script
├── db/                          # Database migrations
│   ├── 01_initial_schema.sql    # Core tables
│   ├── 02_spending_categories.sql
│   ├── 03_payment_requests.sql
│   └── 04_blockchain_integration.sql
├── types/                       # TypeScript definitions
│   └── index.ts                 # Shared type definitions
└── utils/                       # Utility functions
    ├── crypto.ts                # PII encryption/decryption
    ├── logger.ts                # Pino logger configuration
    └── validation.ts            # Input validation helpers
```

## Getting Started

### Prerequisites

- Node.js 22+ and npm
- PostgreSQL 14+
- Redis 7+
- Base network wallet with ETH (for gas) and USDC

### Installation

1. **Clone the repository:**
   ```bash
   git clone <YOUR_GIT_URL>
   cd remit_backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Update `.env` with your configuration (see [Environment Variables](#environment-variables) section).

4. **Set up the database:**
   ```bash
   # Create the database
   createdb remit_db
   
   # Run migrations
   psql -d remit_db -f src/db/01_initial_schema.sql
   psql -d remit_db -f src/db/02_spending_categories.sql
   psql -d remit_db -f src/db/03_payment_requests.sql
   psql -d remit_db -f src/db/04_blockchain_integration.sql
   ```

5. **Deploy smart contracts (optional for local development):**
   ```bash
   # Compile contract
   npx tsx src/blockchain/compile-usdc-escrow.ts
   
   # Deploy to Base network
   npx tsx scripts/deploy-usdc-escrow.ts
   
   # Update SIMPLE_ESCROW_ADDRESS in .env
   ```

6. **Start Redis:**
   ```bash
   redis-server
   ```

7. **Run the development server:**
   ```bash
   npm run dev
   ```

8. **Start background workers (in separate terminal):**
   ```bash
   npx tsx src/workers/usdcSpendingWorker.ts
   ```

The API will be available at `http://localhost:3000`

### Production Deployment

```bash
# Build TypeScript
npm run build

# Start production server
npm start
```

The build process compiles TypeScript to `dist/` and copies contract artifacts.

## API Endpoints

All endpoints are documented in detail in [FRONTEND_INTEGRATION_GUIDE.md](FRONTEND_INTEGRATION_GUIDE.md).

### Authentication
- `POST /auth/send-otp` - Send OTP to phone number
- `POST /auth/verify-otp` - Verify OTP and receive JWT token

### Escrow Management
- `POST /escrows/` - Create new escrow with categories
- `GET /escrows/:id` - Get escrow details and balances

### Payment Requests
- `POST /payment-requests` - Create payment request
- `GET /payment-requests/:id` - Get payment request status

### Recipients
- `GET /recipients/:id/daily-spend` - Get daily spending limits and usage

### On-Ramp (Funding)
- `POST /onramp/kes` - Initiate M-Pesa STK push for funding

### Off-Ramp (Disbursement)
- `POST /offramp/pay` - Disburse funds via M-Pesa

### Blockchain
- `GET /blockchain/status` - Check contract deployment status
- `GET /blockchain/escrow/:id` - Get blockchain escrow details
- `POST /blockchain/verify-payment` - Verify payment on blockchain
- `POST /blockchain/escrow/:id/refund` - Request escrow refund
- `GET /blockchain/events` - Get contract events
- `GET /blockchain/transactions/:id` - Get transaction history

### Webhooks
- `POST /webhooks/pretium` - M-Pesa on-ramp webhook
- `POST /webhooks/pretium-offramp` - M-Pesa off-ramp webhook

### Utilities
- `GET /health` - Health check endpoint
- `GET /transactions` - M-Pesa transaction history

## Environment Variables

Create a `.env` file with the following variables:

```bash
# Server
PORT=3000
NODE_ENV=development

# Database (PostgreSQL)
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=remit_db
DATABASE_USER=postgres
DATABASE_PASSWORD=your_password

# Redis
REDIS_URL=redis://127.0.0.1:6379

# Blockchain (Base Network)
BASE_RPC_URL=https://1rpc.io/base
BASE_USDC_CONTRACT=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
BASE_PRIVATE_KEY=0x...
SIMPLE_ESCROW_ADDRESS=0x...

# Authentication
PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret

# M-Pesa (Pretium API)
PRETIUM_API_URL=https://api.xwift.africa
PRETIUM_API_KEY=your_pretium_api_key

# Security
ENCRYPTION_KEY=your_64_character_hex_encryption_key
```

See [ENV_VARIABLES.md](ENV_VARIABLES.md) for complete documentation.

## Payment Flow

### Complete Transaction Lifecycle

1. **Sender Creates Escrow**
   - Frontend: `POST /escrows/` with categories and amounts
   - Backend: Creates database record, deploys blockchain escrow
   - Status: `pending_funding`

2. **Sender Funds Escrow**
   - Frontend: `POST /onramp/kes` initiates M-Pesa STK push
   - User: Completes M-Pesa payment on phone
   - Webhook: Pretium confirms payment
   - Backend: Converts KES to USDC, transfers to blockchain escrow
   - Status: `active`

3. **Recipient Requests Payment**
   - Frontend: `POST /payment-requests` with category and amount
   - Backend: Validates daily limits, creates payment request
   - Status: `pending`

4. **Blockchain Processing**
   - Worker: Processes payment from USDC escrow
   - Backend: Updates balances, tracks spending
   - Status: `onchain_done_offramp_pending`

5. **M-Pesa Disbursement**
   - Backend: `POST /offramp/pay` sends KES to recipient
   - M-Pesa: Delivers funds to phone number
   - Status: `completed`

### Status Flow

```
Payment Request Status:
pending → processing → onchain_done_offramp_pending → completed

Escrow Status:
pending_funding → active → depleted/expired
```

## Key Features Explained

### Category-Based Spending

Each escrow is divided into spending categories (e.g., food, rent, education). Recipients can only request payments within allocated category budgets, ensuring funds are used for intended purposes.

### Daily Spending Limits

Each category has a daily spending limit that resets at midnight EAT (East Africa Time). This prevents excessive spending and provides additional control for senders.

### Blockchain Transparency

All fund movements are recorded on Base network using USDC. The blockchain provides:
- Immutable audit trail
- Transparent balance tracking
- Secure escrow smart contracts
- Real-time verification

### PII Protection

All personally identifiable information (phone numbers, names) is encrypted at the application level using AES-256-GCM before storage in the database.

### Background Processing

BullMQ job queues handle:
- USDC spending transactions
- Daily limit resets
- Webhook retries
- Event monitoring

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test src/tests/auth.test.ts

# Test with coverage
npm test -- --coverage
```

See [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for API testing examples with cURL and JavaScript.

## Documentation

- **[FRONTEND_INTEGRATION_GUIDE.md](FRONTEND_INTEGRATION_GUIDE.md)** - Complete API documentation for frontend developers
- **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** - Developer cheat sheet with examples
- **[AGENTS.md](AGENTS.md)** - Development guidelines and best practices
- **[ENV_VARIABLES.md](ENV_VARIABLES.md)** - Environment configuration reference
- **[postman_collection.json](postman_collection.json)** - Postman collection for API testing

## Deployment

The backend is deployed on Render.com:

**Production URL:** https://remit-backend-yblg.onrender.com

See [DEPLOYMENT_SUCCESS.md](DEPLOYMENT_SUCCESS.md) and [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md) for deployment documentation.

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript to dist/
- `npm start` - Start production server
- `npm test` - Run test suite

## Security Considerations

- All PII is encrypted at rest using AES-256-GCM
- JWT tokens for API authentication
- Rate limiting on sensitive endpoints
- Input validation on all requests
- SQL injection prevention via parameterized queries
- CORS configured for production frontend
- Environment-based configuration
- Secure webhook signature verification

## Support

For integration questions or issues, refer to:
1. [FRONTEND_INTEGRATION_GUIDE.md](FRONTEND_INTEGRATION_GUIDE.md) for API documentation
2. [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for common patterns
3. GitHub issues for bug reports

## License

This project is private and proprietary.
