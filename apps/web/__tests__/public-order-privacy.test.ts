import { describe, expect, test } from "vitest";
import robots from "@/app/robots";
import nextConfig from "@/next.config";

describe("buyer order page privacy", () => {
  test("robots disallows the private order path", () => {
    const { rules } = robots();
    const list = Array.isArray(rules) ? rules : [rules];
    const disallow = list.flatMap((r) =>
      Array.isArray(r.disallow) ? r.disallow : r.disallow ? [r.disallow] : [],
    );
    expect(disallow).toContain("/*/store/*/pedido/*");
    expect(disallow).toContain("/*/store/*/pedido");
  });

  test("headers() covers the prefixed and unprefixed path", async () => {
    const rules = await (
      nextConfig as { headers: () => Promise<any[]> }
    ).headers();
    for (const source of [
      "/:locale/store/:slug/pedido/:token",
      "/store/:slug/pedido/:token",
    ]) {
      const rule = rules.find((r) => r.source === source);
      expect(rule, source).toBeDefined();
      const map = Object.fromEntries(
        rule.headers.map((h: { key: string; value: string }) => [
          h.key,
          h.value,
        ]),
      );
      expect(map["Referrer-Policy"]).toBe("no-referrer");
      expect(map["Cache-Control"]).toBe("no-store");
      expect(map["X-Robots-Tag"]).toBe("noindex, nofollow");
    }
  });
});
