import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route.js";

describe("Apple Universal Links association", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not publish an unverifiable app id", async () => {
    vi.stubEnv("IOS_TEAM_ID", "");
    vi.stubEnv("IOS_BUNDLE_ID", process.env.IOS_BUNDLE_ID ?? "");
    delete process.env.IOS_BUNDLE_ID;
    expect((await GET()).status).toBe(503);
  });

  it("associates product and buyer order URLs with the mobile bundle", async () => {
    vi.stubEnv("IOS_TEAM_ID", "ABCDE12345");
    vi.stubEnv("IOS_BUNDLE_ID", process.env.IOS_BUNDLE_ID ?? "");
    delete process.env.IOS_BUNDLE_ID;
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body.applinks.details[0].appIDs).toEqual([
      "ABCDE12345.com.biasmarket.mobile",
    ]);
    const components = body.applinks.details[0].components;
    expect(components.map((c: { "/"?: string }) => c["/"])).toEqual([
      "/*/store/*/product/*/*",
      "/*/store/*/product/",
      "/*/store/*/product/*",
      "/*/store/*/account/orders/*/*",
      "/*/store/*/account/orders/",
      "/*/store/*/account/orders/*",
    ]);
    expect(components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          "/": "/*/store/*/product/*/*",
          exclude: true,
        }),
        expect.objectContaining({
          "/": "/*/store/*/product/",
          exclude: true,
        }),
        expect.objectContaining({
          "/": "/*/store/*/account/orders/*/*",
          exclude: true,
        }),
        expect.objectContaining({
          "/": "/*/store/*/account/orders/",
          exclude: true,
        }),
      ]),
    );
  });
});
