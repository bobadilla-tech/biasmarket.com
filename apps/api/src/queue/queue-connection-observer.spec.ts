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

    backend.emit("close");
    backend.emit("ready");
    expect(logger.warn).toHaveBeenCalledWith({
      event: "redis.reconnected",
      queue: "orders",
      msg: "Redis connection re-established",
    });
  });
});
