import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route.js";

const VALID_FINGERPRINT =
  "14:6D:E9:01:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12";

describe("Android App Links association", () => {
  afterEach(() => {
    delete process.env.ANDROID_APP_SHA256_CERT_FINGERPRINT;
    delete process.env.ANDROID_APP_ID;
  });

  it("does not publish until the signing fingerprint is known", async () => {
    delete process.env.ANDROID_APP_SHA256_CERT_FINGERPRINT;
    process.env.ANDROID_APP_ID = "com.biasmarket.mobile";
    expect((await GET()).status).toBe(503);
  });

  it("does not publish when package id is missing", async () => {
    process.env.ANDROID_APP_SHA256_CERT_FINGERPRINT = VALID_FINGERPRINT;
    delete process.env.ANDROID_APP_ID;
    expect((await GET()).status).toBe(503);
  });

  it("rejects malformed signing fingerprints", async () => {
    process.env.ANDROID_APP_SHA256_CERT_FINGERPRINT = "INVALID_FINGERPRINT";
    process.env.ANDROID_APP_ID = "com.biasmarket.mobile";
    expect((await GET()).status).toBe(503);
  });

  it("returns the package and configured signing certificate", async () => {
    process.env.ANDROID_APP_SHA256_CERT_FINGERPRINT = VALID_FINGERPRINT;
    process.env.ANDROID_APP_ID = "com.biasmarket.mobile";
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body[0].target.package_name).toBe("com.biasmarket.mobile");
    expect(body[0].target.sha256_cert_fingerprints).toEqual([
      VALID_FINGERPRINT,
    ]);
  });
});
