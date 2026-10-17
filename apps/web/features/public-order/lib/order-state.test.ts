import { describe, expect, test } from "vitest";
import {
  canSubmitProof,
  getBannerKey,
  hasPendingProof,
  isClosedOrder,
  reservedPendingAmount,
  submittableCents,
} from "./order-state";
import { makeOrder, makePayment } from "../test-fixtures";

const NOW = new Date("2026-10-28T12:00:00.000Z");
const pending = (amount = "10", id = "p") =>
  makePayment({ id, amount, reviewStatus: "PENDING_REVIEW" });

describe("getBannerKey", () => {
  test("cancelled, expired and legacy cancelled", () => {
    const cancelled = {
      status: "CANCELLED",
      paymentStatus: "CANCELLED",
    } as const;
    expect(
      getBannerKey(
        makeOrder({
          ...cancelled,
          closure: { kind: "CANCELLED", reason: null },
        }),
      ),
    ).toBe("cancelled");
    expect(
      getBannerKey(
        makeOrder({ ...cancelled, closure: { kind: "EXPIRED", reason: null } }),
      ),
    ).toBe("expired");
    expect(getBannerKey(makeOrder({ ...cancelled, closure: null }))).toBe(
      "cancelled",
    );
  });

  test("fulfillment states win over payment states, IN_TRANSIT included", () => {
    expect(getBannerKey(makeOrder({ fulfillmentStatus: "IN_TRANSIT" }))).toBe(
      "inTransit",
    );
    expect(getBannerKey(makeOrder({ fulfillmentStatus: "READY" }))).toBe(
      "ready",
    );
    expect(getBannerKey(makeOrder({ fulfillmentStatus: "COMPLETED" }))).toBe(
      "completed",
    );
  });

  test("a pending proof switches PENDING_PAYMENT and PARTIALLY_PAID to in review", () => {
    expect(getBannerKey(makeOrder())).toBe("pendingPayment");
    expect(getBannerKey(makeOrder({ payments: [pending()] }))).toBe(
      "paymentSubmitted",
    );
    expect(
      getBannerKey(
        makeOrder({ paymentStatus: "PARTIALLY_PAID", payments: [pending()] }),
      ),
    ).toBe("paymentSubmitted");
    expect(getBannerKey(makeOrder({ paymentStatus: "PARTIALLY_PAID" }))).toBe(
      "partiallyPaid",
    );
  });

  test("a voided pending proof does not count as in review", () => {
    const voided = makePayment({ voidedAt: "2026-09-02T00:00:00.000Z" });
    expect(getBannerKey(makeOrder({ payments: [voided] }))).toBe(
      "pendingPayment",
    );
  });

  test("VERIFIED and REJECTED keep their own banner despite a pending proof", () => {
    expect(
      getBannerKey(
        makeOrder({ paymentStatus: "VERIFIED", payments: [pending()] }),
      ),
    ).toBe("verified");
    expect(
      getBannerKey(
        makeOrder({ paymentStatus: "REJECTED", payments: [pending()] }),
      ),
    ).toBe("rejected");
  });
});

describe("pending proofs", () => {
  test("hasPendingProof is false on cancelled orders", () => {
    const cancelled = makeOrder({
      status: "CANCELLED",
      paymentStatus: "CANCELLED",
      payments: [pending()],
    });
    expect(hasPendingProof(cancelled)).toBe(false);
    expect(isClosedOrder(cancelled)).toBe(true);
  });

  test("a rejected order is closed", () => {
    expect(isClosedOrder(makeOrder({ paymentStatus: "REJECTED" }))).toBe(true);
    expect(isClosedOrder(makeOrder())).toBe(false);
  });

  test("reserved amount is summed in cents, ignoring voided proofs", () => {
    const order = makeOrder({
      payments: [
        pending("0.10", "a"),
        pending("0.20", "b"),
        makePayment({
          id: "c",
          amount: "5",
          voidedAt: "2026-09-02T00:00:00.000Z",
        }),
      ],
    });
    expect(reservedPendingAmount(order)).toBe(30);
  });

  test("submittable cents subtract the reserved proofs and never go negative", () => {
    expect(
      submittableCents(
        makeOrder({ pendingAmount: 30, payments: [pending("10")] }),
      ),
    ).toBe(2000);
    expect(
      submittableCents(
        makeOrder({ pendingAmount: 5, payments: [pending("10")] }),
      ),
    ).toBe(0);
  });
});

describe("canSubmitProof", () => {
  test.each([
    "PENDING_PAYMENT",
    "PARTIALLY_PAID",
    "PAYMENT_SUBMITTED",
  ] as const)("allows %s with a balance", (paymentStatus) => {
    expect(canSubmitProof(makeOrder({ paymentStatus }), NOW)).toBe(true);
  });

  test("allows a VERIFIED order with a residual balance only", () => {
    expect(
      canSubmitProof(
        makeOrder({ paymentStatus: "VERIFIED", pendingAmount: 20 }),
        NOW,
      ),
    ).toBe(true);
    expect(
      canSubmitProof(
        makeOrder({ paymentStatus: "VERIFIED", pendingAmount: 0 }),
        NOW,
      ),
    ).toBe(false);
  });

  test.each([
    ["REJECTED", { paymentStatus: "REJECTED" }],
    ["CANCELLED", { status: "CANCELLED", paymentStatus: "CANCELLED" }],
    ["IN_TRANSIT", { fulfillmentStatus: "IN_TRANSIT" }],
    ["READY", { fulfillmentStatus: "READY" }],
    ["COMPLETED", { fulfillmentStatus: "COMPLETED" }],
  ] as const)("rejects %s", (_name, patch) => {
    expect(canSubmitProof(makeOrder(patch), NOW)).toBe(false);
  });

  test("rejects after the deadline, allows before it", () => {
    expect(
      canSubmitProof(makeOrder({ expiresAt: "2026-10-28T11:00:00.000Z" }), NOW),
    ).toBe(false);
    expect(
      canSubmitProof(makeOrder({ expiresAt: "2026-10-28T13:00:00.000Z" }), NOW),
    ).toBe(true);
  });

  test("rejects when pending proofs already cover the balance", () => {
    expect(
      canSubmitProof(
        makeOrder({ pendingAmount: 30, payments: [pending("30")] }),
        NOW,
      ),
    ).toBe(false);
  });

  test("rejects at the cap of five pending proofs, allows four", () => {
    const proofs = (n: number) =>
      Array.from({ length: n }, (_, i) => pending("1", `p${i}`));
    expect(
      canSubmitProof(
        makeOrder({ pendingAmount: 30, payments: proofs(5) }),
        NOW,
      ),
    ).toBe(false);
    expect(
      canSubmitProof(
        makeOrder({ pendingAmount: 30, payments: proofs(4) }),
        NOW,
      ),
    ).toBe(true);
  });
});
