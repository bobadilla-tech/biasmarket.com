import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  createCustomerSessionToken,
  verifyCustomerSessionToken,
} from '@biasmarket/utils/customer-account-token';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_TTL_MS,
} from './customer-session.constants.js';
import { requiredEnv } from '../../config/env.validation.js';
import { extractCustomerSessionToken } from './customer-session-token.js';

// No `storeId` here — the session identifies a global `BuyerAccount`, not a
// per-store `Customer`. Any endpoint that needs store scoping does its own
// explicit check (a `CustomerStoreLink` lookup, or filtering orders by
// `storeId`) instead of relying on the session for it. See
// docs/plans/2026-08-08-global-buyer-account-plan.md.
export interface CustomerSessionRequest extends Request {
  customerSession: { buyerAccountId: string };
}

// Independent of and parallel to the seller AuthGuard
// (`@thallesp/nestjs-better-auth`) — a completely different session
// mechanism (stateless HMAC cookie vs. better-auth's own session table), so
// it doesn't reuse AuthGuard/@Roles/Session from that library. Every route
// that uses this guard must also carry `@Public()` to opt out of the
// globally-registered seller AuthGuard (see auth.module.ts /
// disableGlobalAuthGuard), since otherwise that guard rejects the request
// before this one ever runs.
@Injectable()
export class CustomerSessionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    // Phase 1 (issue #178): accept the session token from either the
    // `bm_customer_session` cookie (today's web path) or an
    // `Authorization: Bearer <token>` header (mobile path). One token is
    // accepted per request; a cookie takes precedence when both are present.
    const token = extractCustomerSessionToken(req);
    if (!token) throw new UnauthorizedException('No autenticado');

    const secret = requiredEnv('CUSTOMER_ACCOUNT_TOKEN_SECRET');
    const verified = verifyCustomerSessionToken(token, secret);
    if (!verified) throw new UnauthorizedException('Sesión expirada');

    const buyerAccount = await this.prisma.buyerAccount.findUnique({
      where: { id: verified.buyerAccountId },
    });
    if (
      !buyerAccount?.passwordHash ||
      buyerAccount.passwordVersion !== verified.passwordVersion
    ) {
      // Covers: account deleted, or (most commonly) password changed since
      // this token was issued — see BuyerAccount.passwordVersion.
      throw new UnauthorizedException('Sesión expirada');
    }

    // Sliding renewal: every authenticated request reissues a fresh 7-day
    // cookie, so an active session never expires mid-use; a fully idle one
    // still expires CUSTOMER_SESSION_TTL_MS after its last authenticated
    // request. Deliberate choice, not the only valid one — see the plan doc.
    // For bearer-mode (mobile) requests the cookie is harmless (ignored by
    // native clients) but keeps the reissue codepath identical for both
    // transports.
    const fresh = createCustomerSessionToken(
      buyerAccount.id,
      buyerAccount.passwordVersion,
      secret,
    );
    res.cookie(CUSTOMER_SESSION_COOKIE, fresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: CUSTOMER_SESSION_TTL_MS,
      path: '/',
    });

    (req as CustomerSessionRequest).customerSession = {
      buyerAccountId: buyerAccount.id,
    };
    return true;
  }
}
