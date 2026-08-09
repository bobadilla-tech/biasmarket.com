import { createHmac, timingSafeEqual } from "node:crypto";

// "confirm" is the original long-lived email-confirmation link. The other
// three purposes are more security-sensitive (account takeover / silent
// contact-info swap) and get a much shorter TTL — see `ttlForPurpose`.
export type CustomerAccountTokenPurpose =
  | "confirm"
  | "reset"
  | "change-email"
  | "change-phone";

const CONFIRM_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SENSITIVE_TOKEN_TTL_MS = 60 * 60 * 1000;

function ttlForPurpose(purpose: CustomerAccountTokenPurpose): number {
  return purpose === "confirm" ? CONFIRM_TOKEN_TTL_MS : SENSITIVE_TOKEN_TTL_MS;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

// `buyerAccountId` — these tokens (confirm/reset/change-email/change-phone)
// identify a global `BuyerAccount`, not a per-store `Customer`, since buyer
// auth moved onto the global identity model (see
// docs/plans/2026-08-08-global-buyer-account-plan.md).
export function createCustomerAccountToken(
  buyerAccountId: string,
  secret: string,
  purpose: CustomerAccountTokenPurpose = "confirm",
): string {
  const payload = `${buyerAccountId}.${purpose}.${
    Date.now() + ttlForPurpose(purpose)
  }`;
  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");
  return `${encodedPayload}.${sign(payload, secret)}`;
}

export function verifyCustomerAccountToken(
  token: string,
  secret: string,
): { buyerAccountId: string; purpose: CustomerAccountTokenPurpose } | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  const expectedSignature = Buffer.from(sign(payload, secret));
  const actualSignature = Buffer.from(signature);
  if (
    expectedSignature.length !== actualSignature.length ||
    !timingSafeEqual(expectedSignature, actualSignature)
  ) {
    return null;
  }

  const [buyerAccountId, purposeRaw, expiresAtRaw] = payload.split(".");
  const expiresAt = Number(expiresAtRaw);
  const validPurposes: CustomerAccountTokenPurpose[] = [
    "confirm",
    "reset",
    "change-email",
    "change-phone",
  ];
  const purpose = validPurposes.find((p) => p === purposeRaw);
  if (
    !buyerAccountId || !purpose || !Number.isFinite(expiresAt) ||
    Date.now() > expiresAt
  ) {
    return null;
  }

  return { buyerAccountId, purpose };
}

// Buyer login session token — same stateless HMAC style as the token pair
// above, not a new mechanism. No `storeId` in the payload: the identity is
// now global, not per-store. Fixed absolute TTL per issuance; the
// CustomerSessionGuard reissues a fresh token (sliding renewal) on every
// authenticated request, so an active session never expires mid-use while a
// fully idle one still expires SESSION_TOKEN_TTL_MS after its last use.
// `passwordVersion` is `BuyerAccount.passwordVersion`, an integer bumped on
// every password change (not re-derived from the hash) and embedded so that
// changing a password invalidates every session token issued before the
// change — this design has no server-side revocation list, so that's the
// only way a "log out everywhere" / compromised-token scenario is
// mitigated.
const SESSION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createCustomerSessionToken(
  buyerAccountId: string,
  passwordVersion: number,
  secret: string,
): string {
  const payload = `${buyerAccountId}.${passwordVersion}.${
    Date.now() + SESSION_TOKEN_TTL_MS
  }`;
  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");
  return `${encodedPayload}.${sign(payload, secret)}`;
}

export function verifyCustomerSessionToken(
  token: string,
  secret: string,
): { buyerAccountId: string; passwordVersion: number } | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  const expectedSignature = Buffer.from(sign(payload, secret));
  const actualSignature = Buffer.from(signature);
  if (
    expectedSignature.length !== actualSignature.length ||
    !timingSafeEqual(expectedSignature, actualSignature)
  ) {
    return null;
  }

  const [buyerAccountId, passwordVersionRaw, expiresAtRaw] = payload.split(
    ".",
  );
  const expiresAt = Number(expiresAtRaw);
  const passwordVersion = Number(passwordVersionRaw);
  if (
    !buyerAccountId ||
    !Number.isFinite(passwordVersion) ||
    !Number.isFinite(expiresAt) ||
    Date.now() > expiresAt
  ) {
    return null;
  }

  return { buyerAccountId, passwordVersion };
}
