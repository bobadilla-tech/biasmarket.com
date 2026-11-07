import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRedisConnection } from "../src/connection.ts";

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
    const previousRandom = Math.random;
    process.env.REDIS_URL = "redis://localhost:6379/0";
    Math.random = () => 0.5;

    try {
      const options = buildRedisConnection();
      assert.equal(options.url, "redis://localhost:6379/0");
      assert.equal(options.maxRetriesPerRequest, null);
      assert.equal(options.connectTimeout, 5_000);

      const retryStrategy = options.retryStrategy;
      assert.equal(typeof retryStrategy, "function");

      const delays = [1, 2, 3, 4, 5, 6, 10].map((attempt) =>
        retryStrategy(attempt),
      );

      assert.deepEqual(
        delays.slice(0, 6),
        [250, 500, 1_000, 2_000, 4_000, 5_000],
      );
      assert.ok(delays.every((delay) => delay > 0 && delay <= 5_000));
    } finally {
      Math.random = previousRandom;
      if (previousUrl === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = previousUrl;
    }
  });
});
