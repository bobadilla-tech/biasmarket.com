// @vitest-environment node
import { encodeSignatureHeader } from "@sanity/webhook";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { revalidateTag } = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag }));

const SECRET = "test-sanity-webhook-secret";
const PAYLOAD = JSON.stringify({
  _id: "drafts.blog-post-123",
  _type: "post",
  slug: { current: "example-post" },
});

async function signedRequest(signature?: string): Promise<NextRequest> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (signature) {
    headers["sanity-webhook-signature"] = signature;
  }

  return new NextRequest("http://localhost/api/blog/revalidate", {
    method: "POST",
    headers,
    body: PAYLOAD,
  });
}

describe("POST /api/blog/revalidate", () => {
  beforeEach(() => {
    process.env.SANITY_REVALIDATE_SECRET = SECRET;
    revalidateTag.mockClear();
  });

  afterEach(() => {
    delete process.env.SANITY_REVALIDATE_SECRET;
  });

  test("rejects a request without a signature header", async () => {
    const { POST } = await import("./route");
    const response = await POST(await signedRequest());

    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  test("rejects when SANITY_REVALIDATE_SECRET is not configured", async () => {
    delete process.env.SANITY_REVALIDATE_SECRET;
    const { POST } = await import("./route");
    const signature = await encodeSignatureHeader(PAYLOAD, Date.now(), SECRET);

    const response = await POST(await signedRequest(signature));

    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  test("rejects a request with an invalid signature", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      await signedRequest("t=1720000000000,v1=bad-signature"),
    );

    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  test("rejects a request signed with a different secret", async () => {
    const { POST } = await import("./route");
    const signature = await encodeSignatureHeader(
      PAYLOAD,
      Date.now(),
      "wrong-secret",
    );

    const response = await POST(await signedRequest(signature));

    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  test("revalidates the blog tag when the signature is valid", async () => {
    const { POST } = await import("./route");
    const signature = await encodeSignatureHeader(PAYLOAD, Date.now(), SECRET);

    const response = await POST(await signedRequest(signature));

    expect(response.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith("blog", { expire: 0 });
  });
});
