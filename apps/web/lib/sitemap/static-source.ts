import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { CHUNK_SIZE, STATIC_PATHS } from "./constants";
import { chunkEntityRange } from "./chunk-range";
import { staticEntry } from "./urls";
import { SitemapFixedChunkOutOfRangeError, type SitemapSource } from "./types";

function entries(): MetadataRoute.Sitemap {
  return STATIC_PATHS.flatMap((path) =>
    routing.locales.map((locale) => staticEntry(locale, path))
  );
}

function chunkCount(): number {
  return Math.ceil((STATIC_PATHS.length * routing.locales.length) / CHUNK_SIZE);
}

export const staticSource: SitemapSource = {
  id: "static",
  async getChunkCount() {
    return chunkCount();
  },
  async getChunk(chunkId) {
    const count = chunkCount();
    if (!Number.isSafeInteger(chunkId) || chunkId < 0 || chunkId >= count) {
      throw new SitemapFixedChunkOutOfRangeError("static", chunkId);
    }
    const range = chunkEntityRange(chunkId, CHUNK_SIZE, 1);
    return entries().slice(range.sliceStart, range.sliceEnd);
  },
};
