import { reportServerError } from "@/lib/report-server-error";
import { SITE_URL } from "@/lib/site-config";
import {
  MAX_SITEMAP_INDEX_ENTRIES,
  SITEMAP_RETRY_AFTER_SECONDS,
} from "@/lib/sitemap/constants";
import { sitemapSources } from "@/lib/sitemap/registry";
import { serializeSitemapIndexXml } from "@/lib/sitemap/xml";

export const dynamic = "force-dynamic";

function unavailable(): Response {
  return new Response("Sitemap temporarily unavailable", {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
      "Retry-After": String(SITEMAP_RETRY_AFTER_SECONDS),
    },
  });
}

export async function GET() {
  try {
    const sourceCounts = await Promise.all(
      sitemapSources.map(async (source) => {
        try {
          const count = await source.getChunkCount();
          if (
            !Number.isSafeInteger(count) ||
            count < 0 ||
            count > MAX_SITEMAP_INDEX_ENTRIES
          ) {
            throw new Error(
              `Invalid ${source.id} sitemap chunk count: ${count}`,
            );
          }
          return { source, count };
        } catch (error) {
          await reportServerError(error, {
            fn: "sitemapIndex",
            source: source.id,
          });
          throw error;
        }
      }),
    );

    const urls = sourceCounts.flatMap(({ source, count }) =>
      Array.from(
        { length: count },
        (_, chunkId) => `${SITE_URL}/sitemap-${source.id}-${chunkId}.xml`,
      ),
    );
    const xml = serializeSitemapIndexXml(urls);

    return new Response(xml, {
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  } catch (error) {
    await reportServerError(error, { fn: "sitemapIndex", source: "index" });
    return unavailable();
  }
}
