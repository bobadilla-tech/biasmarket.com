import { describe, expect, it } from "vitest";
import { redirectSystemPath } from "../app/+native-intent.js";

describe("redirectSystemPath", () => {
  it("strips /es prefix from incoming paths", () => {
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

  it("handles standalone /es and /en gracefully", () => {
    expect(redirectSystemPath({ path: "/es" })).toBe("/");
    expect(redirectSystemPath({ path: "/en" })).toBe("/");
  });
});
