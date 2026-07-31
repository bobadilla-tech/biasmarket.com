import { describe, expect, it } from "vitest";
import { createCustomerAccountToken, verifyCustomerAccountToken } from "./index";

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
