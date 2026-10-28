import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { requiredEnv } from '../../config/env.validation.js';

export const BUYER_GOOGLE_STATE_COOKIE = 'bm_buyer_google_state';
export const BUYER_GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;

export type BuyerGoogleLocale = 'es' | 'en';

// `slug` is null when the buyer started from the global (no-store) page.
export interface BuyerGoogleState {
  slug: string | null;
  locale: BuyerGoogleLocale;
  nonce: string;
  exp: number;
  // True only when a claim ticket cookie was verified at the start of the
  // flow. A boolean on purpose: no order id or token in `state`.
  claim: boolean;
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = new Set([
  'https://accounts.google.com',
  'accounts.google.com',
]);

export function normalizeBuyerGoogleLocale(
  locale: string | undefined,
): BuyerGoogleLocale {
  return locale === 'en' ? 'en' : 'es';
}

export function isBuyerGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
}

// Google redirects back to this single, slug-independent URL — it has to be
// registered once in the Google Cloud OAuth client. The store the buyer came
// from travels inside the signed `state` instead.
export function buyerGoogleRedirectUri(): string {
  return `${requiredEnv('BETTER_AUTH_URL')}/api/account/google/callback`;
}

function sign(payload: string): string {
  return createHmac('sha256', requiredEnv('CUSTOMER_ACCOUNT_TOKEN_SECRET'))
    .update(`buyer-google-state:${payload}`)
    .digest('base64url');
}

export function createBuyerGoogleState(
  slug: string | null,
  locale: BuyerGoogleLocale,
  now = Date.now(),
  claim = false,
): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString('base64url');
  const body: BuyerGoogleState = {
    slug,
    locale,
    nonce,
    exp: now + BUYER_GOOGLE_STATE_TTL_MS,
    claim,
  };
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
  return { state: `${payload}.${sign(payload)}`, nonce };
}

export function verifyBuyerGoogleState(
  state: string | undefined,
  nonceCookie: string | undefined,
  now = Date.now(),
): BuyerGoogleState | null {
  if (!state || !nonceCookie) return null;
  const [payload, signature, ...rest] = state.split('.');
  if (!payload || !signature || rest.length > 0) return null;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  let body: BuyerGoogleState;
  try {
    body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (
    (body.slug !== null && typeof body.slug !== 'string') ||
    typeof body.nonce !== 'string' ||
    typeof body.exp !== 'number' ||
    body.exp < now
  ) {
    return null;
  }

  // Binds the callback to the browser that started the flow (login CSRF).
  const nonceA = Buffer.from(body.nonce);
  const nonceB = Buffer.from(nonceCookie);
  if (nonceA.length !== nonceB.length || !timingSafeEqual(nonceA, nonceB)) {
    return null;
  }

  return {
    ...body,
    locale: normalizeBuyerGoogleLocale(body.locale),
    claim: body.claim === true,
  };
}

export function buildBuyerGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requiredEnv('GOOGLE_CLIENT_ID'),
    redirect_uri: buyerGoogleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string | null;
}

// The id_token comes straight from Google's token endpoint over TLS in
// exchange for our one-time code, so (per OIDC Core §3.1.3.7) its signature
// need not be re-verified — only the claims are checked.
export async function exchangeBuyerGoogleCode(
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleIdentity | null> {
  const clientId = requiredEnv('GOOGLE_CLIENT_ID');
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: requiredEnv('GOOGLE_CLIENT_SECRET'),
      redirect_uri: buyerGoogleRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) return null;

  const { id_token: idToken } = (await response.json()) as {
    id_token?: string;
  };
  const claimsPart = idToken?.split('.')[1];
  if (!claimsPart) return null;

  let claims: {
    iss?: string;
    aud?: string;
    sub?: string;
    exp?: number;
    email?: string;
    email_verified?: boolean | string;
    name?: string;
  };
  try {
    claims = JSON.parse(Buffer.from(claimsPart, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  const verified =
    claims.email_verified === true || claims.email_verified === 'true';
  if (
    !claims.iss ||
    !GOOGLE_ISSUERS.has(claims.iss) ||
    claims.aud !== clientId ||
    typeof claims.exp !== 'number' ||
    claims.exp * 1000 < Date.now() ||
    !claims.email ||
    typeof claims.sub !== 'string' ||
    !claims.sub ||
    !verified
  ) {
    return null;
  }

  return { sub: claims.sub, email: claims.email, name: claims.name ?? null };
}
