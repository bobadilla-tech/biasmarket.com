import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { client } from "@/features/blog/lib/sanity";
import {
  POSTS_SITEMAP_COUNT_QUERY,
  POSTS_SITEMAP_PAGE_QUERY,
} from "@/features/blog/lib/sanity-queries";
import { CHUNK_SIZE } from "./constants";
import { chunkEntityRange } from "./chunk-range";
import { blogEntry } from "./urls";
import { type SitemapSource, SitemapStaleChunkError } from "./types";

const FETCH_OPTIONS = {
  next: { tags: ["blog"], revalidate: 3600 },
};

type BlogSitemapPost = {
  slug: { current: string };
  _updatedAt?: string;
};

function requireClient() {
  if (!client) throw new Error("Sanity sitemap client is not configured");
  return client;
}

async function getCount(): Promise<number> {
  const count = await requireClient().fetch<number>(
    POSTS_SITEMAP_COUNT_QUERY,
    {},
    FETCH_OPTIONS,
  );
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Invalid blog sitemap count");
  }
  return count;
}

const localeCount = routing.locales.length;

export const blogSource: SitemapSource = {
  id: "blog",
  async getChunkCount() {
    return Math.ceil((await getCount() * localeCount) / CHUNK_SIZE);
  },
  async getChunk(chunkId) {
    const range = chunkEntityRange(chunkId, CHUNK_SIZE, localeCount);
    const [total, posts] = await Promise.all([
      getCount(),
      requireClient().fetch<BlogSitemapPost[]>(
        POSTS_SITEMAP_PAGE_QUERY,
        {
          start: range.entityOffset,
          end: range.entityOffset + range.entityLimit,
        },
        FETCH_OPTIONS,
      ),
    ]);
    const currentChunkCount = Math.ceil((total * localeCount) / CHUNK_SIZE);
    if (chunkId >= currentChunkCount) {
      throw new SitemapStaleChunkError("blog", chunkId);
    }
    if (
      !Array.isArray(posts) ||
      posts.some(
        (post) =>
          !post?.slug ||
          typeof post.slug.current !== "string" ||
          !post.slug.current,
      )
    ) {
      throw new Error("Invalid blog sitemap page envelope");
    }
    if (total > 0 && posts.length === 0) {
      throw new Error("Blog sitemap page was unexpectedly empty");
    }

    const entries: MetadataRoute.Sitemap = posts.flatMap((post) =>
      routing.locales.map((locale) =>
        blogEntry(locale, post.slug.current, post._updatedAt)
      )
    );
    return entries.slice(range.sliceStart, range.sliceEnd);
  },
};
