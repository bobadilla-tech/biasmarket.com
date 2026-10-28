// The buyer's order page carries its credential in the URL, so any event that
// echoes a URL — request data, breadcrumbs, stack frames — would otherwise ship
// a working access link to the error tracker, readable by anyone with dashboard
// access. Covers the page route (with or without the locale prefix) and the API
// call the browser makes for it.
const PUBLIC_ORDER_PATH =
  /(\/(?:[a-z]{2}\/)?store\/[^/?#]+\/pedido\/|\/api\/public\/orders\/)[^/?#]+/g;

export function redactPublicOrderToken(value: string): string {
  return value.replace(PUBLIC_ORDER_PATH, "$1[redacted]");
}

// Walks the event in place: Sentry hands the hook a mutable object and the
// token can sit in any string field, at any depth.
export function redactSentryEvent(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string") {
      (value as Record<string, unknown>)[key] = redactPublicOrderToken(child);
    } else if (child && typeof child === "object") {
      redactSentryEvent(child);
    }
  }
}
