import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateMobileAssociations } from "./generate-mobile-associations.mjs";

const temporaryDirectories: string[] = [];
const makePublicDirectory = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mobile-links-"));
  temporaryDirectories.push(root);
  return root;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("static mobile app association files", () => {
  it("does not publish unverified identifiers in an unconfigured build", () => {
    const publicDirectory = makePublicDirectory();
    expect(
      generateMobileAssociations({
        env: {},
        publicDirectory,
      }),
    ).toBe(false);
    expect(() =>
      readFileSync(
        path.join(publicDirectory, ".well-known/apple-app-site-association"),
      ),
    ).toThrow();
  });

  it("requires both public signing identifiers for production builds", () => {
    expect(() =>
      generateMobileAssociations({
        env: { MOBILE_ASSOCIATIONS_REQUIRED: "true" },
        publicDirectory: makePublicDirectory(),
      }),
    ).toThrow(/Set IOS_TEAM_ID and ANDROID_APP_SHA256_CERT_FINGERPRINT/);
  });

  it("generates both association files with configured app identifiers", () => {
    const publicDirectory = makePublicDirectory();
    const generated = generateMobileAssociations({
      publicDirectory,
      env: {
        IOS_TEAM_ID: "ABCDE12345",
        IOS_BUNDLE_ID: "com.biasmarket.mobile",
        ANDROID_APP_ID: "com.biasmarket.mobile",
        ANDROID_APP_SHA256_CERT_FINGERPRINT:
          "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
      },
    });

    const apple = JSON.parse(
      readFileSync(
        path.join(publicDirectory, ".well-known/apple-app-site-association"),
        "utf8",
      ),
    );
    const android = JSON.parse(
      readFileSync(
        path.join(publicDirectory, ".well-known/assetlinks.json"),
        "utf8",
      ),
    );

    expect(generated).toBe(true);
    expect(apple.applinks.details[0].appIDs).toEqual([
      "ABCDE12345.com.biasmarket.mobile",
    ]);
    expect(apple.applinks.details[0].components).toHaveLength(6);
    expect(android[0].target.package_name).toBe("com.biasmarket.mobile");
    expect(android[0].target.sha256_cert_fingerprints).toHaveLength(1);
  });
});
