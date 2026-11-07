import { Test, type TestingModule } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bullmq";
import { ServiceUnavailableException } from "@nestjs/common";
import { afterEach, type Mock, vi } from "vitest";
import { QUEUE_NAMES } from "@biasmarket/queue";
import { HealthController } from "./health.controller.js";
import { PrismaService } from "../../prisma/prisma.service.js";

describe("HealthController", () => {
  let controller: HealthController;
  let prisma: { $queryRaw: Mock };
  let redis: { status: string; ping: Mock };
  let queueBackend: { client: Promise<unknown> };

  beforeEach(async () => {
    prisma = { $queryRaw: vi.fn() };
    redis = { status: "ready", ping: vi.fn() };
    queueBackend = { client: Promise.resolve(redis) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        {
          provide: getQueueToken(QUEUE_NAMES.PING),
          useValue: { backend: queueBackend },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns ok when the database responds", async () => {
    prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    redis.ping.mockResolvedValue("PONG");

    await expect(controller.check()).resolves.toEqual({
      status: "ok",
      db: "ok",
      redis: "ok",
    });
  });

  it("reports database failure while still checking Redis", async () => {
    prisma.$queryRaw.mockRejectedValue(new Error("connection refused"));
    redis.ping.mockResolvedValue("PONG");

    let thrown: unknown;
    try {
      await controller.check();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ServiceUnavailableException);
    expect((thrown as ServiceUnavailableException).getResponse()).toEqual({
      status: "error",
      db: "error",
      redis: "ok",
    });
    expect(redis.ping).toHaveBeenCalledOnce();
  });

  it("fails health when Redis does not respond", async () => {
    prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    redis.ping.mockRejectedValue(new Error("connection refused"));

    let thrown: unknown;
    try {
      await controller.check();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ServiceUnavailableException);
    expect((thrown as ServiceUnavailableException).getResponse()).toEqual({
      status: "error",
      db: "ok",
      redis: "error",
    });
  });

  it("fails health when a database query remains pending", async () => {
    vi.useFakeTimers();
    prisma.$queryRaw.mockReturnValue(new Promise(() => {}));
    redis.ping.mockRejectedValue(new Error("connection refused"));

    const checkResult = controller.check().then(
      () => undefined,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(2_000);
    const thrown = await checkResult;

    expect(thrown).toBeInstanceOf(ServiceUnavailableException);
    expect((thrown as ServiceUnavailableException).getResponse()).toEqual({
      status: "error",
      db: "error",
      redis: "error",
    });
  });

  it("times out when the Redis client promise remains pending", async () => {
    vi.useFakeTimers();
    queueBackend.client = new Promise(() => {});
    prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const checkResult = controller.check().then(
      () => undefined,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(2_000);
    const thrown = await checkResult;

    expect(thrown).toBeInstanceOf(ServiceUnavailableException);
    expect((thrown as ServiceUnavailableException).getResponse()).toEqual({
      status: "error",
      db: "ok",
      redis: "error",
    });
    expect(redis.ping).not.toHaveBeenCalled();
  });

  it("reuses a Redis PING that remains pending after a health timeout", async () => {
    vi.useFakeTimers();
    prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    redis.ping.mockImplementation(() => new Promise(() => {}));

    const firstCheck = controller.check();
    const firstResult = expect(firstCheck).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(redis.ping).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(2_000);
    await firstResult;

    const secondCheck = controller.check();
    const secondResult = expect(secondCheck).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await vi.advanceTimersByTimeAsync(2_000);
    await secondResult;
    expect(redis.ping).toHaveBeenCalledOnce();
  });
});
