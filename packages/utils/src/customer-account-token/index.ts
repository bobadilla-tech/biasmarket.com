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

export function createCustomerAccountToken(
  customerId: string,
  secret: string,
  purpose: CustomerAccountTokenPurpose = "confirm",
): string {
  const payload = `${customerId}.${purpose}.${
    Date.now() + ttlForPurpose(purpose)
  }`;
  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");
  return `${encodedPayload}.${sign(payload, secret)}`;
}

export function verifyCustomerAccountToken(
  token: string,
  secret: string,
): { customerId: string; purpose: CustomerAccountTokenPurpose } | null {
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

  const [customerId, purposeRaw, expiresAtRaw] = payload.split(".");
  const expiresAt = Number(expiresAtRaw);
  const validPurposes: CustomerAccountTokenPurpose[] = [
    "confirm",
    "reset",
    "change-email",
    "change-phone",
  ];
  const purpose = validPurposes.find((p) => p === purposeRaw);
  if (
    !customerId || !purpose || !Number.isFinite(expiresAt) ||
    Date.now() > expiresAt
  ) {
    return null;
  }

  return { customerId, purpose };
}

// Buyer login session token — same stateless HMAC style as the token pair
// above, not a new mechanism. Fixed absolute TTL per issuance; the
// CustomerSessionGuard reissues a fresh token (sliding renewal) on every
// authenticated request, so an active session never expires mid-use while a
// fully idle one still expires SESSION_TOKEN_TTL_MS after its last use.
// `passwordVersion` (derived from the current password hash, see
// apps/api's CustomerAuthService.derivePasswordVersion) is embedded so that
// changing a customer's password invalidates every session token issued
// before the change — this design has no server-side revocation list, so
// that's the only way a "log out everywhere" / compromised-token scenario
// is mitigated.
const SESSION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createCustomerSessionToken(
  customerId: string,
  storeId: string,
  passwordVersion: string,
  secret: string,
): string {
  const payload = `${customerId}.${storeId}.${passwordVersion}.${
    Date.now() + SESSION_TOKEN_TTL_MS
  }`;
  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");
  return `${encodedPayload}.${sign(payload, secret)}`;
}

export function verifyCustomerSessionToken(
  token: string,
  secret: string,
): { customerId: string; storeId: string; passwordVersion: string } | null {
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

  const [customerId, storeId, passwordVersion, expiresAtRaw] = payload.split(
    ".",
  );
  const expiresAt = Number(expiresAtRaw);
  if (
    !customerId ||
    !storeId ||
    !passwordVersion ||
    !Number.isFinite(expiresAt) ||
    Date.now() > expiresAt
  ) {
    return null;
  }

  return { customerId, storeId, passwordVersion };
}
