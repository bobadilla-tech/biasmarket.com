import type { ConnectionOptions } from "bullmq";

// Shared by both apps/api's producer connection and apps/workers' consumer
// connection so this setting can't drift between them. `maxRetriesPerRequest:
// null` is required on any connection a BullMQ Worker uses — the blocking
// BRPOPLPUSH-style calls it makes never resolve if ioredis auto-retries them,
// which surfaces as a silent stall, not a clear error.
export function buildRedisConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("Missing required env var: REDIS_URL");

  return {
    url,
    maxRetriesPerRequest: null,
  };
}
