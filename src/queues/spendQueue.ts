import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// Only create Redis connection if REDIS_URL is provided
const redis = process.env.REDIS_URL ? new IORedis(process.env.REDIS_URL) : null;

export const spendQueue = redis ? new Queue('usdc-spend', {
  connection: redis,
}) : null;

