import { FastifyReply, FastifyRequest } from 'fastify';
import Redis from 'ioredis';

export const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  connectTimeout: 10000,
});



export async function withIdempotency(
  req: FastifyRequest,
  reply: FastifyReply,
  provider: string,
  transactionCode: string,
  handler: () => Promise<any>
) {
  const key = `webhook:${provider}:${transactionCode}`;

  const exists = await redis.exists(key);
  if (exists) {
    // Already processed
    return reply.code(200).send({ ok: true, message: 'Already processed' });
  }

  // Set key with 24h TTL
  await redis.set(key, '1', 'EX', 24 * 60 * 60);

  // Proceed with original handler
  return handler();
}
//end of the file