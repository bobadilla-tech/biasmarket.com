import { expect, test } from "vitest";
import { RECEIPT_FULFILLMENT_STATES } from "@biasmarket/utils/order-receipt";
import { canConfirmReceipt } from "./receipt";

const base = {
  paymentStatus: "VERIFIED",
  status: "ACTIVE",
  fulfillmentStatus: "IN_TRANSIT",
} as const;

test.each(RECEIPT_FULFILLMENT_STATES)(
  "can confirm in the shared API state %s",
  (fulfillmentStatus) => {
    expect(canConfirmReceipt({ ...base, fulfillmentStatus })).toBe(true);
  },
);

test("cannot confirm while ordering, unpaid or cancelled", () => {
  expect(canConfirmReceipt({ ...base, fulfillmentStatus: "ORDERING" })).toBe(
    false,
  );
  expect(canConfirmReceipt({ ...base, paymentStatus: "PENDING_PAYMENT" })).toBe(
    false,
  );
  expect(canConfirmReceipt({ ...base, status: "CANCELLED" })).toBe(false);
});
