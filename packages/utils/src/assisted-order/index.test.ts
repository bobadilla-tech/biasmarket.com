import { describe, expect, it } from "vitest";
import {
  AssistedOrderInvariantError,
  assertVendorAssistedOrder,
  createOrderAccessToken,
  hashOrderAccessToken,
} from "./index";

describe("order access token", () => {
  it("issues at least 128 bits of base64url randomness and its sha-256 hash", () => {
    const { token, tokenHash } = createOrderAccessToken();

    expect(Buffer.from(token, "base64url").length).toBeGreaterThanOrEqual(16);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(tokenHash).toHaveLength(64);
    expect(tokenHash).toMatch(/^[0-9a-f]+$/);
    expect(tokenHash).toBe(hashOrderAccessToken(token));
    expect(tokenHash).not.toBe(token);
  });

  it("hashes the same token to the same digest and a different token elsewhere", () => {
    const first = createOrderAccessToken();
    const second = createOrderAccessToken();

    expect(hashOrderAccessToken(first.token)).toBe(first.tokenHash);
    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).not.toBe(second.tokenHash);
  });
});

describe("assertVendorAssistedOrder", () => {
  it("ignores marketplace orders", () => {
    expect(() =>
      assertVendorAssistedOrder({
        source: "MARKETPLACE",
        customerPhone: "987654321",
        createdByUserId: null,
      })
    ).not.toThrow();
  });

  it("accepts a canonical E.164 phone and a seller id", () => {
    expect(() =>
      assertVendorAssistedOrder({
        source: "VENDOR_ASSISTED",
        customerPhone: "+51987654321",
        createdByUserId: "seller-1",
      })
    ).not.toThrow();
  });

  it("rejects a phone that is not already canonical E.164", () => {
    for (const customerPhone of ["987654321", "+51 987 654 321", "+51", ""]) {
      expect(() =>
        assertVendorAssistedOrder({
          source: "VENDOR_ASSISTED",
          customerPhone,
          createdByUserId: "seller-1",
        })
      ).toThrow(AssistedOrderInvariantError);
    }
  });

  it("rejects a missing seller", () => {
    for (const createdByUserId of [null, undefined, "", "   "]) {
      expect(() =>
        assertVendorAssistedOrder({
          source: "VENDOR_ASSISTED",
          customerPhone: "+51987654321",
          createdByUserId,
        })
      ).toThrow(AssistedOrderInvariantError);
    }
  });
});
