import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// page.tsx must never call the API: a server-side fetch would make
// link-preview crawlers count as the buyer's first open (which locks the
// seller's "Corregir numero"). The browser fetches the order instead.
const source = fs
  .readFileSync(path.join(__dirname, "page.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("pedido page.tsx", () => {
  test("makes no fetch or API call", () => {
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/apiClient|@\/lib\/api-client/);
  });

  test("only imports from the allowed modules", () => {
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    for (const spec of imports) {
      expect(
        [
          "@/features/public-order",
          "next",
          "next-intl",
          "next-intl/server",
          "react",
        ],
        spec,
      ).toContain(spec);
    }
  });

  test("is dynamic and noindex", () => {
    expect(source).toMatch(/export const dynamic = "force-dynamic"/);
    expect(source).toMatch(/index:\s*false/);
    expect(source).toMatch(/referrer:\s*"no-referrer"/);
  });
});
