import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRedisConnection } from "../src/connection.js";

describe("buildRedisConnection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("requires REDIS_URL", () => {
    vi.stubEnv("REDIS_URL", undefined);

    expect(() => buildRedisConnection()).toThrow(
      "Missing required env var: REDIS_URL",
    );
  });

  it("returns a bounded retry strategy and worker-compatible options", () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379/0");
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const options = buildRedisConnection();
    const retryStrategy = options.retryStrategy;

    expect(options.url).toBe("redis://localhost:6379/0");
    expect(options.maxRetriesPerRequest).toBeNull();
    expect(options.connectTimeout).toBe(5_000);
    expect(retryStrategy).toBeTypeOf("function");

    const delays = [1, 2, 3, 4, 5, 6, 10].map((attempt) =>
      retryStrategy!(attempt),
    );

    expect(delays.slice(0, 6)).toEqual([250, 500, 1_000, 2_000, 4_000, 5_000]);
    expect(
      delays.every(
        (delay) => typeof delay === "number" && delay > 0 && delay <= 5_000,
      ),
    ).toBe(true);
  });
});
