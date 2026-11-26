import type { EventEmitter } from "node:events";

type RedisConnectionLogger = {
  error(fields: Record<string, unknown>): void;
  warn(fields: Record<string, unknown>): void;
};

export type RedisFailureDetails = {
  reason: string;
  code?: string;
  syscall?: string;
};

const REDIS_USERINFO = /rediss?:\/\/[^/\s@]*@/gi;
const SECRET_QUERY = /([?&#]password=)[^&\s#]+/gi;
const SAFE_TOKEN = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

// Plain strings only. An Error instance can carry command args (including
// AUTH material) and getter-only fields; the GlitchTip scrubber drops the
// whole event when walking those throws, which is how the redis-connect
// reason was lost before #495.
export function sanitizeRedisErrorText(value: string): string {
  return value
    .replace(REDIS_USERINFO, "redis://")
    .replace(SECRET_QUERY, "$1***")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export function redisFailureDetails(cause: unknown): RedisFailureDetails {
  const error =
    cause instanceof Error
      ? cause
      : new Error(sanitizeRedisErrorText(String(cause)));
  const code = safeToken(error, "code");
  const syscall = safeToken(error, "syscall");
  const reason =
    sanitizeRedisErrorText(error.message) || "unknown Redis connection error";
  return {
    reason,
    ...(code ? { code } : {}),
    ...(syscall ? { syscall } : {}),
  };
}

function safeToken(error: Error, key: "code" | "syscall"): string | undefined {
  const value = (error as Error & Record<string, unknown>)[key];
  return typeof value === "string" && SAFE_TOKEN.test(value)
    ? value
    : undefined;
}

// BullMQ forwards RedisConnection's error/close/ready events through its
// backend. Observe that backend before any command is sent so the first
// failed connect is logged too. One line per outage, plus one upgrade when a
// later event carries a syscall code the first line lacked.
export function observeRedisConnection(
  backend: Pick<EventEmitter, "on">,
  queue: string,
  logger: RedisConnectionLogger,
  isClosing: () => boolean = () => false,
): void {
  let hasConnected = false;
  let connectionFailed = false;
  let loggedGeneric = false;
  let loggedInformative = false;

  backend.on("error", (cause: unknown) => {
    if (isClosing()) return;
    connectionFailed = true;
    const failure = redisFailureDetails(cause);
    const informative =
      failure.code !== undefined || failure.syscall !== undefined;
    if (informative) {
      if (loggedInformative) return;
      loggedInformative = true;
    } else if (loggedGeneric || loggedInformative) {
      return;
    } else {
      loggedGeneric = true;
    }

    logger.error({
      event: "redis.connection_error",
      queue,
      ...failure,
      msg: `Redis connection failed: ${failure.reason}`,
    });
  });

  backend.on("close", () => {
    if (!hasConnected || isClosing()) return;
    connectionFailed = true;
    if (loggedGeneric || loggedInformative) return;
    loggedGeneric = true;

    logger.error({
      event: "redis.connection_closed",
      queue,
      msg: "Redis connection closed unexpectedly",
    });
  });

  backend.on("ready", () => {
    if (connectionFailed) {
      logger.warn({
        event: "redis.reconnected",
        queue,
        msg: "Redis connection re-established",
      });
    }
    hasConnected = true;
    connectionFailed = false;
    loggedGeneric = false;
    loggedInformative = false;
  });
}
