import { Test, type TestingModule } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bullmq";
import { ServiceUnavailableException } from "@nestjs/common";
import { type Mock, vi } from "vitest";
import { QUEUE_NAMES } from "@biasmarket/queue";
import { HealthController } from "./health.controller.js";
import { PrismaService } from "../../prisma/prisma.service.js";

describe("HealthController", () => {
  let controller: HealthController;
  let prisma: { $queryRaw: Mock };
  let redis: { status: string; ping: Mock };

  beforeEach(async () => {
    prisma = { $queryRaw: vi.fn() };
    redis = { status: "ready", ping: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        {
          provide: getQueueToken(QUEUE_NAMES.PING),
          useValue: { backend: { client: Promise.resolve(redis) } },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
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
});
