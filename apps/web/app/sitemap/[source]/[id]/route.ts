import { reportServerError } from "@/lib/report-server-error";
import { SITEMAP_RETRY_AFTER_SECONDS } from "@/lib/sitemap/constants";
import { getSitemapSource } from "@/lib/sitemap/registry";
import {
  SitemapFixedChunkOutOfRangeError,
  SitemapStaleChunkError,
} from "@/lib/sitemap/types";
import { serializeSitemapXml } from "@/lib/sitemap/xml";

export const dynamic = "force-dynamic";

function notFound(): Response {
  return new Response("Not Found", { status: 404 });
}

function unavailable(): Response {
  return new Response("Sitemap temporarily unavailable", {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
      "Retry-After": String(SITEMAP_RETRY_AFTER_SECONDS),
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ source: string; id: string }> },
) {
  const { source: sourceId, id } = await params;
  const source = getSitemapSource(sourceId);
  if (!source || !/^(0|[1-9][0-9]*)\.xml$/.test(id)) return notFound();

  const chunkText = id.slice(0, -".xml".length);
  const chunkId = Number(chunkText);
  if (!Number.isSafeInteger(chunkId)) return notFound();

  try {
    const entries = await source.getChunk(chunkId);
    const xml = serializeSitemapXml(entries);
    return new Response(xml, {
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  } catch (error) {
    if (error instanceof SitemapFixedChunkOutOfRangeError) return notFound();

    await reportServerError(error, {
      fn: "sitemapChunk",
      source: sourceId,
      chunkId,
    });
    if (error instanceof SitemapStaleChunkError) return unavailable();
    return unavailable();
  }
}
