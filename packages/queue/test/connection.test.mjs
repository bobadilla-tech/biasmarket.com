import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EventEmitter } from "node:events";
import {
  buildRedisConnection,
  redisClientConfig,
  redisRetryDelay,
} from "../src/connection.ts";
import {
  observeRedisConnection,
  sanitizeRedisErrorText,
} from "../src/observe-redis-connection.ts";

describe("buildRedisConnection", () => {
  it("requires REDIS_URL", () => {
    const previousUrl = process.env.REDIS_URL;
    delete process.env.REDIS_URL;

    try {
      assert.throws(
        () => buildRedisConnection(),
        /Missing required env var: REDIS_URL/,
      );
    } finally {
      if (previousUrl === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = previousUrl;
    }
  });

  it("returns a bounded retry strategy and worker-compatible options", () => {
    const previousUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = "redis://:super-secret@redis:6379/0";

    try {
      const options = buildRedisConnection();
      assert.equal(options.url, undefined);
      assert.equal(options.host, "redis");
      assert.equal(options.port, 6379);
      assert.equal(options.password, "super-secret");
      assert.equal(options.db, 0);
      assert.equal(options.tls, undefined);
      assert.equal(options.maxRetriesPerRequest, null);
      assert.equal(options.connectTimeout, 5_000);
      assert.equal(options.reconnectOnError(), false);

      const retryStrategy = options.retryStrategy;
      assert.equal(typeof retryStrategy, "function");

      const atHalf = [1, 2, 3, 4, 5, 6, 30].map((attempt) =>
        redisRetryDelay(attempt, 0.5),
      );
      assert.deepEqual(
        atHalf,
        [1_000, 1_500, 2_500, 4_500, 8_500, 10_500, 10_500],
      );

      for (const attempt of [0, 1, 2, 5, 8, 30]) {
        const low = redisRetryDelay(attempt, 0);
        const high = redisRetryDelay(attempt, 1);
        assert.ok(low >= 1_000 && low <= 20_000);
        assert.ok(high >= 1_000 && high <= 20_000);
        assert.ok(low <= high);
        const fromStrategy = retryStrategy(attempt);
        assert.ok(fromStrategy >= 1_000 && fromStrategy <= 20_000);
      }

      assert.equal(redisRetryDelay(1, 0), 1_000);
      assert.equal(redisRetryDelay(1, 1), 1_000);
      assert.equal(redisRetryDelay(6, 1), 20_000);
      assert.equal(redisRetryDelay(Number.NaN, Number.NaN), 1_000);
    } finally {
      if (previousUrl === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = previousUrl;
    }
  });

  it("gives ioredis the URL as a string, not an options field", () => {
    const previousUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = "redis://:super-secret@redis:6379/0";

    try {
      const { url, options } = redisClientConfig();
      assert.equal(url, "redis://:super-secret@redis:6379/0");
      assert.equal(options.url, undefined);
      assert.equal(JSON.stringify(options).includes("super-secret"), false);
      assert.equal(options.maxRetriesPerRequest, null);
      const delay = options.retryStrategy(2);
      assert.ok(delay >= 1_000 && delay <= 2_000);
    } finally {
      if (previousUrl === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = previousUrl;
    }
  });

  it("parses encoded credentials and TLS endpoints for BullMQ options", () => {
    const previousUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = "rediss://worker%40app:p%3Ass@cache.example:6380/4";

    try {
      const options = buildRedisConnection();
      assert.equal(options.host, "cache.example");
      assert.equal(options.port, 6380);
      assert.equal(options.username, "worker@app");
      assert.equal(options.password, "p:ss");
      assert.equal(options.db, 4);
      assert.deepEqual(options.tls, {});
      assert.equal(options.url, undefined);
    } finally {
      if (previousUrl === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = previousUrl;
    }
  });
});

describe("redis connection logs", () => {
  it("strips credentials and keeps the failure reason", () => {
    const secret = "super-secret-password";
    assert.equal(
      sanitizeRedisErrorText(
        `connect ECONNREFUSED redis://:${secret}@redis:6379/0`,
      ),
      "connect ECONNREFUSED redis://redis:6379/0",
    );
    assert.equal(
      sanitizeRedisErrorText(`AUTH failed?password=${secret}&next=1`),
      "AUTH failed?password=***&next=1",
    );

    const backend = new EventEmitter();
    const logger = { error: () => {}, warn: () => {} };
    const errors = [];
    logger.error = (fields) => errors.push(fields);

    observeRedisConnection(backend, "orders", logger);
    const cause = new Error(
      `connect ECONNREFUSED redis://:${secret}@redis:6379`,
    );
    cause.code = "ECONNREFUSED";
    cause.syscall = "connect";
    backend.emit("error", new Error("Connection is closed."));
    backend.emit("error", cause);
    backend.emit("error", cause);

    assert.equal(errors.length, 2);
    assert.equal(errors[1].code, "ECONNREFUSED");
    assert.equal(errors[1].syscall, "connect");
    assert.equal(
      errors[1].msg,
      "Redis connection failed: connect ECONNREFUSED redis://redis:6379",
    );
    assert.equal(JSON.stringify(errors).includes(secret), false);
    assert.equal("err" in errors[0], false);
    assert.equal("err" in errors[1], false);
  });
});
