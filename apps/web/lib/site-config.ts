export const BOBADILLA_TECH_URL = "https://bobadilla.tech";
export const CONTACT_EMAIL = "hello@biasmarket.com";
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://biasmarket.com";
export const CAL_COM_URL = "https://cal.com/alexandra-flores/bias-market";

/**
 * Self-referential per-locale canonical URL for a page's `alternates.canonical`.
 * `path` is a literal pathname (e.g. `/enterprise`, `""` for home) — callers
 * pass it explicitly since the helper can't derive it for static routes.
 */
export function canonicalUrl(locale: string, path: string): string {
  return `${SITE_URL}/${locale}${path}`;
}
