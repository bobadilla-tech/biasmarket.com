import { describe, expect, it, vi } from "vitest";

const fakeSources = vi.hoisted(() => [
  {
    id: "static",
    getChunkCount: vi.fn().mockResolvedValue(1),
    getChunk: vi.fn().mockResolvedValue([
      {
        url: "https://example.com/static",
      },
    ]),
  },
  {
    id: "stores",
    getChunkCount: vi.fn().mockResolvedValue(1),
    getChunk: vi.fn().mockRejectedValue(new Error("stale")),
  },
]);

vi.mock("@/lib/sitemap/registry", () => ({
  sitemapSources: fakeSources,
  getSitemapSource: (id: string) =>
    fakeSources.find((source) => source.id === id),
}));
vi.mock("@/lib/report-server-error", () => ({
  reportServerError: vi.fn(),
}));

import { GET } from "./route";

describe("sitemap child route", () => {
  it("serializes a valid source-qualified chunk", async () => {
    const response = await GET(
      new Request("https://example.com/sitemap-static-0.xml"),
      {
        params: Promise.resolve({ source: "static", id: "0.xml" }),
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/xml; charset=utf-8",
    );
    expect(await response.text()).toContain("<urlset");
  });

  it.each([
    { source: "missing", id: "0.xml" },
    { source: "static", id: "-1.xml" },
    { source: "static", id: "01.xml" },
    { source: "static", id: "1.0.xml" },
    { source: "static", id: "+1.xml" },
    { source: "static", id: "9007199254740992.xml" },
  ])("returns 404 without dispatching invalid params: %j", async (params) => {
    const response = await GET(new Request("https://example.com"), {
      params: Promise.resolve(params),
    });
    expect(response.status).toBe(404);
  });

  it("returns retryable no-store 503 for a mutable stale chunk", async () => {
    const response = await GET(new Request("https://example.com"), {
      params: Promise.resolve({ source: "stores", id: "1.xml" }),
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("300");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
