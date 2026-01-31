#!/bin/bash
# Quick Redis Connection Verification Script
# Usage: bash verify-redis-config.sh

echo "🔍 Redis Configuration Verification"
echo "===================================="
echo ""

# Check environment variable
if [ -z "$REDIS_URL" ]; then
    echo "❌ REDIS_URL is NOT set"
    echo "   → App will run WITHOUT Redis (no localhost connection attempts)"
else
    echo "✅ REDIS_URL is SET"
    # Parse URL
    if [[ $REDIS_URL =~ redis://([^:]+):?([0-9]*)@([^:]+):?([0-9]+)? ]]; then
        USER="${BASH_REMATCH[1]}"
        PASSWORD="${BASH_REMATCH[2]}"
        HOST="${BASH_REMATCH[3]}"
        PORT="${BASH_REMATCH[4]:-6379}"
        
        echo "   Host: $HOST"
        echo "   Port: $PORT"
        echo "   User: $USER"
        echo ""
        
        # Check if host is localhost (would be a problem)
        if [[ "$HOST" == "127.0.0.1" ]] || [[ "$HOST" == "localhost" ]]; then
            echo "⚠️  WARNING: Using localhost Redis"
            echo "   Make sure Redis is running locally:"
            echo "   → redis-server"
        else
            echo "✅ Using remote Redis: $HOST"
        fi
    else
        echo "   URL format: $REDIS_URL"
    fi
fi

echo ""
echo "📊 Current Network Connections to Redis Port"
echo "============================================="

# Check for any connections to 6379
if command -v lsof &> /dev/null; then
    CONNECTIONS=$(lsof -i :6379 2>/dev/null | wc -l)
    if [ "$CONNECTIONS" -gt 1 ]; then
        echo "⚠️  Found connections to port 6379:"
        lsof -i :6379 2>/dev/null | tail -n +2
    else
        echo "✅ No local connections to port 6379"
    fi
else
    echo "ℹ️  lsof not available, skipping connection check"
fi

echo ""
echo "📝 Files with Redis Configuration"
echo "=================================="

# Check each file for hardcoded localhost
check_file() {
    local file=$1
    local count=$(grep -c "127\.0\.0\.1.*6379\|localhost.*6379" "$file" 2>/dev/null || echo "0")
    
    if [ "$count" -gt 0 ]; then
        echo "❌ $file: Found hardcoded localhost (bad)"
        grep -n "127\.0\.0\.1.*6379\|localhost.*6379" "$file" 2>/dev/null | sed 's/^/   Line /'
    else
        if grep -q "process.env.REDIS_URL" "$file" 2>/dev/null; then
            echo "✅ $file: Uses environment variable (good)"
        fi
    fi
}

check_file "src/routes/escrows.ts"
check_file "src/routes/paymentRequests.ts"
check_file "src/routes/blockchain.ts"
check_file "src/queues/spendQueue.ts"
check_file "src/services/redis.ts"

echo ""
echo "🚀 Next Steps"
echo "============="
echo "1. Start the app: npm run dev"
echo "2. Look for these messages in the startup output:"
echo "   - 'Redis Setup: REDIS_URL: ✅ SET' (if using Redis)"
echo "   - 'Redis Setup: REDIS_URL: ❌ NOT SET' (if disabled)"
echo ""
echo "3. If no Redis, you should see:"
echo "   - '⚠️ Redis: No REDIS_URL provided, running without Redis'"
echo "   - NO error messages about 127.0.0.1:6379 connection"
echo ""
