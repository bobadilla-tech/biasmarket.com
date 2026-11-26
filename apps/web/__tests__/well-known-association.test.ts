import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { config as proxyConfig } from "../proxy";

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repoRoot = path.resolve(webRoot, "../..");

const APPLE_TEAM_PLACEHOLDER = "REPLACE_WITH_APPLE_TEAM_ID";
const ANDROID_SHA_PLACEHOLDER = "REPLACE_WITH_ANDROID_SHA256_CERT_FINGERPRINT";

function readJson(relativeFromWeb: string) {
  return JSON.parse(readFileSync(path.join(webRoot, relativeFromWeb), "utf8"));
}

describe("mobile association files", () => {
  const appConfig = JSON.parse(
    readFileSync(path.join(repoRoot, "apps/mobile/app.json"), "utf8"),
  );
  const bundleId = appConfig.expo.ios.bundleIdentifier as string;
  const packageName = appConfig.expo.android.package as string;

  it("publishes static files instead of app route handlers", () => {
    expect(
      existsSync(
        path.join(webRoot, "public/.well-known/apple-app-site-association"),
      ),
    ).toBe(true);
    expect(
      existsSync(path.join(webRoot, "public/.well-known/assetlinks.json")),
    ).toBe(true);
    expect(
      existsSync(
        path.join(
          webRoot,
          "app/.well-known/apple-app-site-association/route.ts",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        path.join(webRoot, "app/.well-known/assetlinks.json/route.ts"),
      ),
    ).toBe(false);
  });

  it("associates store, product, and order paths with the Expo bundle id", () => {
    const body = readJson("public/.well-known/apple-app-site-association");
    expect(body.applinks.details[0].appIDs).toEqual([
      `${APPLE_TEAM_PLACEHOLDER}.${bundleId}`,
    ]);
    expect(bundleId).toBe("com.biasmarket.mobile");
    const components = body.applinks.details[0].components as {
      "/": string;
      exclude?: boolean;
    }[];
    expect(components.map((component) => component["/"])).toEqual([
      "/*/store/*/product/*/*",
      "/*/store/*/product/",
      "/*/store/*/product/*",
      "/*/store/*/account/orders/*/*",
      "/*/store/*/account/orders/",
      "/*/store/*/account/orders/*",
      "/*/store/*/*",
      "/*/store/*/",
      "/*/store/",
      "/*/store/*",
    ]);
    expect(
      components.find((component) => component["/"] === "/*/store/*/product/*")
        ?.exclude,
    ).toBeUndefined();
    expect(
      components.find(
        (component) => component["/"] === "/*/store/*/account/orders/*",
      )?.exclude,
    ).toBeUndefined();
    expect(
      components.find((component) => component["/"] === "/*/store/*")?.exclude,
    ).toBeUndefined();
    expect(
      components.find((component) => component["/"] === "/*/store/*/*")
        ?.exclude,
    ).toBe(true);
  });

  it("associates the Expo package and leaves a marked fingerprint placeholder", () => {
    const body = readJson("public/.well-known/assetlinks.json");
    expect(body[0].relation).toEqual([
      "delegate_permission/common.handle_all_urls",
    ]);
    expect(body[0].target.namespace).toBe("android_app");
    expect(body[0].target.package_name).toBe(packageName);
    expect(packageName).toBe("com.biasmarket.mobile");
    expect(body[0].target.sha256_cert_fingerprints).toEqual([
      ANDROID_SHA_PLACEHOLDER,
    ]);
    expect(ANDROID_SHA_PLACEHOLDER).not.toMatch(
      /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/i,
    );
  });

  it("sets JSON content type for both association paths", async () => {
    const rules = await (
      nextConfig as {
        headers: () => Promise<
          { source: string; headers: { key: string; value: string }[] }[]
        >;
      }
    ).headers();
    for (const source of [
      "/.well-known/apple-app-site-association",
      "/.well-known/assetlinks.json",
    ]) {
      const rule = rules.find((entry) => entry.source === source);
      expect(rule, source).toBeDefined();
      expect(rule?.headers).toContainEqual({
        key: "Content-Type",
        value: "application/json",
      });
    }
  });

  it("keeps the intl proxy off dotted well-known paths", () => {
    const matcher = proxyConfig.matcher[0];
    expect(matcher).toBeTypeOf("string");
    expect(matcher).toBe("/((?!api|_next|.*\\..*).*)");
  });

  it("makes Caddy serve well-known paths as JSON without a redirect", () => {
    const caddyfile = readFileSync(
      path.join(repoRoot, "infra/vps/Caddyfile"),
      "utf8",
    );
    const block = caddyfile.match(
      /handle \/\.well-known\/\* \{[\s\S]*?\n\t\}/,
    )?.[0];
    expect(block).toBeDefined();
    expect(block).toContain("Content-Type application/json");
    expect(block).toContain("defer");
    expect(block).toContain("import /etc/caddy/active/web.caddy");
    expect(block).not.toContain("redir");
  });
});
