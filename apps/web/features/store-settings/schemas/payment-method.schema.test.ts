import { expect, test } from "vitest";
import { paymentMethodConfigListSchema } from "./payment-method.schema";

test("parses a list of payment method configs", () => {
  const result = paymentMethodConfigListSchema.safeParse([
    { method: "YAPE", enabled: true },
    { method: "CASH", enabled: false },
  ]);
  expect(result.success).toBe(true);
});

test("rejects an unknown payment method", () => {
  const result = paymentMethodConfigListSchema.safeParse([{
    method: "BITCOIN",
    enabled: true,
  }]);
  expect(result.success).toBe(false);
});
