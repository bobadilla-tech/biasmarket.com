import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/site-config";

const STATIC_PATHS = ["", "/founder", "/enterprise"];

function localizedUrl(locale: string, path: string) {
  return `${SITE_URL}/${locale}${path}`;
}

function alternates(path: string) {
  return {
    languages: Object.fromEntries(
      routing.locales.map((locale) => [locale, localizedUrl(locale, path)]),
    ),
  };
}

async function getStoreSlugs(): Promise<{ slug: string; createdAt: string }[]> {
  const apiUrl = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  const res = await fetch(`${apiUrl}/api/stores/public`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];
  return res.json();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: localizedUrl(locale, path),
      changeFrequency:
        path === "" ? ("weekly" as const) : ("monthly" as const),
      priority: path === "" ? 1 : 0.6,
      alternates: alternates(path),
    })),
  );

  const stores = await getStoreSlugs();
  const storeEntries: MetadataRoute.Sitemap = stores.flatMap(({ slug, createdAt }) =>
    routing.locales.map((locale) => ({
      url: localizedUrl(locale, `/store/${slug}`),
      lastModified: createdAt,
      changeFrequency: "daily",
      priority: 0.8,
      alternates: alternates(`/store/${slug}`),
    })),
  );

  return [...staticEntries, ...storeEntries];
}
