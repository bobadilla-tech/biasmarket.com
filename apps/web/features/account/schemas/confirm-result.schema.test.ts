import { expect, test } from "vitest";
import { confirmResultSchema } from "./confirm-result.schema";

const validPayload = {
  purpose: "confirm",
  customer: {
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "+1234567890",
    hasPassword: false,
  },
  orders: [
    {
      id: "order-1",
      paymentStatus: "VERIFIED",
      fulfillmentStatus: "READY",
      totalAmount: "42.00",
      currency: "USD",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

test("parses a valid confirm-result payload", () => {
  expect(() => confirmResultSchema.parse(validPayload)).not.toThrow();
});

test("throws when a required field is missing", () => {
  const { customer, ...withoutCustomer } = validPayload;
  void customer;
  expect(() => confirmResultSchema.parse(withoutCustomer)).toThrow();
});

test("throws when paymentStatus is not a known enum value", () => {
  const invalid = {
    ...validPayload,
    orders: [{ ...validPayload.orders[0], paymentStatus: "UNKNOWN" }],
  };
  expect(() => confirmResultSchema.parse(invalid)).toThrow();
});
