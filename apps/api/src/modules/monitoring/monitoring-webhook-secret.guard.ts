import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { requiredEnv } from "../../config/env.validation.js";

const MONITORING_WEBHOOK_SECRET_HEADER = "x-webhook-secret";

// Kuma isn't a logged-in user, so this is a shared-secret header rather than
// session/role auth. The @nestjs/throttler guard on this route is
// defense-in-depth, not the primary control — main.ts never calls
// `app.set("trust proxy", ...)`, so behind Caddy every external request's
// req.ip is Caddy's own socket address, making the per-IP throttle bucket
// effectively one shared global bucket. This secret comparison is what
// actually stops an attacker here.
@Injectable()
export class MonitoringWebhookSecretGuard implements CanActivate {
  private readonly logger = new Logger(MonitoringWebhookSecretGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers[MONITORING_WEBHOOK_SECRET_HEADER];
    const secret = requiredEnv("MONITORING_WEBHOOK_SECRET");

    if (typeof provided !== "string" || !constantTimeEquals(provided, secret)) {
      this.logger.warn(
        `Rejected /monitoring/webhook request with invalid or missing ${MONITORING_WEBHOOK_SECRET_HEADER}`,
      );
      throw new UnauthorizedException();
    }

    return true;
  }
}

// Not `===` — leaks timing information on a secret comparison.
// timingSafeEqual throws on mismatched buffer lengths, so a length check
// runs first; a wrong-length guess is far less sensitive to leak than the
// secret's actual content.
function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
