import { Queue } from 'bullmq';

// Only create queue if workers are enabled (saves Redis quota)
export const spendQueue = (process.env.ENABLE_WORKERS === 'true' && process.env.REDIS_URL)
  ? new Queue('usdc-spend', { connection: { url: process.env.REDIS_URL } })
  : null;

