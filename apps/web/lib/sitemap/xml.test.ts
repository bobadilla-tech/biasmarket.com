import { describe, expect, it, vi } from "vitest";

vi.mock("./constants", async () => {
  const actual = await vi.importActual<typeof import("./constants")>("./constants");
  return { ...actual, MAX_SITEMAP_BYTES: 10_000 };
});

import { CHUNK_SIZE, MAX_SITEMAP_BYTES } from "./constants";
import {
  serializeSitemapIndexXml,
  serializeSitemapXml,
  SitemapOutputError,
} from "./xml";

describe("sitemap XML serializers", () => {
  it("escapes locations and emits the sitemap namespaces", () => {
    const xml = serializeSitemapXml([
      {
        url: "https://example.com/a?x=1&y=2",
        alternates: { languages: { en: "https://example.com/en?a=1&b=2" } },
      },
    ]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain("a?x=1&amp;y=2");
  });

  it("rejects child and index URL-count overflow", () => {
    const entries = Array.from({ length: CHUNK_SIZE + 1 }, (_, i) => ({
      url: `https://example.com/${i}`,
    }));
    expect(() => serializeSitemapXml(entries)).toThrow(SitemapOutputError);
    expect(() =>
      serializeSitemapIndexXml(
        Array.from({ length: CHUNK_SIZE + 1 }, (_, i) => `https://example.com/${i}`),
      ),
    ).toThrow(SitemapOutputError);
  });

  it("rejects relative index locations", () => {
    expect(() => serializeSitemapIndexXml(["/sitemap-0.xml"])).toThrow(
      SitemapOutputError,
    );
  });

  it("enforces the UTF-8 byte limit at runtime", () => {
    const oversizedPath = "x".repeat(MAX_SITEMAP_BYTES);
    expect(() =>
      serializeSitemapXml([{ url: `https://example.com/${oversizedPath}` }]),
    ).toThrow(SitemapOutputError);
    expect(() =>
      serializeSitemapIndexXml([`https://example.com/${oversizedPath}`]),
    ).toThrow(SitemapOutputError);
  });
});
