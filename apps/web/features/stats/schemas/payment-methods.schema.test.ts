import { expect, test } from "vitest";
import { paymentMethodsBreakdownSchema } from "./payment-methods.schema";

const valid = {
  from: "2026-08-01T00:00:00.000Z",
  to: "2026-08-16T00:00:00.000Z",
  totalAmount: 100,
  totalCount: 3,
  byMethod: [
    { method: "YAPE", amount: 60, count: 2, percentage: 60 },
    { method: "PLIN", amount: 0, count: 0, percentage: 0 },
    { method: "TRANSFER", amount: 0, count: 0, percentage: 0 },
    { method: "CASH", amount: 40, count: 1, percentage: 40 },
  ],
};

test("parses a full payment-methods breakdown payload", () => {
  expect(paymentMethodsBreakdownSchema.safeParse(valid).success).toBe(true);
});

test("parses a legacy row with a null method", () => {
  expect(
    paymentMethodsBreakdownSchema.safeParse({
      ...valid,
      byMethod: [...valid.byMethod, { method: null, amount: 5, count: 1, percentage: 5 }],
    }).success,
  ).toBe(true);
});

test("rejects an unknown payment method", () => {
  expect(
    paymentMethodsBreakdownSchema.safeParse({
      ...valid,
      byMethod: [{ method: "BITCOIN", amount: 5, count: 1, percentage: 100 }],
    }).success,
  ).toBe(false);
});
