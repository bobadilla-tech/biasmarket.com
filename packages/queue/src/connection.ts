import { randomInt } from "node:crypto";
import type { RedisOptions } from "bullmq";

const REDIS_CONNECT_TIMEOUT_MS = 5_000;
const REDIS_RETRY_MIN_DELAY_MS = 1_000;
const REDIS_RETRY_MAX_DELAY_MS = 20_000;

function requiredRedisUrl(): URL {
  const value = process.env.REDIS_URL;
  if (!value) throw new Error("Missing required env var: REDIS_URL");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("REDIS_URL must be a valid redis:// or rediss:// URL");
  }
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use the redis:// or rediss:// scheme");
  }
  return url;
}

function redisEndpointOptions(url: URL): Omit<RedisOptions, "url"> {
  const database = url.pathname.replace(/^\//, "");
  if (database && !/^\d+$/.test(database)) {
    throw new Error("REDIS_URL database path must be a non-negative integer");
  }
  const db = database ? Number(database) : 0;

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    db,
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

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
  random: number = randomInt(0, 1_000_001) / 1_000_000,
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
  const url = requiredRedisUrl();

  return {
    ...redisEndpointOptions(url),
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
  const url = requiredRedisUrl();
  return {
    url: url.toString(),
    options: {
      maxRetriesPerRequest: null,
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      retryStrategy: (attempt: number) => redisRetryDelay(attempt),
      reconnectOnError: () => false,
    },
  };
}
