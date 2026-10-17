import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route.js";

describe("Android App Links association", () => {
  afterEach(() => {
    delete process.env.ANDROID_APP_SHA256_CERT_FINGERPRINT;
  });

  it("does not publish until the signing fingerprint is known", async () => {
    delete process.env.ANDROID_APP_SHA256_CERT_FINGERPRINT;
    expect((await GET()).status).toBe(503);
  });

  it("returns the package and configured signing certificate", async () => {
    process.env.ANDROID_APP_SHA256_CERT_FINGERPRINT = "AA:BB:CC";
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body[0].target.package_name).toBe("com.biasmarket.mobile");
    expect(body[0].target.sha256_cert_fingerprints).toEqual(["AA:BB:CC"]);
  });
});
