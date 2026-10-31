import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// Every Spanish dictionary needs an English twin with exactly the same keys,
// so a string added to one language cannot silently fall back or be missing.
const I18N_ROOT = join(__dirname, "..", "..", "..", "packages", "i18n");

function leafPaths(value: unknown, prefix = ""): string[] {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

const files = readdirSync(join(I18N_ROOT, "es")).filter((file) =>
  file.endsWith(".json"),
);

describe("i18n parity (es / en)", () => {
  test("finds the dictionaries", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test.each(files)("%s has the same keys in es and en", (file) => {
    const read = (locale: string) =>
      JSON.parse(readFileSync(join(I18N_ROOT, locale, file), "utf-8"));
    const esKeys = leafPaths(read("es")).sort();
    const enKeys = leafPaths(read("en")).sort();
    expect(esKeys).toEqual(enKeys);
  });
});
