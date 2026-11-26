import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { redirectSystemPath } from "../app/+native-intent.js";

describe("redirectSystemPath", () => {
  it("strips /es prefix from incoming paths", () => {
    expect(redirectSystemPath({ path: "/es/store/store-1" })).toBe(
      "/store/store-1",
    );
    expect(
      redirectSystemPath({ path: "/es/store/store-1/product/prod-2" }),
    ).toBe("/store/store-1/product/prod-2");
    expect(
      redirectSystemPath({ path: "/es/store/store-1/account/orders/order-3" }),
    ).toBe("/store/store-1/account/orders/order-3");
  });

  it("strips /en prefix from incoming paths", () => {
    expect(
      redirectSystemPath({ path: "/en/store/store-1/product/prod-2" }),
    ).toBe("/store/store-1/product/prod-2");
  });

  it("leaves paths without locale prefix intact", () => {
    expect(redirectSystemPath({ path: "/account" })).toBe("/account");
    expect(redirectSystemPath({ path: "/store/store-1/product/prod-2" })).toBe(
      "/store/store-1/product/prod-2",
    );
  });

  it("strips locale prefixes from full URLs and drops query and hash", () => {
    expect(
      redirectSystemPath({
        path: "https://biasmarket.com/es/store/shop/product/item?ref=app#details",
      }),
    ).toBe("/store/shop/product/item");
    expect(
      redirectSystemPath({
        path: "https://biasmarket.com/en/store/shop",
      }),
    ).toBe("/store/shop");
    expect(
      redirectSystemPath({
        path: "https://biasmarket.com/en/store/shop/account/orders/order-9",
      }),
    ).toBe("/store/shop/account/orders/order-9");
  });

  it("leaves similarly prefixed routes such as /espresso unchanged", () => {
    expect(redirectSystemPath({ path: "/espresso/store/shop" })).toBe(
      "/espresso/store/shop",
    );
  });

  it("falls back to the root for an invalid full URL", () => {
    expect(redirectSystemPath({ path: "https://[invalid" })).toBe("/");
  });

  it("handles standalone /es and /en gracefully", () => {
    expect(redirectSystemPath({ path: "/es" })).toBe("/");
    expect(redirectSystemPath({ path: "/en" })).toBe("/");
  });

  it("routes store, product, and order URLs onto those screens", () => {
    const screens = [
      ["/es/store/k-store", "store/[storeSlug]/index.tsx"],
      [
        "/en/store/k-store/product/prod-2",
        "store/[storeSlug]/product/[productId].tsx",
      ],
      [
        "/es/store/k-store/account/orders/order-3",
        "store/[storeSlug]/account/orders/[orderId].tsx",
      ],
    ] as const;

    for (const [urlPath, screen] of screens) {
      const routed = redirectSystemPath({ path: urlPath });
      expect(routed.startsWith("/store/"), urlPath).toBe(true);
      expect(
        existsSync(new URL(`../app/${screen}`, import.meta.url)),
        screen,
      ).toBe(true);
    }
  });
});
