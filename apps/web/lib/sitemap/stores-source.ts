import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { CHUNK_SIZE } from "./constants";
import { chunkEntityRange } from "./chunk-range";
import { storeEntry } from "./urls";
import { type SitemapSource, SitemapStaleChunkError } from "./types";

const SITEMAP_INTERNAL_TOKEN_HEADER = "x-internal-sitemap-token";

const CACHE_OPTIONS = {
  next: { revalidate: 3600, tags: ["sitemap:stores"] },
};

type SitemapCount = { total: number };
type SitemapPage = { items: { slug: string }[]; total: number };

function apiBaseUrl(): string {
  const base = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!base) throw new Error("Missing INTERNAL_API_URL/NEXT_PUBLIC_API_URL");
  return base.replace(/\/$/, "");
}

function token(): string {
  const value = process.env.SITEMAP_INTERNAL_TOKEN;
  if (!value) throw new Error("Missing SITEMAP_INTERNAL_TOKEN");
  return value;
}

async function fetchSitemapJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}/api/stores/${path}`, {
    ...CACHE_OPTIONS,
    headers: { [SITEMAP_INTERNAL_TOKEN_HEADER]: token() },
  });
  if (!response.ok) {
    throw new Error(
      `Sitemap stores API returned ${response.status} for ${path}`,
    );
  }
  return response.json() as Promise<T>;
}

function parseCount(value: unknown): number {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as SitemapCount).total !== "number" ||
    !Number.isSafeInteger((value as SitemapCount).total) ||
    (value as SitemapCount).total < 0
  ) {
    throw new Error("Invalid stores sitemap count envelope");
  }
  return (value as SitemapCount).total;
}

function parsePage(value: unknown): SitemapPage {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid stores sitemap page envelope");
  }
  const page = value as SitemapPage;
  if (
    !Array.isArray(page.items) ||
    typeof page.total !== "number" ||
    !Number.isSafeInteger(page.total) ||
    page.total < 0 ||
    page.items.some((item) =>
      !item || typeof item.slug !== "string" || !item.slug
    )
  ) {
    throw new Error("Invalid stores sitemap page envelope");
  }
  if (page.total > 0 && page.items.length === 0) {
    throw new Error("Stores sitemap page was unexpectedly empty");
  }
  return page;
}

const localeCount = routing.locales.length;

export const storesSource: SitemapSource = {
  id: "stores",
  async getChunkCount() {
    const response = await fetchSitemapJson<SitemapCount>(
      "internal/sitemap/count",
    );
    return Math.ceil((parseCount(response) * localeCount) / CHUNK_SIZE);
  },
  async getChunk(chunkId) {
    const pageSize = chunkEntityRange(chunkId, CHUNK_SIZE, localeCount);
    const query = new URLSearchParams({
      limit: String(pageSize.entityLimit),
      offset: String(pageSize.entityOffset),
    });
    const page = parsePage(
      await fetchSitemapJson<SitemapPage>(`internal/sitemap?${query}`),
    );
    const currentChunkCount = Math.ceil(
      (page.total * localeCount) / CHUNK_SIZE,
    );
    if (chunkId >= currentChunkCount) {
      throw new SitemapStaleChunkError("stores", chunkId);
    }

    const entries: MetadataRoute.Sitemap = page.items.flatMap(({ slug }) =>
      routing.locales.map((locale) => storeEntry(locale, slug))
    );
    return entries.slice(pageSize.sliceStart, pageSize.sliceEnd);
  },
};
