import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redis = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

export const spendQueue = new Queue('usdc-spend', {
  connection:{ host: '127.0.0.1', port: 6379, },
});

