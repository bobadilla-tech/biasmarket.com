import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

// The vitest setup stubs next/image, so a missing CDN host in the real config
// would no longer fail any component test. Pin the hosts product images use.
describe("next.config images", () => {
  it("allows the production CDN host", () => {
    const patterns = nextConfig.images?.remotePatterns ?? [];
    expect(
      patterns.some(
        (p) => "hostname" in p && p.hostname === "cdn.biasmarket.com",
      ),
    ).toBe(true);
  });
});
