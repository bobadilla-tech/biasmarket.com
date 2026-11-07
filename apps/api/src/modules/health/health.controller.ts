import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { Queue } from "bullmq";
import { QUEUE_NAMES } from "@biasmarket/queue";
import { PrismaService } from "../../prisma/prisma.service.js";

const REDIS_HEALTH_TIMEOUT_MS = 2_000;

type RedisPingClient = { status: string; ping(): Promise<string> };

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Redis PING timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    timer.unref();

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.PING) private readonly pingQueue: Queue,
  ) {}

  @AllowAnonymous()
  @Get()
  async check() {
    const [db, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);
    const health = {
      status: db === "ok" && redis === "ok" ? "ok" : "error",
      db,
      redis,
    };

    if (health.status === "error") {
      throw new ServiceUnavailableException(health);
    }

    return health;
  }

  private async checkDatabase(): Promise<"ok" | "error"> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return "ok";
    } catch {
      return "error";
    }
  }

  private async checkRedis(): Promise<"ok" | "error"> {
    try {
      const ping = this.pingQueue.backend.client.then((client) => {
        const redis = client as unknown as RedisPingClient;
        if (redis.status !== "ready" && redis.status !== "connect") {
          throw new Error(`Redis connection is ${redis.status}`);
        }
        return redis.ping();
      });
      const response = await withTimeout(ping, REDIS_HEALTH_TIMEOUT_MS);
      if (response !== "PONG") {
        throw new Error("Redis PING returned an unexpected response");
      }
      return "ok";
    } catch (cause) {
      this.logger.error({
        event: "redis.health_check_failed",
        err: cause instanceof Error ? cause : new Error(String(cause)),
        msg: "Redis health check failed",
      });
      return "error";
    }
  }
}
