import { describe, expect, test } from "vitest";
import {
  canVoidPayment,
  isPendingProof,
  recordableCents,
  reservedPendingCents,
} from "./payment-limits";

const payment = (overrides: Record<string, unknown> = {}) => ({
  amount: "10",
  source: "BUYER_SUBMITTED" as const,
  reviewStatus: "PENDING_REVIEW" as const,
  voidedAt: null,
  ...overrides,
});

describe("reserved and recordable amounts", () => {
  test("only unvoided pending buyer proofs reserve money", () => {
    expect(isPendingProof(payment())).toBe(true);
    expect(isPendingProof(payment({ voidedAt: "2026-10-01T00:00:00Z" }))).toBe(
      false,
    );
    expect(isPendingProof(payment({ reviewStatus: "APPROVED" }))).toBe(false);
    expect(isPendingProof(payment({ source: "SELLER_RECORDED" }))).toBe(false);
  });

  test("sums in cents without float drift", () => {
    expect(
      reservedPendingCents([
        payment({ amount: "0.10" }),
        payment({ amount: "0.20" }),
      ]),
    ).toBe(30);
  });

  test("recordable is the balance minus proofs in review, never negative", () => {
    expect(recordableCents(60, [payment({ amount: "10" })])).toBe(5000);
    expect(recordableCents(59.99, [])).toBe(5999);
    expect(recordableCents(5, [payment({ amount: "10" })])).toBe(0);
  });
});

describe("canVoidPayment", () => {
  const order = (overrides: Record<string, unknown> = {}) => ({
    paymentStatus: "PARTIALLY_PAID",
    fulfillmentStatus: "ORDERING",
    ...overrides,
  });
  const seller = {
    source: "SELLER_RECORDED",
    reviewStatus: "N_A",
    voidedAt: null,
  } as const;
  const approved = {
    source: "BUYER_SUBMITTED",
    reviewStatus: "APPROVED",
    voidedAt: null,
  } as const;

  test("a recorded or approved payment can be voided while ordering", () => {
    expect(canVoidPayment(order(), seller)).toBe(true);
    expect(canVoidPayment(order(), approved)).toBe(true);
    expect(
      canVoidPayment(order({ paymentStatus: "PENDING_PAYMENT" }), seller),
    ).toBe(true);
  });

  test.each(["CANCELLED", "REJECTED", "VERIFIED"])(
    "never on a %s order",
    (paymentStatus) => {
      expect(canVoidPayment(order({ paymentStatus }), seller)).toBe(false);
    },
  );

  test.each(["IN_TRANSIT", "READY", "COMPLETED"])(
    "never once the order is %s",
    (fulfillmentStatus) => {
      expect(canVoidPayment(order({ fulfillmentStatus }), seller)).toBe(false);
    },
  );

  test("not for payments that do not count, or are already voided", () => {
    const pending = {
      source: "BUYER_SUBMITTED",
      reviewStatus: "PENDING_REVIEW",
      voidedAt: null,
    } as const;
    const rejected = {
      source: "BUYER_SUBMITTED",
      reviewStatus: "REJECTED",
      voidedAt: null,
    } as const;
    expect(canVoidPayment(order(), pending)).toBe(false);
    expect(canVoidPayment(order(), rejected)).toBe(false);
    expect(
      canVoidPayment(order(), { ...seller, voidedAt: "2026-10-01T00:00:00Z" }),
    ).toBe(false);
  });
});
