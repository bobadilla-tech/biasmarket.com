import { createHash, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";

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
  const aHash = createHash("sha256").update(a).digest();
  const bHash = createHash("sha256").update(b).digest();
  return timingSafeEqual(aHash, bHash);
}
