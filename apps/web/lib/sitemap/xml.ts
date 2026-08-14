import type { MetadataRoute } from "next";
import {
  CHUNK_SIZE,
  MAX_SITEMAP_BYTES,
  MAX_SITEMAP_INDEX_ENTRIES,
} from "./constants";

export class SitemapOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SitemapOutputError";
  }
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function assertAbsoluteUrl(value: string, label: string): void {
  if (!value) throw new SitemapOutputError(`${label} must not be empty`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new SitemapOutputError(`${label} must be an absolute URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SitemapOutputError(`${label} must use http or https`);
  }
}

function assertSerializedSize(xml: string, label: string): string {
  const bytes = new TextEncoder().encode(xml).byteLength;
  if (bytes > MAX_SITEMAP_BYTES) {
    throw new SitemapOutputError(
      `${label} exceeds the ${MAX_SITEMAP_BYTES}-byte sitemap limit`,
    );
  }
  return xml;
}

// Mirrors Next's sitemap metadata serializer for the fields used by the app.
export function serializeSitemapXml(entries: MetadataRoute.Sitemap): string {
  if (entries.length > CHUNK_SIZE) {
    throw new SitemapOutputError(
      `A sitemap child cannot contain more than ${CHUNK_SIZE} URLs`,
    );
  }

  const hasAlternates = entries.some(
    (entry) => Object.keys(entry.alternates?.languages ?? {}).length > 0,
  );

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
  xml += hasAlternates
    ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
    : ">\n";

  for (const entry of entries) {
    assertAbsoluteUrl(entry.url, "url");
    xml += "<url>\n";
    xml += `<loc>${escapeXml(entry.url)}</loc>\n`;

    const languages = entry.alternates?.languages;
    if (languages) {
      for (const [lang, href] of Object.entries(languages)) {
        if (!href) continue;
        xml += `<xhtml:link rel="alternate" hreflang="${escapeXml(
          lang,
        )}" href="${escapeXml(href)}" />\n`;
      }
    }

    if (entry.lastModified) {
      const serialized =
        entry.lastModified instanceof Date
          ? entry.lastModified.toISOString()
          : entry.lastModified;
      xml += `<lastmod>${escapeXml(serialized)}</lastmod>\n`;
    }
    if (entry.changeFrequency) {
      xml += `<changefreq>${entry.changeFrequency}</changefreq>\n`;
    }
    if (typeof entry.priority === "number") {
      xml += `<priority>${entry.priority}</priority>\n`;
    }
    xml += "</url>\n";
  }

  xml += "</urlset>\n";
  return assertSerializedSize(xml, "Sitemap URL set");
}

export function serializeSitemapIndexXml(urls: string[]): string {
  if (urls.length > MAX_SITEMAP_INDEX_ENTRIES) {
    throw new SitemapOutputError(
      `A sitemap index cannot contain more than ${MAX_SITEMAP_INDEX_ENTRIES} entries`,
    );
  }

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const url of urls) {
    assertAbsoluteUrl(url, "sitemap index location");
    xml += `  <sitemap><loc>${escapeXml(url)}</loc></sitemap>\n`;
  }
  xml += "</sitemapindex>\n";
  return assertSerializedSize(xml, "Sitemap index");
}
