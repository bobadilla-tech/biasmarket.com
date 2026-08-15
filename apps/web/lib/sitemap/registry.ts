import type { SitemapSource } from "./types";
import { blogSource } from "./blog-source";
import { staticSource } from "./static-source";
import { storesSource } from "./stores-source";

export const sitemapSources: readonly SitemapSource[] = [
  staticSource,
  storesSource,
  blogSource,
];

export function getSitemapSource(id: string): SitemapSource | undefined {
  return sitemapSources.find((source) => source.id === id);
}
