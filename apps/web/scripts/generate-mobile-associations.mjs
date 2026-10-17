import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

/** @param {{ env?: Record<string, string | undefined>, publicDirectory?: string }} [options] */
export function generateMobileAssociations({
  env = process.env,
  publicDirectory = path.resolve(scriptDirectory, "../public"),
} = {}) {
  const directory = path.join(publicDirectory, ".well-known");
  const applePath = path.join(directory, "apple-app-site-association");
  const androidPath = path.join(directory, "assetlinks.json");
  const teamId = env.IOS_TEAM_ID?.trim();
  const fingerprint = env.ANDROID_APP_SHA256_CERT_FINGERPRINT?.trim();
  const required = env.MOBILE_ASSOCIATIONS_REQUIRED === "true";

  if (!teamId && !fingerprint) {
    rmSync(applePath, { force: true });
    rmSync(androidPath, { force: true });
    if (required) {
      throw new Error(
        "Set IOS_TEAM_ID and ANDROID_APP_SHA256_CERT_FINGERPRINT to publish mobile app associations.",
      );
    }
    return false;
  }

  if (!teamId || !fingerprint) {
    throw new Error(
      "IOS_TEAM_ID and ANDROID_APP_SHA256_CERT_FINGERPRINT must both be set.",
    );
  }
  if (!/^[A-Z0-9]{10}$/.test(teamId)) {
    throw new Error("IOS_TEAM_ID must be a 10-character Apple Team ID.");
  }
  if (!/^([A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(fingerprint)) {
    throw new Error(
      "ANDROID_APP_SHA256_CERT_FINGERPRINT must be a SHA-256 fingerprint in colon-separated hex format.",
    );
  }

  const bundleId = env.IOS_BUNDLE_ID?.trim() || "com.biasmarket.mobile";
  const packageName = env.ANDROID_APP_ID?.trim() || "com.biasmarket.mobile";
  if (!/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(bundleId)) {
    throw new Error("IOS_BUNDLE_ID must be a valid reverse-DNS bundle ID.");
  }
  if (!/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(packageName)) {
    throw new Error("ANDROID_APP_ID must be a valid reverse-DNS package name.");
  }

  mkdirSync(directory, { recursive: true });
  writeFileSync(
    applePath,
    `${JSON.stringify(
      {
        applinks: {
          apps: [],
          details: [
            {
              appIDs: [`${teamId}.${bundleId}`],
              components: [
                { "/": "/store/*/product/*" },
                { "/": "/store/*/account/orders/*" },
              ],
            },
          ],
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    androidPath,
    `${JSON.stringify(
      [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: packageName,
            sha256_cert_fingerprints: [fingerprint.toUpperCase()],
          },
        },
      ],
      null,
      2,
    )}\n`,
  );
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateMobileAssociations();
}
