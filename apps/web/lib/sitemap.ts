import type { MetadataRoute } from "next";
import { client } from "@/features/blog/lib/sanity";
import { POSTS_SITEMAP_QUERY } from "@/features/blog/lib/sanity-queries";
import { routing } from "@/i18n/routing";
import { reportServerError } from "@/lib/report-server-error";
import { SITE_URL } from "@/lib/site-config";

const STATIC_PATHS = ["", "/blog", "/founder", "/enterprise"];
// Google's per-sitemap-file limit. Shared by app/sitemap/[id]/route.ts
// (serves each chunk) and app/sitemap.xml/route.ts (serves the index
// listing those chunk URLs) — both need the exact same chunk boundaries, or
// the index would point at chunk ids that don't match what actually exists.
export const CHUNK_SIZE = 50000;

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
  const apiUrl =
    process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return [];
  try {
    const res = await fetch(`${apiUrl}/api/stores/public`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch (error) {
    await reportServerError(error, { fn: "getStoreSlugs" });
    return [];
  }
}

async function getBlogPostSlugs(): Promise<
  { slug: string; updatedAt: string }[]
> {
  if (!client) return [];
  try {
    const posts: { slug: { current: string }; _updatedAt: string }[] =
      await client.fetch(
        POSTS_SITEMAP_QUERY,
        {},
        {
          next: { tags: ["blog"], revalidate: 3600 },
        },
      );
    return posts.map((post) => ({
      slug: post.slug.current,
      updatedAt: post._updatedAt,
    }));
  } catch (error) {
    await reportServerError(error, { fn: "getBlogPostSlugs" });
    return [];
  }
}

export async function getAllEntries(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: localizedUrl(locale, path),
      changeFrequency: path === "" ? ("weekly" as const) : ("monthly" as const),
      priority: path === "" ? 1 : 0.6,
      alternates: alternates(path),
    })),
  );

  const stores = await getStoreSlugs();
  const storeEntries: MetadataRoute.Sitemap = stores.flatMap(
    ({ slug, createdAt }) =>
      routing.locales.map((locale) => ({
        url: localizedUrl(locale, `/store/${slug}`),
        lastModified: createdAt,
        changeFrequency: "daily" as const,
        priority: 0.8,
        alternates: alternates(`/store/${slug}`),
      })),
  );

  const blogPosts = await getBlogPostSlugs();
  const blogEntries: MetadataRoute.Sitemap = blogPosts.flatMap((post) =>
    routing.locales.map((locale) => ({
      url: localizedUrl(locale, `/blog/${post.slug}`),
      lastModified: post.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
      alternates: alternates(`/blog/${post.slug}`),
    })),
  );

  return [...staticEntries, ...storeEntries, ...blogEntries];
}

// Both callers need this same count — app/sitemap/[id]/route.ts to know how
// many chunks exist, app/sitemap.xml/route.ts to know how many chunk URLs
// to list in the index. Kept as one function so the two can never disagree
// about where the boundaries are.
export async function getChunkCount(): Promise<number> {
  const entries = await getAllEntries();
  return Math.max(1, Math.ceil(entries.length / CHUNK_SIZE));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Mirrors the <urlset> shape Next's built-in sitemap metadata convention
// produces (node_modules/next/dist/build/webpack/loaders/metadata/resolve-
// route-data.js's resolveSitemap) for the subset of fields getAllEntries()
// actually sets — url, alternates.languages, lastModified, changeFrequency,
// priority. No images/videos support since nothing here ever sets those.
export function serializeSitemapXml(entries: MetadataRoute.Sitemap): string {
  const hasAlternates = entries.some(
    (entry) => Object.keys(entry.alternates?.languages ?? {}).length > 0,
  );

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
  xml += hasAlternates
    ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
    : ">\n";

  for (const entry of entries) {
    xml += "<url>\n";
    xml += `<loc>${escapeXml(entry.url)}</loc>\n`;

    const languages = entry.alternates?.languages;
    if (languages) {
      for (const [lang, href] of Object.entries(languages)) {
        if (!href) continue;
        xml += `<xhtml:link rel="alternate" hreflang="${escapeXml(lang)}" href="${escapeXml(href)}" />\n`;
      }
    }

    if (entry.lastModified) {
      const serialized =
        entry.lastModified instanceof Date
          ? entry.lastModified.toISOString()
          : entry.lastModified;
      xml += `<lastmod>${escapeXml(serialized)}</lastmod>\n`;
    }
    if (entry.changeFrequency) {
      xml += `<changefreq>${entry.changeFrequency}</changefreq>\n`;
    }
    if (typeof entry.priority === "number") {
      xml += `<priority>${entry.priority}</priority>\n`;
    }
    xml += "</url>\n";
  }

  xml += "</urlset>\n";
  return xml;
}
