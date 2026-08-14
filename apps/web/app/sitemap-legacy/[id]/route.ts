// Temporary compatibility response for old flat chunk URLs. Keep this
// narrow 410 during one deployment/crawl window while source-qualified root
// filenames become the only URLs emitted by /sitemap.xml.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await params;
  return new Response("Gone", {
    status: 410,
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
