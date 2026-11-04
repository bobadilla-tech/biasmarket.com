import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appConfig = JSON.parse(
  readFileSync(new URL("../../app.json", import.meta.url), "utf8"),
);
const pathPatterns: string[] = appConfig.expo.android.intentFilters[0].data.map(
  (entry: { pathAdvancedPattern: string }) => entry.pathAdvancedPattern,
);
const pathMatchers = pathPatterns.map((pattern) => new RegExp(`^${pattern}$`));

describe("Android app-link path patterns", () => {
  it("matches product and buyer-order routes with one non-empty segment per ID", () => {
    const validPaths = [
      "/es/store/k-store/product/product-123",
      "/en/store/k-store/product/product-123",
      "/es/store/k-store/account/orders/order-123",
      "/en/store/k-store/account/orders/order-123",
    ];

    for (const path of validPaths) {
      expect(
        pathMatchers.some((matcher) => matcher.test(path)),
        path,
      ).toBe(true);
    }
  });

  it.each([
    "/es/store//product/product-123",
    "/es/store/k-store/product/",
    "/es/store/k-store/product/product-123/extra",
    "/en/store/k-store/account/orders/",
    "/en/store/k-store/account/orders/order-123/extra",
  ])("rejects empty identifiers and extra route segments: %s", (path) => {
    expect(pathMatchers.some((matcher) => matcher.test(path))).toBe(false);
  });
});
