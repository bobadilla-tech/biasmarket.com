import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { INTERNAL_JOBS_SECRET_HEADER } from "@biasmarket/queue";
import { requiredEnv } from "../../../config/env.validation.js";

// Last line of defense for /internal/* routes (see the migration plan's
// "three layers" note) — Caddy blocks this path from the public internet
// and apps/workers only reaches it over the internal Docker network, but
// this guard still has to hold on its own against a Caddy misconfiguration
// or a future reverse-proxy change.
@Injectable()
export class InternalJobsSecretGuard implements CanActivate {
  private readonly logger = new Logger(InternalJobsSecretGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers[INTERNAL_JOBS_SECRET_HEADER];
    const secret = requiredEnv("INTERNAL_JOBS_SECRET");

    if (typeof provided !== "string" || !constantTimeEquals(provided, secret)) {
      // An auth failure here is a more interesting signal than a routine
      // 401 — something reached an internal endpoint it shouldn't have.
      // Worth its own log line, not lumped in with normal auth noise.
      this.logger.warn(
        `Rejected /internal request with invalid or missing ${INTERNAL_JOBS_SECRET_HEADER}`,
      );
      throw new UnauthorizedException();
    }

    this.logger.log("Authenticated an /internal request");
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
