import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
} from "@nestjs/common";
import Redis from "ioredis";
import { createHash } from "node:crypto";

const LIMIT = 10;
const WINDOW_MS = 60_000;

/** Share the proof-upload burst limit for each secret link across API replicas. */
@Injectable()
export class PublicProofThrottlerGuard implements CanActivate, OnModuleDestroy {
  private readonly redis = new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
  });

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
    await this.redis.quit();
  }
}
