import { describe, expect, it, vi } from "vitest";

const fakeSources = vi.hoisted(() => [
  { id: "static", getChunkCount: vi.fn().mockResolvedValue(1) },
  { id: "stores", getChunkCount: vi.fn().mockResolvedValue(0) },
  { id: "blog", getChunkCount: vi.fn().mockResolvedValue(2) },
]);

vi.mock("@/lib/sitemap/registry", () => ({ sitemapSources: fakeSources }));
vi.mock("@/lib/report-server-error", () => ({
  reportServerError: vi.fn(),
}));

import { GET } from "./route";

describe("sitemap root index", () => {
  it("keeps source order and omits zero-count sources", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const xml = await response.text();
    expect(xml.indexOf("sitemap-static-0.xml")).toBeLessThan(
      xml.indexOf("sitemap-blog-0.xml"),
    );
    expect(xml).toContain("sitemap-blog-1.xml");
    expect(xml).not.toContain("sitemap-stores");
    expect(xml).not.toContain("<url>");
  });

  it("returns no-store 503 when a source count fails", async () => {
    fakeSources[1].getChunkCount.mockRejectedValueOnce(new Error("API down"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("300");
  });
});
