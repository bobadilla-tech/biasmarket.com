import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { requiredEnv } from "../../config/env.validation.js";

export const SITEMAP_INTERNAL_TOKEN_HEADER = "x-internal-sitemap-token";

@Injectable()
export class SitemapInternalTokenGuard implements CanActivate {
  private readonly logger = new Logger(SitemapInternalTokenGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers[SITEMAP_INTERNAL_TOKEN_HEADER];
    const expected = requiredEnv("SITEMAP_INTERNAL_TOKEN");

    if (typeof provided !== "string" || !constantTimeEquals(provided, expected)) {
      this.logger.warn(
        `Rejected sitemap request with invalid or missing ${SITEMAP_INTERNAL_TOKEN_HEADER}`,
      );
      throw new UnauthorizedException();
    }

    return true;
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}
