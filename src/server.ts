import 'dotenv/config';
import { buildApp } from './app.js';

// 🔥 Workers disabled for demo — they burn Redis quota polling for jobs
// The payment flow works via direct HTTP calls (Pretium), no queues needed.
// To re-enable: set ENABLE_WORKERS=true in environment variables.
if (process.env.ENABLE_WORKERS === 'true' && process.env.REDIS_URL) {
  console.log('✅ Redis configured + ENABLE_WORKERS=true - initializing workers');
  import('./workers/usdcSpender.js');
  import('./workers/smartContractWorkers.js');
} else {
  console.log('⚠️ Workers disabled (ENABLE_WORKERS not set or no REDIS_URL) — saves Redis quota');
}

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

// 🔍 Log startup configuration for debugging
console.log('\n📋 Startup Configuration:');
console.log('  NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('  PORT:', PORT);
console.log('  HOST:', HOST);
console.log('  Redis Setup:');
console.log('    REDIS_URL:', process.env.REDIS_URL ? '✅ SET' : '❌ NOT SET');
if (process.env.REDIS_URL) {
  const redisUrl = process.env.REDIS_URL;
  const urlObj = new URL(redisUrl);
  console.log('    Redis Host:', urlObj.hostname);
  console.log('    Redis Port:', urlObj.port || '6379');
}
console.log('');

async function start() {
  try {
    const app = await buildApp();
    
    await app.listen({ 
      port: PORT, 
      host: HOST 
    });

    console.log(`
🚀 Server ready at http://localhost:${PORT}

Available endpoints:
  GET  /health
  POST /auth/send-otp
  POST /auth/verify-otp
  POST /escrows
  GET  /escrows/:id
  POST /payment-requests
  GET  /payment-requests/:id
  POST /webhooks/stripe
  POST /webhooks/mpesa
    `);
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

start();