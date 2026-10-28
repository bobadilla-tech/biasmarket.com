import { createHmac, timingSafeEqual } from 'node:crypto';
import { requiredEnv } from '../../config/env.validation.js';

// Hand-off from the order page to the Google OAuth redirect. The raw order
// token, the order id and any capability must never travel in a URL or in the
// OAuth `state` (Google logs, Referer, access logs; `state` is signed, not
// encrypted). Instead the browser POSTs for this ticket, which lands in an
// httpOnly cookie scoped to the OAuth routes, and the redirect carries only a
// boolean.
export const CLAIM_TICKET_COOKIE = 'bm_claim';
export const CLAIM_TICKET_PATH = '/api/account/google';
export const CLAIM_TICKET_TTL_MS = 10 * 60 * 1000;

// Where on the order page the buyer decided to save the order.
export const CLAIM_MOMENTS = [
  'entrega',
  'pago_validado',
  'banner',
  'adelanto_linea_de_tiempo',
] as const;
export type ClaimMoment = (typeof CLAIM_MOMENTS)[number];

export interface ClaimTicket {
  orderId: string;
  // First 16 hex chars of the order's `accessTokenHash` when the ticket was
  // issued. A seller `regenerate`/`correctPhone` replaces the hash without
  // revoking it, so the claim must also match this or a ticket minted from a
  // forwarded (replaced) link would stay valid for its full lifetime.
  linkFp: string;
  moment?: ClaimMoment;
  exp: number;
}

// A distinct context prefix: a ticket can never be accepted as a session
// token or an OAuth state, and vice versa.
function sign(payload: string): string {
  return createHmac('sha256', requiredEnv('CUSTOMER_ACCOUNT_TOKEN_SECRET'))
    .update(`claim-ticket:${payload}`)
    .digest('base64url');
}

export function linkFingerprint(accessTokenHash: string): string {
  return accessTokenHash.slice(0, 16);
}

export function claimCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: CLAIM_TICKET_PATH,
  };
}

export function signClaimTicket(
  input: { orderId: string; accessTokenHash: string; moment?: ClaimMoment },
  now = Date.now(),
): string {
  const body: ClaimTicket = {
    orderId: input.orderId,
    linkFp: linkFingerprint(input.accessTokenHash),
    ...(input.moment ? { moment: input.moment } : {}),
    exp: now + CLAIM_TICKET_TTL_MS,
  };
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyClaimTicket(
  value: string | undefined,
  now = Date.now(),
): ClaimTicket | null {
  if (!value) return null;
  const [payload, signature, ...rest] = value.split('.');
  if (!payload || !signature || rest.length > 0) return null;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  let body: Partial<ClaimTicket>;
  try {
    body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (
    typeof body.orderId !== 'string' ||
    !body.orderId ||
    typeof body.linkFp !== 'string' ||
    !body.linkFp ||
    typeof body.exp !== 'number' ||
    body.exp < now ||
    (body.moment !== undefined &&
      !(CLAIM_MOMENTS as readonly string[]).includes(body.moment))
  ) {
    return null;
  }
  return {
    orderId: body.orderId,
    linkFp: body.linkFp,
    ...(body.moment ? { moment: body.moment } : {}),
    exp: body.exp,
  };
}
