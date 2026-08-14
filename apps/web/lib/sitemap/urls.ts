import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/site-config";

export function localizedUrl(locale: string, path: string): string {
  return `${SITE_URL}/${locale}${path}`;
}

export function alternates(
  path: string,
): NonNullable<MetadataRoute.Sitemap[number]["alternates"]> {
  return {
    languages: Object.fromEntries(
      routing.locales.map((locale) => [locale, localizedUrl(locale, path)]),
    ),
  };
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
