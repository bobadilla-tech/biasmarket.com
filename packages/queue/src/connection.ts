import type { RedisOptions } from "bullmq";

const REDIS_CONNECT_TIMEOUT_MS = 5_000;
const REDIS_RETRY_MIN_DELAY_MS = 1_000;
const REDIS_RETRY_MAX_DELAY_MS = 20_000;

// GlitchTip's `redis-connect` span is Sentry's wrapper around ioredis
// `connect()`. The promise rejects with "Connection is closed." when the
// socket drops before `ready`; the cause (`ECONNREFUSED`, `ENOTFOUND`,
// `ETIMEDOUT`) is a separate `error` event. A healthy Redis (no rejected
// connections, no error replies) still looks like a reconnect storm in those
// samples: each BullMQ queue has its own client, successes connect once, and
// a client that never reaches Redis retries for the life of the process.
// The proof-upload throttler used to take ioredis' default delay
// (`min(times * 50, 2000)`), which is that storm.
//
// A delay of 0 reconnects immediately. Full jitter from 1s to 20s keeps every
// client retrying through a restart without lining up. Command errors must
// not call disconnect: socket loss already uses `retryStrategy`.
// `maxRetriesPerRequest: null` stays — BullMQ's blocking pops never resolve
// if ioredis retries them as commands.

export function redisRetryDelay(
  attempt: number,
  random: number = Math.random(),
): number {
  const safeAttempt = Number.isFinite(attempt)
    ? Math.max(1, Math.floor(attempt))
    : 1;
  const exponent = Math.min(safeAttempt - 1, 10);
  const ceiling = Math.min(
    REDIS_RETRY_MIN_DELAY_MS * 2 ** exponent,
    REDIS_RETRY_MAX_DELAY_MS,
  );
  const unit = Number.isFinite(random) ? Math.min(1, Math.max(0, random)) : 0;
  return (
    REDIS_RETRY_MIN_DELAY_MS +
    Math.round((ceiling - REDIS_RETRY_MIN_DELAY_MS) * unit)
  );
}

export function buildRedisConnection(): RedisOptions {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("Missing required env var: REDIS_URL");

  return {
    url,
    maxRetriesPerRequest: null,
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    retryStrategy: (attempt) => redisRetryDelay(attempt),
    reconnectOnError: () => false,
  };
}

// ioredis only parses a URL passed as a string. Putting `url` on the options
// object connects to 127.0.0.1 and retries there forever.
export function redisClientConfig(): {
  url: string;
  options: Omit<RedisOptions, "url">;
} {
  const built = buildRedisConnection();
  const url = built.url;
  if (!url) throw new Error("Missing required env var: REDIS_URL");
  const options = { ...built };
  delete options.url;
  return { url, options };
}
