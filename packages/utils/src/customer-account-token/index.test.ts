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
    const token = createCustomerAccountToken("customer-1", secret);

    expect(verifyCustomerAccountToken(token, secret)).toEqual({
      customerId: "customer-1",
      purpose: "confirm",
    });
  });

  it("round-trips each explicit purpose", () => {
    for (
      const purpose of [
        "confirm",
        "reset",
        "change-email",
        "change-phone",
      ] as const
    ) {
      const token = createCustomerAccountToken("customer-1", secret, purpose);
      expect(verifyCustomerAccountToken(token, secret)).toEqual({
        customerId: "customer-1",
        purpose,
      });
    }
  });

  it("rejects a token signed with a different secret", () => {
    const token = createCustomerAccountToken("customer-1", secret);

    expect(verifyCustomerAccountToken(token, "other-secret")).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyCustomerAccountToken("not-a-token", secret)).toBeNull();
    expect(verifyCustomerAccountToken("", secret)).toBeNull();
  });

  it("rejects an expired 'confirm' token", () => {
    const realNow = Date.now;
    Date.now = () => new Date("2020-01-01").getTime();
    const token = createCustomerAccountToken("customer-1", secret);
    Date.now = () => new Date("2020-02-01").getTime();

    expect(verifyCustomerAccountToken(token, secret)).toBeNull();

    Date.now = realNow;
  });

  it("expires a 'reset' token after its much shorter TTL, while a 'confirm' token from the same moment is still valid", () => {
    const realNow = Date.now;
    Date.now = () => new Date("2020-01-01T00:00:00Z").getTime();
    const resetToken = createCustomerAccountToken(
      "customer-1",
      secret,
      "reset",
    );
    const confirmToken = createCustomerAccountToken(
      "customer-1",
      secret,
      "confirm",
    );
    Date.now = () => new Date("2020-01-01T02:00:00Z").getTime();

    expect(verifyCustomerAccountToken(resetToken, secret)).toBeNull();
    expect(verifyCustomerAccountToken(confirmToken, secret)).toEqual({
      customerId: "customer-1",
      purpose: "confirm",
    });

    Date.now = realNow;
  });
});

describe("customer session token", () => {
  const secret = "test-secret";

  it("round-trips a valid token", () => {
    const token = createCustomerSessionToken(
      "customer-1",
      "store-1",
      "v1",
      secret,
    );

    expect(verifyCustomerSessionToken(token, secret)).toEqual({
      customerId: "customer-1",
      storeId: "store-1",
      passwordVersion: "v1",
    });
  });

  it("rejects a token signed with a different secret", () => {
    const token = createCustomerSessionToken(
      "customer-1",
      "store-1",
      "v1",
      secret,
    );

    expect(verifyCustomerSessionToken(token, "other-secret")).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyCustomerSessionToken("not-a-token", secret)).toBeNull();
    expect(verifyCustomerSessionToken("", secret)).toBeNull();
  });

  it("rejects an expired token", () => {
    const realNow = Date.now;
    Date.now = () => new Date("2020-01-01").getTime();
    const token = createCustomerSessionToken(
      "customer-1",
      "store-1",
      "v1",
      secret,
    );
    Date.now = () => new Date("2021-01-01").getTime();

    expect(verifyCustomerSessionToken(token, secret)).toBeNull();

    Date.now = realNow;
  });
});
