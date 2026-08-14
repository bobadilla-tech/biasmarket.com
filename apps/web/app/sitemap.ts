import type { MetadataRoute } from "next";
import { client } from "@/client/sanity";
import { POSTS_SITEMAP_QUERY } from "@/client/sanity-queries";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/site-config";

const STATIC_PATHS = ["", "/blog", "/founder", "/enterprise"];
const CHUNK_SIZE = 50000;

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
  } catch {
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
  } catch {
    return [];
  }
}

async function getAllEntries(): Promise<MetadataRoute.Sitemap> {
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

// Splits the sitemap into multiple files of at most CHUNK_SIZE URLs each —
// Next.js emits a sitemap index automatically once generateSitemaps() is
// present. See app/sitemap.ts docs for the id-as-Promise<string> contract
// (changed in Next 16 — this repo's installed version).
export async function generateSitemaps() {
  const entries = await getAllEntries();
  const chunkCount = Math.max(1, Math.ceil(entries.length / CHUNK_SIZE));
  return Array.from({ length: chunkCount }, (_, id) => ({ id }));
}

export default async function sitemap({
  id,
}: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const chunkId = Number(await id);
  const entries = await getAllEntries();
  return entries.slice(chunkId * CHUNK_SIZE, (chunkId + 1) * CHUNK_SIZE);
}
