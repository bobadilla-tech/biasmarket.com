import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import { verifyCustomerSessionToken } from '@biasmarket/utils/customer-account-token';
import { requiredEnv } from '../../config/env.validation.js';
import { extractBearerTokenFromAuthorization } from './customer-session-token.js';

// Marks a route whose OriginGuard is allowed to skip the Origin/Referer
// check for requests that carry NO origin header at all (i.e. non-browser
// clients such as a native app). Browsers always send `Origin` on
// cross-origin fetch/XHR and on same-origin POST/PATCH, so a missing
// Origin/Referer is itself evidence of a non-browser caller — mirroring
// better-auth's own CSRF handling (see origin-check.mjs). This never
// bypasses the check when an Origin/Referer IS present: a cross-origin
// browser request still 403s.
//
// Only apply to routes that cannot present a bearer token yet (unauthenticated
// token-issuing endpoints: register/login/forgot-password). Authenticated
// routes go through the verified-bearer exemption instead.
export const ALLOW_NO_ORIGIN = 'customerAuth:allowNoOrigin';
export const AllowNoOrigin = () =>
  SetMetadata<string, true>(ALLOW_NO_ORIGIN, true);

// The codebase's "CSRF out of scope" deployment note (see
// docs/core/deploy.md) doesn't cover these routes — buyer
// register/login/change-password/PATCH-me all mutate state under a
// browser-held cookie, so they need at least strict same-origin
// enforcement. A full CSRF-token scheme is out of scope for this pass;
// this is the documented minimum bar instead.
//
// Phase 1 (issue #178) adds two narrow, security-reviewed exemptions so
// native (mobile) clients can use these endpoints without a browser Origin:
//
// 1. VERIFIED BEARER ONLY — a request carrying an already-validated
//    `Authorization: Bearer <session token>` skips the Origin check
//    (non-browser mobile clients can't attach an Origin/Referer). This is
//    gated on the token actually VERIFYING, never on the mere presence of
//    the Authorization header. An invalid/forged bearer token is NOT a
//    bypass: it falls straight into the normal Origin check below. A
//    cross-origin attacker's browser cannot mint a valid bearer token, so
//    this is not a CSRF gap.
//
// 2. NON-BROWSER (NO-ORIGIN), OPT-IN PER ROUTE — only routes decorated
//    `@AllowNoOrigin()` (the unauthenticated login/register/forgot-password,
//    which have no token yet) may skip the check when neither Origin nor
//    Referer is present. When Origin/Referer IS present it is still enforced
//    exactly as before, so browser cross-origin POSTs to those routes remain
//    blocked. This mirrors the CSRF behaviour better-auth already applies to
//    the seller sign-in endpoints.
@Injectable()
export class OriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const handler = context.getHandler();

    const bearerToken = extractBearerTokenFromAuthorization(
      req.headers.authorization,
    );

    // Exemption 1 (verified bearer only). Do NOT skip on the mere presence
    // of an Authorization header — only when the token actually validates.
    if (bearerToken) {
      const secret = requiredEnv('CUSTOMER_ACCOUNT_TOKEN_SECRET');
      if (verifyCustomerSessionToken(bearerToken, secret)) return true;
      // Invalid bearer token: fall through to the Origin check unchanged.
      // (Per-request precedence is cookie first; but an authenticated route
      // reaching here carries a cookie or a valid bearer, and this guard
      // only needs the bearer verdict for the exemption above.)
    }

    const source = req.headers.origin ?? req.headers.referer;
    if (!source) {
      // Exemption 2 (non-browser, opt-in per route): only when the route is
      // explicitly marked and NO Origin/Referer was supplied. When an origin
      // IS supplied we enforce it below regardless of the marker.
      const allowNoOrigin = Reflect.getMetadata(ALLOW_NO_ORIGIN, handler);
      if (allowNoOrigin === true) return true;
      throw new ForbiddenException('Missing origin');
    }

    const allowedOrigin = new URL(
      process.env.WEB_URL ?? 'http://localhost:3001',
    ).origin;

    let sourceOrigin: string;
    try {
      sourceOrigin = new URL(source).origin;
    } catch {
      throw new ForbiddenException('Invalid origin');
    }

    if (sourceOrigin !== allowedOrigin) {
      throw new ForbiddenException('Cross-origin request blocked');
    }
    return true;
  }
}
