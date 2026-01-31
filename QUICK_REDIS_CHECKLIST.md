# Redis Connection Debugging - Quick Checklist

## 5-Minute Diagnosis

### 1. Check Environment Variable
```bash
echo $REDIS_URL
# If empty → Redis will be disabled
# If set  → Should look like: redis://default:PASSWORD@host.upstash.io:6379
```

### 2. Start App and Watch Logs
```bash
npm run dev 2>&1 | grep -i redis
```

**Expected if Redis is ENABLED:**
```
🔍 Redis Service Initialization:
  REDIS_URL provided: true
  Connecting to: your-host.upstash.io:6379
✅ Redis: Connected successfully
```

**Expected if Redis is DISABLED:**
```
🔍 Redis Service Initialization:
  REDIS_URL provided: false
  ⚠️ Running without Redis (REDIS_URL not set)
```

### 3. Check No Localhost Attempts
```bash
# In another terminal while app is running
lsof -i :6379

# Should show NOTHING (or only remote connections if Redis enabled)
# Should NOT show any 127.0.0.1 connections
```

### 4. Test Queue Operations
```bash
# Create an escrow with Redis disabled
curl -X POST http://localhost:3000/escrows \
  -H "Content-Type: application/json" \
  -d '{...}'

# Watch logs for:
# ✅ "⚠️ Redis not available, escrow creation queued skipped"
# OR
# ✅ "🚀 Escrow queued for blockchain creation"
```

---

## Root Cause Matrix

| Symptom | Cause | Solution |
|---------|-------|----------|
| Keeps connecting to 127.0.0.1:6379 | Hardcoded host/port | ✅ FIXED - Files now check REDIS_URL |
| REDIS_URL set but ignored | Module-level init | ✅ FIXED - Queues now conditional |
| Queue operations fail silently | No null check | ✅ FIXED - Added null checks |
| Can't disable Redis | Always creates connection | ✅ FIXED - Returns null if no URL |
| Wrong host even with REDIS_URL | Using host/port instead of URL | ✅ FIXED - Now uses { url } format |

---

## File-by-File Check

```bash
# Should see process.env.REDIS_URL check in each file:

grep "process.env.REDIS_URL" src/routes/escrows.ts
# ✅ Should find: const escrowQueue = process.env.REDIS_URL ? ...

grep "process.env.REDIS_URL" src/routes/paymentRequests.ts
# ✅ Should find: const paymentQueue = process.env.REDIS_URL ? ...

grep "process.env.REDIS_URL" src/routes/blockchain.ts
# ✅ Should find: const adminQueue = process.env.REDIS_URL ? ...

grep "process.env.REDIS_URL" src/queues/spendQueue.ts
# ✅ Should find: export const spendQueue = process.env.REDIS_URL ? ...

# Should NOT see these patterns anywhere:
grep -r "127\.0\.0\.1.*6379\|localhost.*6379" src/
# Should return: NO RESULTS
```

---

## Connection Flow Diagram

### Before Fix (WRONG) ❌
```
1. Import routes/escrows.ts
2. Queue created with 127.0.0.1:6379
3. IORedis connects to localhost immediately
4. REDIS_URL env var never checked
5. Upstash URL ignored
6. Result: Always connects to localhost
```

### After Fix (CORRECT) ✅
```
1. dotenv/config loads environment
2. REDIS_URL checked → found/not found
3. If found → Queue created with Upstash URL
   If not  → Queue set to null
4. Connection only attempted if Queue exists
5. Result: Respects REDIS_URL or gracefully disables
```

---

## Common Mistakes to Avoid

### ❌ DON'T: Hardcode connection details
```typescript
new Queue('name', { connection: { host: '127.0.0.1', port: 6379 } })
```

### ✅ DO: Check environment first
```typescript
const queue = process.env.REDIS_URL 
  ? new Queue('name', { connection: { url: process.env.REDIS_URL } })
  : null;
```

### ❌ DON'T: Assume Queue exists
```typescript
await queue.add(...)  // Crashes if queue is null
```

### ✅ DO: Check before using
```typescript
if (queue) {
  await queue.add(...)
}
```

### ❌ DON'T: Initialize at module root
```typescript
// routes/escrows.ts (top level)
const queue = new Queue(...)  // Always connects
```

### ✅ DO: Initialize with condition
```typescript
// routes/escrows.ts (top level)
const queue = process.env.REDIS_URL ? new Queue(...) : null  // Conditional
```

---

## Production Deployment Steps

1. **Set environment variable** (required if using queues)
   ```bash
   export REDIS_URL="redis://default:PASSWORD@host.upstash.io:6379"
   ```

2. **Deploy code** (from this repository with fixes)
   ```bash
   npm run build
   npm run start
   ```

3. **Verify startup logs**
   ```bash
   logs | grep "REDIS_URL\|Connecting to\|Running without"
   ```

4. **Monitor network (first 5 minutes)**
   ```bash
   lsof -i :6379 | watch -n 1
   # Should show only REMOTE connections, no 127.0.0.1
   ```

5. **Test one queue operation**
   ```bash
   # Create escrow or payment request
   # Check logs for queue confirmation
   ```

---

## Troubleshooting Decision Tree

```
Does app keep connecting to 127.0.0.1:6379?
├─ YES
│  ├─ Is REDIS_URL set in environment?
│  │  ├─ NO  → Set it: export REDIS_URL="redis://..."
│  │  └─ YES → Check if host/port was hardcoded
│  │           Files should be fixed now, try rebuilding
│  └─ Check: lsof -i :6379 (should show remote if Redis enabled)
│
└─ NO (Fixed! ✅)
   ├─ Queues are conditional on REDIS_URL
   ├─ No connection attempts without env var
   └─ Gracefully disables when Redis not needed
```

---

## Performance Notes

| Config | Connection Attempts | Queue Operations | Notes |
|--------|----------------------|------------------|-------|
| REDIS_URL set (Upstash) | 1 per app start | Full async | Full feature set |
| REDIS_URL not set | 0 | Skipped | Minimal operations only |
| Hardcoded localhost (before fix) | Repeated attempts | Failing | Errors and retries |

---

## References in Codebase

| Document | Purpose |
|----------|---------|
| `REDIS_DEBUGGING_GUIDE.md` | Comprehensive reference (read this if stuck) |
| `REDIS_FIX_SUMMARY.md` | What changed and verification steps |
| `verify-redis-config.sh` | Automated verification (run this to check) |
| `src/services/redis.ts` | IORedis service (handles Redis connection) |
| `src/routes/escrows.ts` | Escrow queue (FIXED) |
| `src/routes/paymentRequests.ts` | Payment queue (FIXED) |
| `src/routes/blockchain.ts` | Admin queues (already had correct pattern) |
| `src/queues/spendQueue.ts` | Spend queue (already had correct pattern) |

---

## Quick Status Check

Run this to verify everything is working:

```bash
# Terminal 1: Start app
npm run dev

# Terminal 2: Check in real-time
watch -n 1 'lsof -i :6379 2>/dev/null | wc -l'
# Should show 0 lines (no connections) if REDIS_URL not set
# Should show 1 line if connecting to Upstash
```

