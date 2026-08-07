import { expect, test } from "vitest";
import { buildCheckoutFormSchema } from "./checkout.schema";

const validValues = {
  customerName: "",
  customerPhone: "+51999999999",
  customerEmail: "jane@example.com",
  deliveryMethodType: "COURIER",
  pickupPointId: "",
  pickupDate: "",
  paymentMethod: "",
};

test("accepts valid values with no pickup points or payment methods configured", () => {
  const schema = buildCheckoutFormSchema(false, false);
  const result = schema.safeParse(validValues);
  expect(result.success).toBe(true);
});

test("rejects a missing phone", () => {
  const schema = buildCheckoutFormSchema(false, false);
  const result = schema.safeParse({ ...validValues, customerPhone: "" });
  expect(result.success).toBe(false);
});

test("rejects an invalid email when one is provided", () => {
  const schema = buildCheckoutFormSchema(false, false);
  const result = schema.safeParse({
    ...validValues,
    customerEmail: "not-an-email",
  });
  expect(result.success).toBe(false);
});

test("rejects an empty email (required)", () => {
  const schema = buildCheckoutFormSchema(false, false);
  const result = schema.safeParse({ ...validValues,customerEmail: "",});
  expect(result.success).toBe(false);
});

test("requires a pickup point when the store has pickup points and PICKUP is selected", () => {
  const schema = buildCheckoutFormSchema(true, false);
  const result = schema.safeParse({
    ...validValues,
    deliveryMethodType: "PICKUP",
    pickupPointId: "",
  });
  expect(result.success).toBe(false);
});

test("does not require a pickup point when the store has none configured", () => {
  const schema = buildCheckoutFormSchema(false, false);
  const result = schema.safeParse({
    ...validValues,
    deliveryMethodType: "PICKUP",
    pickupPointId: "",
  });
  expect(result.success).toBe(true);
});

test("requires a payment method when the store has payment methods configured", () => {
  const schema = buildCheckoutFormSchema(false, true);
  const result = schema.safeParse({ ...validValues, paymentMethod: "" });
  expect(result.success).toBe(false);
});

test("does not require a payment method when the store has none configured", () => {
  const schema = buildCheckoutFormSchema(false, false);
  const result = schema.safeParse({ ...validValues, paymentMethod: "" });
  expect(result.success).toBe(true);
});

test("accepts a selected payment method when the store has payment methods configured", () => {
  const schema = buildCheckoutFormSchema(false, true);
  const result = schema.safeParse({ ...validValues, paymentMethod: "YAPE" });
  expect(result.success).toBe(true);
});

test("requires a pickup date when the selected point isn't open today", () => {
  const schema = buildCheckoutFormSchema(true, false, new Set(["point-1"]));
  const result = schema.safeParse({
    ...validValues,
    deliveryMethodType: "PICKUP",
    pickupPointId: "point-1",
    pickupDate: "",
  });
  expect(result.success).toBe(false);
});

test("accepts a pickup date when the selected point isn't open today and a date was provided", () => {
  const schema = buildCheckoutFormSchema(true, false, new Set(["point-1"]));
  const result = schema.safeParse({
    ...validValues,
    deliveryMethodType: "PICKUP",
    pickupPointId: "point-1",
    pickupDate: "2026-08-10",
  });
  expect(result.success).toBe(true);
});

test("does not require a pickup date for a point open today", () => {
  const schema = buildCheckoutFormSchema(true, false, new Set(["point-1"]));
  const result = schema.safeParse({
    ...validValues,
    deliveryMethodType: "PICKUP",
    pickupPointId: "point-2",
    pickupDate: "",
  });
  expect(result.success).toBe(true);
});
