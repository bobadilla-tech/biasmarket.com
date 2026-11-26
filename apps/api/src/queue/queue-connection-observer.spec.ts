import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { observeRedisConnection } from "@biasmarket/queue";
import { scrubOrDrop } from "@biasmarket/utils/sentry-scrub";

describe("observeRedisConnection", () => {
  it("logs connection failures and recovery as structured events", () => {
    const backend = new EventEmitter();
    const logger = { error: vi.fn(), warn: vi.fn() };
    const error = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
      syscall: "connect",
    });

    observeRedisConnection(backend, "orders", logger);

    backend.emit("ready");
    expect(logger.warn).not.toHaveBeenCalled();

    backend.emit("error", error);
    expect(logger.error).toHaveBeenCalledWith({
      event: "redis.connection_error",
      queue: "orders",
      code: "ECONNREFUSED",
      syscall: "connect",
      reason: "connect ECONNREFUSED",
      msg: "Redis connection failed: connect ECONNREFUSED",
    });
    backend.emit("error", error);
    expect(logger.error).toHaveBeenCalledTimes(1);

    backend.emit("close");
    backend.emit("ready");
    expect(logger.warn).toHaveBeenCalledWith({
      event: "redis.reconnected",
      queue: "orders",
      msg: "Redis connection re-established",
    });

    backend.emit("error", error);
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it("logs an established connection closing without an error", () => {
    const backend = new EventEmitter();
    const logger = { error: vi.fn(), warn: vi.fn() };

    observeRedisConnection(backend, "orders", logger);

    backend.emit("ready");
    backend.emit("close");
    backend.emit("close");

    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith({
      event: "redis.connection_closed",
      queue: "orders",
      msg: "Redis connection closed unexpectedly",
    });
    expect(logger.warn).not.toHaveBeenCalled();

    backend.emit("ready");
    expect(logger.warn).toHaveBeenCalledWith({
      event: "redis.reconnected",
      queue: "orders",
      msg: "Redis connection re-established",
    });
  });

  it("does not log an intentional queue shutdown", () => {
    const backend = new EventEmitter();
    const logger = { error: vi.fn(), warn: vi.fn() };
    let isClosing = false;

    observeRedisConnection(backend, "orders", logger, () => isClosing);

    backend.emit("ready");
    isClosing = true;
    backend.emit("error", new Error("Connection is closed."));
    backend.emit("close");

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs a scrubber-safe reason without the Redis password", () => {
    const backend = new EventEmitter();
    const logger = { error: vi.fn(), warn: vi.fn() };
    const secret = "super-secret-password";
    const error = Object.assign(
      new Error(`connect ECONNREFUSED redis://:${secret}@redis:6379`),
      { code: "ECONNREFUSED", syscall: "connect" },
    );

    observeRedisConnection(backend, "orders", logger);
    backend.emit("error", new Error("Connection is closed."));
    backend.emit("error", error);

    const payload = logger.error.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(payload.reason).toBe("connect ECONNREFUSED redis://redis:6379");
    expect(JSON.stringify(payload)).not.toContain(secret);
    const scrubbed = scrubOrDrop(payload, () => undefined);
    expect(scrubbed?.reason).toBe("connect ECONNREFUSED redis://redis:6379");
    expect(JSON.stringify(scrubbed)).not.toContain(secret);
  });
});
