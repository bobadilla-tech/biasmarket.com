import { describe, expect, it, vi } from "vitest";
import type { Locale } from "next-intl";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue(() => "Search"),
}));

import { generateMetadata } from "./page";

describe("search metadata", () => {
  it.each(["es", "en"])("is noindex for locale %s", async (locale) => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: locale as Locale }),
    });
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});
