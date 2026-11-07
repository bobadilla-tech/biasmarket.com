import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { observeRedisConnection } from "@biasmarket/queue";

describe("observeRedisConnection", () => {
  it("logs connection failures and recovery as structured events", () => {
    const backend = new EventEmitter();
    const logger = { error: vi.fn(), warn: vi.fn() };
    const error = new Error("ECONNREFUSED");

    observeRedisConnection(backend, "orders", logger);

    backend.emit("ready");
    expect(logger.warn).not.toHaveBeenCalled();

    backend.emit("error", error);
    expect(logger.error).toHaveBeenCalledWith({
      event: "redis.connection_error",
      queue: "orders",
      err: error,
      msg: "Redis connection failed",
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
    backend.emit("close");

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
