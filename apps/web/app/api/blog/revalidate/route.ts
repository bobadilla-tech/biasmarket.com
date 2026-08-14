import { parseBody } from "next-sanity/webhook";
import { revalidateTag } from "next/cache";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const secret = process.env.SANITY_REVALIDATE_SECRET;

  if (!secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { isValidSignature, body } = await parseBody(request, secret, false);

  if (!isValidSignature || !body) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  revalidateTag("blog", { expire: 0 });

  return Response.json({ revalidated: true, now: Date.now() });
}
