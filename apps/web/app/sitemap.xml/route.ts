import { getChunkCount } from "@/lib/sitemap";
import { SITE_URL } from "@/lib/site-config";

// Sitemap index for app/sitemap.ts's chunked output (/sitemap/[id].xml) —
// see that file's header comment for why Next doesn't generate this on its
// own once generateSitemaps() is present. robots.ts advertises
// `${SITE_URL}/sitemap.xml`, so this route is what actually has to exist at
// that exact path.
export const revalidate = 3600;

export async function GET() {
  const chunkCount = await getChunkCount();
  const sitemapTags = Array.from(
    { length: chunkCount },
    (_, id) => `  <sitemap><loc>${SITE_URL}/sitemap/${id}.xml</loc></sitemap>`,
  ).join("\n");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${sitemapTags}\n` +
    `</sitemapindex>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}
