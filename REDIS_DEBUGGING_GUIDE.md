# Redis localhost Connection Issue - Debugging Guide

## Problem Summary
The application is attempting to connect to localhost Redis (127.0.0.1:6379) despite:
- REDIS_URL environment variable being set to Upstash
- Code checking for REDIS_URL before creating connections
- IORedis being used correctly in some files

## Root Causes Found

### 1. **Hardcoded localhost in BullMQ Queue Initialization** ⚠️
Two route files explicitly hardcode localhost connections in BullMQ Queue instantiation:

**File: `src/routes/escrows.ts:10-12`**
```typescript
const escrowQueue = new Queue('escrow-creation', { 
  connection: { host: '127.0.0.1', port: 6379 } 
});
```

**File: `src/routes/paymentRequests.ts:12-14`**
```typescript
const paymentQueue = new Queue('payment-confirmation', { 
  connection: { host: '127.0.0.1', port: 6379 } 
});
```

**Why this happens:**
- BullMQ Queue doesn't fall back to environment variables automatically
- Unlike the `spendQueue.ts` which checks `process.env.REDIS_URL`, these Queues always attempt connection
- Even if the connection fails, IORedis will try to connect to the default localhost

### 2. **Inconsistent Queue Connection Patterns**
The codebase has two different patterns for queue instantiation:

**Good Pattern** (in `src/queues/spendQueue.ts`):
```typescript
export const spendQueue = process.env.REDIS_URL ? new Queue('usdc-spend', {
  connection: { url: process.env.REDIS_URL },
}) : null;
```

**Good Pattern** (in `src/routes/blockchain.ts`):
```typescript
const adminQueue = process.env.REDIS_URL ? new Queue('escrow-refund', { 
  connection: { url: process.env.REDIS_URL }
}) : null;
```

**Bad Pattern** (in `src/routes/escrows.ts` and `src/routes/paymentRequests.ts`):
```typescript
const escrowQueue = new Queue('escrow-creation', { 
  connection: { host: '127.0.0.1', port: 6379 } 
});
```

---

## Common Sources of Hardcoded localhost Redis in Node.js Apps

1. **Copy-paste from tutorials** - Many examples use localhost for local development
2. **Default configurations** - BullMQ and IORedis don't default to env vars
3. **Inconsistent patterns** - Different developers use different connection methods
4. **Test environments** - Development code accidentally pushed to production
5. **Library defaults** - Some libraries connect to localhost if no URL provided
6. **Module-level initialization** - Connections created at import time before env vars are checked

---

## Why Environment Variables Might Not Load Properly

1. **Import Order Issue**: If `dotenv/config` isn't imported before other modules
   - Fixed in your code: `src/server.ts:1` imports `dotenv/config` first ✅

2. **Module-level Execution**: Queues initialized at import time
   - BullMQ connects immediately when Queue is instantiated
   - If route files are imported before env vars load, connection uses defaults

3. **NODE_ENV Mismatch**: Different env files for dev/test/prod
   - You have `.env` and `.env.test` but unclear which is being used

4. **String vs URL**: Connection URL format issues
   - `{ host, port }` vs `{ url }` have different behaviors
   - Upstash returns URLs like `redis://default:password@host:port`

---

## How to Completely Disable All Redis Connection Attempts

### Option 1: Use Environment Variable Guard (Recommended)
All Queue instantiations should be conditional:

```typescript
const escrowQueue = process.env.REDIS_URL 
  ? new Queue('escrow-creation', { connection: { url: process.env.REDIS_URL } }) 
  : null;
```

Then check before using:
```typescript
if (!escrowQueue) {
  return reply.code(503).send({ error: 'Queue service unavailable' });
}
await escrowQueue.add(...);
```

### Option 2: Disable via Env Variable
Set an explicit flag:
```typescript
const QUEUES_ENABLED = process.env.ENABLE_QUEUES === 'true' && process.env.REDIS_URL;

const escrowQueue = QUEUES_ENABLED 
  ? new Queue('escrow-creation', { connection: { url: process.env.REDIS_URL } })
  : null;
```

### Option 3: Never Import Queue Files Unless Needed
Create a separate module that's only imported when Redis is available:

```typescript
// services/queues.ts
export const getQueues = () => {
  if (!process.env.REDIS_URL) return null;
  return {
    escrowQueue: new Queue('escrow-creation', { connection: { url: process.env.REDIS_URL } }),
    paymentQueue: new Queue('payment-confirmation', { connection: { url: process.env.REDIS_URL } }),
  };
};
```

### Option 4: Set Redis Host to a Non-existent Address in Env
```bash
# In your environment when you don't want Redis
REDIS_URL="redis://disabled:disabled@127.0.0.1:1"  # Port 1 won't accept connections
```

**Problem with this approach**: Connection attempts will still happen and fail repeatedly

### Option 5: Use Try-Catch for Queue Operations
```typescript
async function queueIfPossible(queue, job, opts) {
  try {
    if (queue) await queue.add(job, opts);
  } catch (error) {
    console.warn('Queue unavailable:', error.message);
  }
}
```

---

## Simplest Way to Verify Redis is Being Used Correctly

### 1. **Check Environment Variable at Startup**
Add to `src/server.ts`:
```typescript
console.log('🔍 Redis Config:');
console.log('  REDIS_URL:', process.env.REDIS_URL ? '✅ SET' : '❌ NOT SET');
console.log('  Value:', process.env.REDIS_URL?.substring(0, 20) + '...' || 'undefined');
```

### 2. **Log Queue Connection Attempts**
Add before each Queue instantiation:
```typescript
console.log('📊 Queue Configuration for escrow-creation:');
console.log('  Using:', process.env.REDIS_URL ? 'Upstash (from env)' : 'DISABLED');
console.log('  Connection:', process.env.REDIS_URL 
  ? { url: process.env.REDIS_URL.substring(0, 30) + '...' }
  : 'null');
```

### 3. **Monitor Network Connections at Runtime**
While app is running (Linux):
```bash
# Watch for connections to 6379 (Redis default port)
lsof -i :6379

# Watch for all connections from your app
lsof -p $(pgrep -f "node.*server.ts")

# Check established connections
netstat -tupn | grep 6379
```

### 4. **Enable IORedis Debug Logging**
Add to `src/services/redis.ts`:
```typescript
const redis = redisUrl 
  ? new Redis(redisUrl, {
      ...options,
      lazyConnect: false, // Connect immediately
      enableOfflineQueue: true,
      enableReadyCheck: true,
      retryStrategy: (times) => {
        console.log(`[Redis] Retry attempt ${times}`);
        // ... rest
      }
    })
  : null;

// Add detailed logging
if (redis) {
  redis.on('connect', () => console.log('[Redis] 🟢 Connected'));
  redis.on('close', () => console.log('[Redis] 🔴 Closed'));
  redis.on('error', (err) => console.log('[Redis] ❌ Error:', err.code));
}
```

### 5. **Add BullMQ Queue Logging**
```typescript
const escrowQueue = process.env.REDIS_URL 
  ? new Queue('escrow-creation', { 
      connection: { url: process.env.REDIS_URL },
      settings: {
        // Enable debug mode
        enableOfflineQueue: true,
      }
    })
  : null;

if (escrowQueue) {
  escrowQueue.on('error', (err) => {
    console.error('[Queue] Error:', err.message);
  });
}
```

### 6. **One-line Health Check Endpoint**
```typescript
fastify.get('/debug/redis', async (reply) => {
  return {
    redis_url_set: !!process.env.REDIS_URL,
    redis_connection: redis ? 'connected' : 'null',
    queues: {
      escrow: escrowQueue ? 'enabled' : 'null',
      payment: paymentQueue ? 'enabled' : 'null',
      spend: spendQueue ? 'enabled' : 'null',
    },
  };
});
```

---

## Quick Diagnostic Checklist

- [ ] Is `dotenv/config` imported first in `server.ts`?
- [ ] Does `.env` file contain `REDIS_URL=redis://...`?
- [ ] Are ALL Queue instantiations conditional on `process.env.REDIS_URL`?
- [ ] Are you using `{ url: process.env.REDIS_URL }` not `{ host, port }`?
- [ ] Do Queues fall back to `null` when REDIS_URL is missing?
- [ ] Are all Queue operations wrapped with null checks?
- [ ] Is `lsof -i :6379` showing NO connections at startup?

---

## Priority Fixes

1. **URGENT**: Fix hardcoded localhost in `escrows.ts` and `paymentRequests.ts`
2. **HIGH**: Add startup logging to verify env vars are loaded
3. **HIGH**: Test with Redis disabled (remove REDIS_URL from env)
4. **MEDIUM**: Consolidate all Queue instantiation patterns
5. **MEDIUM**: Add health check endpoint for Redis status

---

## File-by-File Connection Analysis

| File | Pattern | Status |
|------|---------|--------|
| `src/services/redis.ts` | Conditional on REDIS_URL | ✅ Good |
| `src/queues/spendQueue.ts` | Conditional on REDIS_URL | ✅ Good |
| `src/routes/blockchain.ts` | Conditional on REDIS_URL | ✅ Good |
| `src/routes/escrows.ts` | **Hardcoded 127.0.0.1** | ❌ **BAD** |
| `src/routes/paymentRequests.ts` | **Hardcoded 127.0.0.1** | ❌ **BAD** |

