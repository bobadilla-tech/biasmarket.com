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
  const base =
    process.env.NEXT_PUBLIC_API_URL ?? process.env.INTERNAL_API_URL ?? "";
  return `${base}/api/public/orders/${encodeURIComponent(token)}/packed-photo`;
}
