// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { revalidateTag } = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag }));

const SECRET = "test-sanity-webhook-secret";

function postWithSecret(secret: string | null): Request {
  const headers: Record<string, string> = {};
  if (secret !== null) {
    headers["x-sanity-webhook-secret"] = secret;
  }
  return new Request("http://localhost/api/revalidate", {
    method: "POST",
    headers,
  });
}

describe("POST /api/revalidate", () => {
  beforeEach(() => {
    process.env.SANITY_REVALIDATE_SECRET = SECRET;
    revalidateTag.mockClear();
  });

  afterEach(() => {
    delete process.env.SANITY_REVALIDATE_SECRET;
  });

  test("rejects when the secret header is missing", async () => {
    const { POST } = await import("./route");
    const response = await POST(postWithSecret(null));

    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  test("rejects when SANITY_REVALIDATE_SECRET is not configured", async () => {
    delete process.env.SANITY_REVALIDATE_SECRET;
    const { POST } = await import("./route");
    const response = await POST(postWithSecret(SECRET));

    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  test("rejects on a mismatched secret", async () => {
    const { POST } = await import("./route");
    const response = await POST(postWithSecret("wrong-secret"));

    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  test("revalidates the blog tag when the secret matches", async () => {
    const { POST } = await import("./route");
    const response = await POST(postWithSecret(SECRET));

    expect(response.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith("blog", { expire: 0 });
  });
});
