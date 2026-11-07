import type { EventEmitter } from "node:events";

type RedisConnectionLogger = {
  error(fields: Record<string, unknown>): void;
  warn(fields: Record<string, unknown>): void;
};

// BullMQ forwards RedisConnection's error/close/ready events through its
// backend. Observe the backend before any command is sent so initial
// connection failures also receive a structured log line.
export function observeRedisConnection(
  backend: Pick<EventEmitter, "on">,
  queue: string,
  logger: RedisConnectionLogger,
  isClosing: () => boolean = () => false,
): void {
  let hasConnected = false;
  let connectionFailed = false;
  let failureLogged = false;

  backend.on("error", (cause: unknown) => {
    connectionFailed = true;
    if (failureLogged) return;
    failureLogged = true;

    const error = cause instanceof Error ? cause : new Error(String(cause));

    logger.error({
      event: "redis.connection_error",
      queue,
      err: error,
      msg: "Redis connection failed",
    });
  });

  backend.on("close", () => {
    if (!hasConnected || isClosing()) return;
    connectionFailed = true;
    if (failureLogged) return;
    failureLogged = true;

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
    failureLogged = false;
  });
}
