import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import {
  createCustomerSessionToken,
  verifyCustomerSessionToken,
} from "@biasmarket/utils/customer-account-token";
import { PrismaService } from "../../prisma/prisma.service.js";
import { derivePasswordVersion } from "./customer-auth.service.js";
import {
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_TTL_MS,
} from "./customer-session.constants.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// No cookie-parser middleware is installed in this app (see main.ts) — the
// session token's own characters (base64url + ".") never need escaping, so
// this only has to handle the standard `key=value; key2=value2` shape.
function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key) cookies[key] = part.slice(separator + 1).trim();
  }
  return cookies;
}

export interface CustomerSessionRequest extends Request {
  customerSession: { id: string; storeId: string };
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

    const token = parseCookies(req.headers.cookie)[CUSTOMER_SESSION_COOKIE];
    if (!token) throw new UnauthorizedException("No autenticado");

    const secret = requiredEnv("CUSTOMER_ACCOUNT_TOKEN_SECRET");
    const verified = verifyCustomerSessionToken(token, secret);
    if (!verified) throw new UnauthorizedException("Sesión expirada");

    const customer = await this.prisma.customer.findUnique({
      where: { id: verified.customerId },
    });
    if (
      !customer?.passwordHash ||
      customer.storeId !== verified.storeId ||
      derivePasswordVersion(customer.passwordHash) !== verified.passwordVersion
    ) {
      // Covers: customer deleted, moved store, or (most commonly) password
      // changed since this token was issued — see derivePasswordVersion.
      throw new UnauthorizedException("Sesión expirada");
    }

    // Sliding renewal: every authenticated request reissues a fresh 7-day
    // cookie, so an active session never expires mid-use; a fully idle one
    // still expires CUSTOMER_SESSION_TTL_MS after its last authenticated
    // request. Deliberate choice, not the only valid one — see the plan doc.
    const fresh = createCustomerSessionToken(
      customer.id,
      customer.storeId,
      verified.passwordVersion,
      secret,
    );
    res.cookie(CUSTOMER_SESSION_COOKIE, fresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: CUSTOMER_SESSION_TTL_MS,
      path: "/",
    });

    (req as CustomerSessionRequest).customerSession = {
      id: customer.id,
      storeId: customer.storeId,
    };
    return true;
  }
}
