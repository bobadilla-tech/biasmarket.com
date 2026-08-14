import { describe, expect, it } from "vitest";
import { routing } from "@/i18n/routing";
import { CHUNK_SIZE, STATIC_PATHS } from "./constants";
import { staticSource } from "./static-source";

describe("static sitemap source", () => {
  it("contains every public marketing path and locale", async () => {
    expect(await staticSource.getChunkCount()).toBe(1);
    const entries = await staticSource.getChunk(0);
    expect(entries).toHaveLength(STATIC_PATHS.length * routing.locales.length);
    expect(entries.map((entry) => entry.url)).toContain("https://biasmarket.com/es/contact");
    expect(entries.map((entry) => entry.url)).toContain("https://biasmarket.com/en/for-sellers");
    expect(entries.map((entry) => entry.url)).not.toContain("https://biasmarket.com/es/search");
  });

  it("never emits an out-of-range fixed chunk", async () => {
    await expect(staticSource.getChunk(CHUNK_SIZE)).rejects.toThrow();
  });
});
