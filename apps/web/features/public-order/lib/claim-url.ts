import { publicApiBase } from "./shipping-links";

// The start URL carries a flag and the locale, nothing else: the order token,
// order id and ticket never travel in a URL (Google logs, Referer, access
// logs). The ticket rides in the httpOnly cookie the POST just set.
export function claimStartUrl(locale: string): string {
  const params = new URLSearchParams({ claim: "1", locale });
  return `${publicApiBase()}/api/account/google?${params.toString()}`;
}
