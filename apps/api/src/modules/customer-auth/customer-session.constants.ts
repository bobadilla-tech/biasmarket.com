export const CUSTOMER_SESSION_COOKIE = "bm_customer_session";

// Mirrors SESSION_TOKEN_TTL_MS in @biasmarket/utils/customer-account-token —
// kept in sync manually since the cookie's `maxAge` (set here, in Express)
// and the signed token's own embedded expiry (checked there) are two
// different mechanisms that both need to agree on the session lifetime.
export const CUSTOMER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
