import type { ConnectionOptions } from "bullmq";

const REDIS_CONNECT_TIMEOUT_MS = 5_000;
const REDIS_RETRY_BASE_DELAY_MS = 250;
const REDIS_RETRY_MAX_DELAY_MS = 5_000;

// Shared by both apps/api's producer connection and apps/workers' consumer
// connection so this setting can't drift between them. `maxRetriesPerRequest:
// null` is required on any connection a BullMQ Worker uses — the blocking
// BRPOPLPUSH-style calls it makes never resolve if ioredis auto-retries them,
// which surfaces as a silent stall, not a clear error. Keep reconnects alive
// through Redis restarts, with a bounded connection timeout and capped,
// jittered backoff so parallel BullMQ clients don't all retry in lockstep.
export function buildRedisConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("Missing required env var: REDIS_URL");

  return {
    url,
    maxRetriesPerRequest: null,
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    retryStrategy: (attempt) => {
      const exponent = Math.min(Math.max(attempt - 1, 0), 4);
      const baseDelay = Math.min(
        REDIS_RETRY_BASE_DELAY_MS * 2 ** exponent,
        REDIS_RETRY_MAX_DELAY_MS,
      );
      const jitteredDelay = Math.round(baseDelay * (0.8 + Math.random() * 0.4));
      return Math.min(jitteredDelay, REDIS_RETRY_MAX_DELAY_MS);
    },
  };
}
