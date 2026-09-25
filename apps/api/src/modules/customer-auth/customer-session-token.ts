import type { Request } from 'express';
import { verifyCustomerSessionToken } from '@biasmarket/utils/customer-account-token';
import { CUSTOMER_SESSION_COOKIE } from './customer-session.constants.js';

// No cookie-parser middleware is installed in this app (see main.ts) — the
// session token's own characters (base64url + ".") never need escaping, so
// this only has to handle the standard `key=value; key2=value2` shape.
function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key) cookies[key] = part.slice(separator + 1).trim();
  }
  return cookies;
}

//  extract the raw session token from an
// `Authorization: Bearer <token>` header. Returns `undefined` when the
// header is absent or the token is empty.
export function extractBearerTokenFromAuthorization(
  authorizationHeader: string | undefined,
): string | undefined {
  if (!authorizationHeader) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match?.[1];
}

// Returns the raw session token the request presented, first from the
// `bm_customer_session` cookie (today's web path) and falling back to an
// `Authorization: Bearer <token>` header.
//  One token is honoured per request; a bearer header never overrides
//  a cookie.
export function extractCustomerSessionToken(req: Request): string | undefined {
  const fromCookie = parseCookies(req.headers.cookie)[CUSTOMER_SESSION_COOKIE];
  if (fromCookie) return fromCookie;
  return extractBearerTokenFromAuthorization(req.headers.authorization);
}
