import { describe, expect, it } from "vitest";
import {
  createCustomerAccountToken,
  createCustomerSessionToken,
  verifyCustomerAccountToken,
  verifyCustomerSessionToken,
} from "./index";

describe("customer account token", () => {
  const secret = "test-secret";

  it("round-trips a valid token", () => {
    const token = createCustomerAccountToken("customer-1", secret);

    expect(verifyCustomerAccountToken(token, secret)).toEqual({ customerId: "customer-1" });
  });

  it("rejects a token signed with a different secret", () => {
    const token = createCustomerAccountToken("customer-1", secret);

    expect(verifyCustomerAccountToken(token, "other-secret")).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyCustomerAccountToken("not-a-token", secret)).toBeNull();
    expect(verifyCustomerAccountToken("", secret)).toBeNull();
  });

  it("rejects an expired token", () => {
    const realNow = Date.now;
    Date.now = () => new Date("2020-01-01").getTime();
    const token = createCustomerAccountToken("customer-1", secret);
    Date.now = () => new Date("2021-01-01").getTime();

    expect(verifyCustomerAccountToken(token, secret)).toBeNull();

    Date.now = realNow;
  });
});

describe("customer session token", () => {
  const secret = "test-secret";

  it("round-trips a valid token", () => {
    const token = createCustomerSessionToken("customer-1", "store-1", "v1", secret);

    expect(verifyCustomerSessionToken(token, secret)).toEqual({
      customerId: "customer-1",
      storeId: "store-1",
      passwordVersion: "v1",
    });
  });

  it("rejects a token signed with a different secret", () => {
    const token = createCustomerSessionToken("customer-1", "store-1", "v1", secret);

    expect(verifyCustomerSessionToken(token, "other-secret")).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyCustomerSessionToken("not-a-token", secret)).toBeNull();
    expect(verifyCustomerSessionToken("", secret)).toBeNull();
  });

  it("rejects an expired token", () => {
    const realNow = Date.now;
    Date.now = () => new Date("2020-01-01").getTime();
    const token = createCustomerSessionToken("customer-1", "store-1", "v1", secret);
    Date.now = () => new Date("2021-01-01").getTime();

    expect(verifyCustomerSessionToken(token, secret)).toBeNull();

    Date.now = realNow;
  });
});
