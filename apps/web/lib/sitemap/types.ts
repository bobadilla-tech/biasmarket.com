import type { MetadataRoute } from "next";

export interface SitemapSource {
  id: string;
  getChunkCount(): Promise<number>;
  getChunk(chunkId: number): Promise<MetadataRoute.Sitemap>;
}

export class SitemapFixedChunkOutOfRangeError extends Error {
  constructor(source: string, chunkId: number) {
    super(`Sitemap chunk is outside the fixed ${source} source: ${chunkId}`);
    this.name = "SitemapFixedChunkOutOfRangeError";
  }
}

export class SitemapStaleChunkError extends Error {
  constructor(source: string, chunkId: number) {
    super(`Sitemap chunk is stale for ${source}: ${chunkId}`);
    this.name = "SitemapStaleChunkError";
  }
}
