import type { MetadataRoute } from "next";
import { canonicalUrl, localeAlternates } from "@/lib/site-config";

export function localizedUrl(locale: string, path: string): string {
  return canonicalUrl(locale, path);
}

export function alternates(
  path: string,
): NonNullable<MetadataRoute.Sitemap[number]["alternates"]> {
  // Same hreflang set the pages' `alternates.languages` use — one computation,
  // in `lib/site-config.ts`, so sitemap XML and page `<head>` can't diverge.
  return { languages: localeAlternates(path) };
}

export function staticEntry(
  locale: string,
  path: string,
): MetadataRoute.Sitemap[number] {
  return {
    url: localizedUrl(locale, path),
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.6,
    alternates: alternates(path),
  };
}

export function storeEntry(
  locale: string,
  slug: string,
): MetadataRoute.Sitemap[number] {
  const path = `/store/${slug}`;
  return {
    url: localizedUrl(locale, path),
    changeFrequency: "daily",
    priority: 0.8,
    alternates: alternates(path),
  };
}

export function blogEntry(
  locale: string,
  slug: string,
  updatedAt?: string,
): MetadataRoute.Sitemap[number] {
  const path = `/blog/${slug}`;
  return {
    url: localizedUrl(locale, path),
    ...(updatedAt ? { lastModified: updatedAt } : {}),
    changeFrequency: "monthly",
    priority: 0.6,
    alternates: alternates(path),
  };
}
