import { expect, test } from "vitest";
import { buildCheckoutFormSchema, checkoutResultSchema } from "./checkout.schema";

const validValues = {
  customerName: "",
  customerPhone: "+51999999999",
  customerEmail: "",
  deliveryMethodType: "COURIER",
  pickupPointId: "",
};

test("accepts valid values with no pickup points configured", () => {
  const schema = buildCheckoutFormSchema(false);
  const result = schema.safeParse(validValues);
  expect(result.success).toBe(true);
});

test("rejects a missing phone", () => {
  const schema = buildCheckoutFormSchema(false);
  const result = schema.safeParse({ ...validValues, customerPhone: "" });
  expect(result.success).toBe(false);
});

test("rejects an invalid email when one is provided", () => {
  const schema = buildCheckoutFormSchema(false);
  const result = schema.safeParse({ ...validValues, customerEmail: "not-an-email" });
  expect(result.success).toBe(false);
});

test("accepts an empty email (optional)", () => {
  const schema = buildCheckoutFormSchema(false);
  const result = schema.safeParse({ ...validValues, customerEmail: "" });
  expect(result.success).toBe(true);
});

test("requires a pickup point when the store has pickup points and PICKUP is selected", () => {
  const schema = buildCheckoutFormSchema(true);
  const result = schema.safeParse({
    ...validValues,
    deliveryMethodType: "PICKUP",
    pickupPointId: "",
  });
  expect(result.success).toBe(false);
});

test("does not require a pickup point when the store has none configured", () => {
  const schema = buildCheckoutFormSchema(false);
  const result = schema.safeParse({
    ...validValues,
    deliveryMethodType: "PICKUP",
    pickupPointId: "",
  });
  expect(result.success).toBe(true);
});

test("checkoutResultSchema accepts a null whatsappUrl", () => {
  const result = checkoutResultSchema.safeParse({ order: { id: "o1" }, whatsappUrl: null });
  expect(result.success).toBe(true);
});

test("checkoutResultSchema rejects a missing whatsappUrl", () => {
  const result = checkoutResultSchema.safeParse({ order: { id: "o1" } });
  expect(result.success).toBe(false);
});
