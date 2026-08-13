import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";

// Sanity webhook target (URL: https://biasmarket.com/api/revalidate, configured
// in the Sanity project's Webhooks settings). Sanity signs requests with the
// webhook secret in the `x-sanity-webhook-secret` header; the secret must match
// SANITY_REVALIDATE_SECRET or the request is rejected — fail-closed when the
// env var is missing. On success the whole `blog` cache tag is invalidated so
// every blog page (both locales) re-renders from Sanity on next visit.
export async function POST(request: Request) {
  const secret = process.env.SANITY_REVALIDATE_SECRET;
  const received = request.headers.get("x-sanity-webhook-secret");

  if (!secret || !received || !safeEqual(secret, received)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  revalidateTag("blog", { expire: 0 });

  return Response.json({ revalidated: true, now: Date.now() });
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
