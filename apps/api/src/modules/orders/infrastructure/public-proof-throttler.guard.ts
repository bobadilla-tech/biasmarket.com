import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
} from "@nestjs/common";
import { observeRedisConnection, redisClientConfig } from "@biasmarket/queue";
import { Redis } from "ioredis";
import { createHash } from "node:crypto";

const LIMIT = 10;
const WINDOW_MS = 60_000;

/** Share the proof-upload burst limit for each secret link across API replicas. */
@Injectable()
export class PublicProofThrottlerGuard implements CanActivate, OnModuleDestroy {
  private readonly logger = new Logger(PublicProofThrottlerGuard.name);
  private closing = false;
  private readonly redis = this.openRedis();

  // Same bounded client as the queues. ioredis' default retry (50ms, cap 2s)
  // and a missing error listener were an independent reconnect storm whose
  // reason never made it into a structured log.
  private openRedis(): Redis | null {
    if (process.env.VITEST_WORKER_ID != null) return null;
    const { url, options } = redisClientConfig();
    const client = new Redis(url, options);
    observeRedisConnection(
      client,
      "public-proof-throttle",
      {
        error: (fields) => this.logger.error(fields),
        warn: (fields) => this.logger.warn(fields),
      },
      () => this.closing,
    );
    return client;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.redis) return true;
    const request = context.switchToHttp().getRequest<{
      params?: { token?: string };
    }>();
    const token = String(request.params?.token ?? "");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const window = Math.floor(Date.now() / WINDOW_MS);
    const key = `public-proof-throttle:${tokenHash}:${window}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.pexpire(key, WINDOW_MS * 2);
    if (count > LIMIT) {
      throw new HttpException(
        "Too many requests",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  async onModuleDestroy(): Promise<void> {
    this.closing = true;
    if (this.redis) await this.redis.quit();
  }
}
