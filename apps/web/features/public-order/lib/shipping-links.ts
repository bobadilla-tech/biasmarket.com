// Seller-supplied tracking URL: the API only accepts http(s), but a row that
// predates that validation must never become a `javascript:` link.
export function safeTrackingUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

// Browser-side URL of the token-authorized photo stream (the API sends it
// `no-store`, `no-referrer`, `CORP: cross-origin`). The page itself fetches
// in the browser, so the public API origin is the right base.
export function packedPhotoSrc(token: string): string {
  return `${publicApiBase()}/api/public/orders/${encodeURIComponent(token)}/packed-photo`;
}

// The buyer's own uploaded proof, token-authorized like the packed photo.
export function paymentProofSrc(token: string, paymentId: string): string {
  return `${publicApiBase()}/api/public/orders/${encodeURIComponent(token)}/payments/${encodeURIComponent(paymentId)}/image`;
}

// The browser-reachable API origin. The claim ticket POST and the OAuth start
// navigation must use the SAME host: the ticket is a host-scoped cookie that
// only that host will send back.
export function publicApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? process.env.INTERNAL_API_URL ?? "";
}
