// Private-link tokens live in `/public/orders/:token` and in query strings
// (account confirm, password reset). Neither belongs in stdout, an error
// body, or an error-tracking event.
export function scrubRequestUrl(url: string): string {
  const path = url.split("?")[0] ?? url;
  return path.replace(/\/public\/orders\/[^/]+/gi, "/public/orders/:token");
}
