import { describe, expect, it } from "vitest";
import {
  createCustomerAccountToken,
  createCustomerSessionToken,
  verifyCustomerAccountToken,
  verifyCustomerSessionToken,
} from "./index";

describe("customer account token", () => {
  const secret = "test-secret";

  it("round-trips a valid token, defaulting to the 'confirm' purpose", () => {
    const token = createCustomerAccountToken("buyer-1", secret);

    expect(verifyCustomerAccountToken(token, secret)).toEqual({
      buyerAccountId: "buyer-1",
      purpose: "confirm",
    });
  });

  it("round-trips each explicit purpose", () => {
    for (const purpose of [
      "confirm",
      "reset",
      "change-email",
      "change-phone",
    ] as const) {
      const token = createCustomerAccountToken(
        "buyer-1",
        secret,
        purpose,
        purpose === "change-email" ? "new@example.com" : undefined,
      );
      expect(verifyCustomerAccountToken(token, secret)).toEqual({
        buyerAccountId: "buyer-1",
        purpose,
      });
    }
  });

  it("binds a change-email token to the exact target address", () => {
    const token = createCustomerAccountToken(
      "buyer-1",
      secret,
      "change-email",
      "New@Example.com",
    );

    expect(
      verifyCustomerAccountToken(token, secret, "New@Example.com"),
    ).toEqual({ buyerAccountId: "buyer-1", purpose: "change-email" });
    expect(
      verifyCustomerAccountToken(token, secret, "new@example.com"),
    ).toBeNull();
    expect(verifyCustomerAccountToken(token, secret)).toEqual({
      buyerAccountId: "buyer-1",
      purpose: "change-email",
    });
  });

  it("requires a target address when creating a change-email token", () => {
    expect(() =>
      createCustomerAccountToken("buyer-1", secret, "change-email"),
    ).toThrow("A target email is required for change-email tokens");
  });

  it("rejects a token signed with a different secret", () => {
    const token = createCustomerAccountToken("buyer-1", secret);

    expect(verifyCustomerAccountToken(token, "other-secret")).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyCustomerAccountToken("not-a-token", secret)).toBeNull();
    expect(verifyCustomerAccountToken("", secret)).toBeNull();
  });

  it("rejects an expired 'confirm' token", () => {
    const realNow = Date.now;
    Date.now = () => new Date("2020-01-01").getTime();
    const token = createCustomerAccountToken("buyer-1", secret);
    Date.now = () => new Date("2020-02-01").getTime();

    expect(verifyCustomerAccountToken(token, secret)).toBeNull();

    Date.now = realNow;
  });

  it("expires a 'reset' token after its much shorter TTL, while a 'confirm' token from the same moment is still valid", () => {
    const realNow = Date.now;
    Date.now = () => new Date("2020-01-01T00:00:00Z").getTime();
    const resetToken = createCustomerAccountToken("buyer-1", secret, "reset");
    const confirmToken = createCustomerAccountToken(
      "buyer-1",
      secret,
      "confirm",
    );
    Date.now = () => new Date("2020-01-01T02:00:00Z").getTime();

    expect(verifyCustomerAccountToken(resetToken, secret)).toBeNull();
    expect(verifyCustomerAccountToken(confirmToken, secret)).toEqual({
      buyerAccountId: "buyer-1",
      purpose: "confirm",
    });

    Date.now = realNow;
  });
});

describe("customer session token", () => {
  const secret = "test-secret";

  it("round-trips a valid token", () => {
    const token = createCustomerSessionToken("buyer-1", 1, secret);

    expect(verifyCustomerSessionToken(token, secret)).toEqual({
      buyerAccountId: "buyer-1",
      passwordVersion: 1,
    });
  });

  it("rejects a token signed with a different secret", () => {
    const token = createCustomerSessionToken("buyer-1", 1, secret);

    expect(verifyCustomerSessionToken(token, "other-secret")).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyCustomerSessionToken("not-a-token", secret)).toBeNull();
    expect(verifyCustomerSessionToken("", secret)).toBeNull();
  });

  it("rejects an expired token", () => {
    const realNow = Date.now;
    Date.now = () => new Date("2020-01-01").getTime();
    const token = createCustomerSessionToken("buyer-1", 1, secret);
    Date.now = () => new Date("2021-01-01").getTime();

    expect(verifyCustomerSessionToken(token, secret)).toBeNull();

    Date.now = realNow;
  });

  it("invalidates the token when the embedded password version no longer matches", () => {
    const token = createCustomerSessionToken("buyer-1", 1, secret);
    const verified = verifyCustomerSessionToken(token, secret);

    expect(verified?.passwordVersion).not.toBe(2);
  });
});
