import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { requiredEnv } from '../../config/env.validation.js';

const MONITORING_WEBHOOK_SECRET_HEADER = 'x-webhook-secret';

// Kuma isn't a logged-in user, so this is a shared-secret header rather than
// session/role auth. The throttler on this route is per client IP: main.ts
// trusts one proxy hop, and Caddy only accepts Cloudflare's CF-Connecting-IP
// (infra/vps/Caddyfile). The secret comparison is what authorizes the caller.
@Injectable()
export class MonitoringWebhookSecretGuard implements CanActivate {
  private readonly logger = new Logger(MonitoringWebhookSecretGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers[MONITORING_WEBHOOK_SECRET_HEADER];
    const secret = requiredEnv('MONITORING_WEBHOOK_SECRET');

    if (typeof provided !== 'string' || !constantTimeEquals(provided, secret)) {
      this.logger.warn(
        `Rejected /monitoring/webhook request with invalid or missing ${MONITORING_WEBHOOK_SECRET_HEADER}`,
      );
      throw new UnauthorizedException();
    }

    return true;
  }
}

// Compare fixed-length hashes rather than raw secret bytes so the timing
// profile does not reveal the length of the configured secret.
function constantTimeEquals(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}
