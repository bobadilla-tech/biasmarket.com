import { routing } from "@/i18n/routing";

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

/**
 * Per-page `alternates.languages` map (HTML `<link rel="alternate" hreflang>`)
 * for a literal pathname — the `{ [locale]: url, "x-default": url }` shape Next's
 * `Metadata.alternates.languages` expects. This is the single hreflang-set
 * computation in the codebase: `lib/sitemap/urls.ts`'s `alternates()` calls
 * through here too, so page `<head>` and sitemap XML never drift apart.
 */
export function localeAlternates(path: string): Record<string, string> {
  return {
    ...Object.fromEntries(
      routing.locales.map((locale) => [locale, canonicalUrl(locale, path)]),
    ),
    "x-default": canonicalUrl(routing.defaultLocale, path),
  };
}
