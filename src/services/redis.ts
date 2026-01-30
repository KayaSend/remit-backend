import { FastifyReply, FastifyRequest } from 'fastify';
import Redis from 'ioredis';

// Get Redis URL from environment (Upstash provides this)
const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;

// Only create Redis connection if URL is provided
export const redis = redisUrl 
  ? new Redis(redisUrl, {
      // Upstash requires these settings
      tls: {}, // Enable TLS/SSL
      connectTimeout: 15000,
      commandTimeout: 15000,
      retryStrategy: (times) => {
        if (times > 5) {
          console.log('Redis: Max retries reached');
          return null;
        }
        return Math.min(times * 100, 3000);
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    })
  : null; // No Redis connection if URL not provided

// Only add event handlers if Redis exists
if (redis) {
  redis.on('connect', () => {
    console.log('✅ Redis: Connected successfully');
  });

  redis.on('error', (error) => {
    console.error('❌ Redis error:', error.message);
  });

  redis.on('ready', () => {
    console.log('✅ Redis: Ready for commands');
  });

  redis.on('close', () => {
    console.log('🔌 Redis: Connection closed');
  });

  redis.on('reconnecting', (delay: number) => {
    console.log(`🔄 Redis: Reconnecting in ${delay}ms`);
  });
} else {
  console.log('⚠️ Redis: No REDIS_URL provided, running without Redis');
}

export async function withIdempotency(
  req: FastifyRequest,
  reply: FastifyReply,
  provider: string,
  transactionCode: string,
  handler: () => Promise<any>
) {
  const key = `webhook:${provider}:${transactionCode}`;

  // If no Redis, just run the handler
  if (!redis) {
    console.log('⚠️ Redis not available, skipping idempotency check');
    return handler();
  }

  try {
    const exists = await redis.exists(key);
    if (exists) {
      return reply.code(200).send({ ok: true, message: 'Already processed' });
    }

    await redis.set(key, '1', 'EX', 24 * 60 * 60);
    return handler();
  } catch (error) {
    console.error('Redis idempotency error:', error);
    // Fallback: process anyway if Redis fails
    return handler();
  }
}