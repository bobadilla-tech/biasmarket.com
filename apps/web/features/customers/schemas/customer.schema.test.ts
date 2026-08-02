import { expect, test } from "vitest";
import { customerListItemSchema } from "./customer.schema";

const valid = {
  id: "customer-1",
  name: "Ana",
  phone: "+51987654321",
  email: "ana@example.com",
  emailVerified: true,
  createdAt: "2026-08-01T12:00:00.000Z",
  orderCount: 3,
  lifetimeSpend: 80,
  lastOrderAt: "2026-08-01T12:00:00.000Z",
};

test("parses a full customer list item", () => {
  expect(customerListItemSchema.safeParse(valid).success).toBe(true);
});

test("accepts a customer with no email and no orders yet", () => {
  const result = customerListItemSchema.safeParse({
    ...valid,
    email: null,
    orderCount: 0,
    lifetimeSpend: 0,
    lastOrderAt: null,
  });
  expect(result.success).toBe(true);
});

test("rejects a payload missing phone", () => {
  const { phone, ...rest } = valid;
  void phone;
  expect(customerListItemSchema.safeParse(rest).success).toBe(false);
});
