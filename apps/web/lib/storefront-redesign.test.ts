import { afterEach, describe, expect, it, vi } from "vitest";
import { isStorefrontRedesignEnabled } from "./storefront-redesign";

afterEach(() => vi.unstubAllEnvs());

describe("isStorefrontRedesignEnabled", () => {
  it("defaults to the KoreaLexa pilot store", () => {
    vi.stubEnv("NEXT_PUBLIC_STOREFRONT_REDESIGN_STORE_SLUGS", "korealexa");

    expect(isStorefrontRedesignEnabled("KoreaLexa")).toBe(true);
    expect(isStorefrontRedesignEnabled("another-store")).toBe(false);
  });

  it("supports an explicit slug allowlist and a global rollout", () => {
    vi.stubEnv("NEXT_PUBLIC_STOREFRONT_REDESIGN_STORE_SLUGS", " alpha, beta ");
    expect(isStorefrontRedesignEnabled("beta")).toBe(true);
    expect(isStorefrontRedesignEnabled("gamma")).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_STOREFRONT_REDESIGN_STORE_SLUGS", "*");
    expect(isStorefrontRedesignEnabled("gamma")).toBe(true);
  });

  it("can disable the redesign for every store with an empty allowlist", () => {
    vi.stubEnv("NEXT_PUBLIC_STOREFRONT_REDESIGN_STORE_SLUGS", "");

    expect(isStorefrontRedesignEnabled("korealexa")).toBe(false);
  });
});
