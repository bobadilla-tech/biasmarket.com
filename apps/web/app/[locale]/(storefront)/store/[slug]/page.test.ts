import { afterEach, describe, expect, it, vi } from "vitest";
import type { Locale } from "next-intl";

import { generateMetadata } from "./page";

function mockStoreResponse(store: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(store),
    }),
  );
}

const baseStore = {
  name: "Demo K-pop Corner",
  slug: "demo-kpop-corner",
  bio: "Official-adjacent merch, curated.",
  aboutMarkdown: null,
  logoUrl: null,
  sections: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("store page metadata — D6 thin-content gate", () => {
  it("emits robots noindex when the API reports the store is below the bar", async () => {
    mockStoreResponse({ ...baseStore, indexable: false });

    const metadata = await generateMetadata({
      params: Promise.resolve({
        locale: "es" as Locale,
        slug: "demo-kpop-corner",
      }),
    });

    expect(metadata.robots).toEqual({ index: false });
    // URLs stay crawlable — the canonical/hreflang signals are untouched.
    expect(metadata.alternates?.canonical).toBeTruthy();
    expect(metadata.alternates?.languages).toBeTruthy();
  });

  it("leaves robots unset for an indexable store", async () => {
    mockStoreResponse({ ...baseStore, indexable: true });

    const metadata = await generateMetadata({
      params: Promise.resolve({
        locale: "en" as Locale,
        slug: "demo-kpop-corner",
      }),
    });

    expect(metadata.robots).toBeUndefined();
  });

  it("leaves robots unset when the DTO predates the `indexable` field", async () => {
    mockStoreResponse({ ...baseStore });

    const metadata = await generateMetadata({
      params: Promise.resolve({
        locale: "en" as Locale,
        slug: "demo-kpop-corner",
      }),
    });

    expect(metadata.robots).toBeUndefined();
  });
});
