import {
  CHUNK_SIZE,
  getAllEntries,
  getChunkCount,
  serializeSitemapXml,
} from "@/lib/sitemap";

// Hand-rolled instead of Next's app/sitemap.ts metadata convention: that
// convention's chunked mode (generateSitemaps()) reserves the plain
// /sitemap.xml path for itself even though it 404s there (chunks only ever
// serve at /sitemap/[id].xml per Next's own docs), which collides with
// app/sitemap.xml/route.ts's hand-rolled index at that exact path — see
// that file's header comment. Dropping the special-file convention for both
// resolves the collision; serializeSitemapXml (lib/sitemap.ts) replicates
// Next's own <urlset> output for the fields this app actually uses.
export const revalidate = 3600;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id.endsWith(".xml")) {
    return new Response("Not Found", { status: 404 });
  }

  const chunkId = Number(id.slice(0, -".xml".length));

  const chunkCount = await getChunkCount();
  if (!Number.isInteger(chunkId) || chunkId < 0 || chunkId >= chunkCount) {
    return new Response("Not Found", { status: 404 });
  }

  const entries = await getAllEntries();
  const chunk = entries.slice(chunkId * CHUNK_SIZE, (chunkId + 1) * CHUNK_SIZE);

  return new Response(serializeSitemapXml(chunk), {
    headers: { "Content-Type": "application/xml" },
  });
}
