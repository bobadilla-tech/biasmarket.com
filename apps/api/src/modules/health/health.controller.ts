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

const HEALTH_CHECK_TIMEOUT_MS = 2_000;

type RedisPingClient = { status: string; ping(): Promise<string> };

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)),
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
  private redisPingPromise: Promise<string> | null = null;

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
      await withTimeout(
        this.prisma.$queryRaw`SELECT 1`,
        HEALTH_CHECK_TIMEOUT_MS,
        "Database health check",
      );
      return "ok";
    } catch {
      return "error";
    }
  }

  private async checkRedis(): Promise<"ok" | "error"> {
    try {
      const response = await withTimeout(
        this.getRedisPing(),
        HEALTH_CHECK_TIMEOUT_MS,
        "Redis PING",
      );
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

  private getRedisPing(): Promise<string> {
    if (!this.redisPingPromise) {
      const ping = this.pingQueue.backend.client.then((client) => {
        const redis = client as unknown as RedisPingClient;
        if (redis.status !== "ready" && redis.status !== "connect") {
          throw new Error(`Redis connection is ${redis.status}`);
        }
        return redis.ping();
      });

      // Keep a timed-out PING shared until Redis settles it.
      this.redisPingPromise = ping.finally(() => {
        this.redisPingPromise = null;
      });
    }

    return this.redisPingPromise;
  }
}
