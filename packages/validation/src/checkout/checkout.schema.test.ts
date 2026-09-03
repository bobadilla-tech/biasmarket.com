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
  courierName: "Olva",
  courierModality: "HOME",
  shippingRecipientName: "Jane Doe",
  shippingRecipientSurnames: "",
  shippingPhone: "+51999999999",
  shippingDocumentType: "",
  shippingDocumentNumber: "",
  shippingDepartment: "",
  shippingProvince: "",
  shippingDistrict: "",
  shippingLine1: "Av. Principal 123",
  shippingLine2: "",
  shippingCity: "Lima",
  shippingRegion: "",
  shippingReference: "",
  shippingAgencyName: "",
  paymentProof: null,
  paymentType: "FULL",
};

const manualMethodValues = {
  ...validValues,
  deliveryMethodType: "PICKUP",
  pickupPointId: "point-1",
  paymentMethod: "YAPE",
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
  const result = schema.safeParse({ ...validValues, customerEmail: "" });
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
  const result = schema.safeParse({
    ...validValues,
    paymentMethod: "YAPE",
    paymentProof: new File(["x"], "proof.png", { type: "image/png" }),
  });
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

test("requires a shipping address when COURIER HOME is selected", () => {
  const schema = buildCheckoutFormSchema(false, false);
  const result = schema.safeParse({
    ...validValues,
    deliveryMethodType: "COURIER",
    courierModality: "HOME",
    shippingLine1: "",
  });
  expect(result.success).toBe(false);
});

test("requires an agency name when COURIER AGENCY is selected", () => {
  const schema = buildCheckoutFormSchema(false, false);
  const result = schema.safeParse({
    ...validValues,
    deliveryMethodType: "COURIER",
    courierModality: "AGENCY",
    shippingAgencyName: "",
  });
  expect(result.success).toBe(false);
});

test("does not require a shipping address when PICKUP is selected", () => {
  const schema = buildCheckoutFormSchema(false, false);
  const result = schema.safeParse({
    ...validValues,
    deliveryMethodType: "PICKUP",
    courierName: "",
    courierModality: "",
    shippingRecipientName: "",
    shippingPhone: "",
    shippingLine1: "",
    shippingCity: "",
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

test("requires a payment proof for YAPE, PLIN, and TRANSFER", () => {
  const schema = buildCheckoutFormSchema(true, true);
  for (const method of ["YAPE", "PLIN", "TRANSFER"]) {
    const result = schema.safeParse({
      ...manualMethodValues,
      paymentMethod: method,
      paymentProof: null,
    });
    expect(result.success).toBe(false);
  }
});

test("does not require a payment proof for CASH or when no method is picked", () => {
  const schema = buildCheckoutFormSchema(true, true);
  const cash = schema.safeParse({
    ...manualMethodValues,
    paymentMethod: "CASH",
    paymentProof: null,
  });
  // A store with no payment methods configured leaves paymentMethod empty —
  // build with paymentMethodsAvailable=false so the method requirement
  // itself doesn't fail; the point is the proof refine lets it through.
  const noMethodSchema = buildCheckoutFormSchema(true, false);
  const none = noMethodSchema.safeParse({
    ...manualMethodValues,
    paymentMethod: "",
    paymentProof: null,
  });
  expect(cash.success).toBe(true);
  expect(none.success).toBe(true);
});

test("accepts JPEG, PNG, and PDF proofs for a manual method", () => {
  const schema = buildCheckoutFormSchema(true, true);
  const jpeg = new File(["x"], "proof.jpg", { type: "image/jpeg" });
  const png = new File(["x"], "proof.png", { type: "image/png" });
  const pdf = new File(["%PDF"], "proof.pdf", { type: "application/pdf" });
  for (const paymentProof of [jpeg, png, pdf]) {
    const result = schema.safeParse({
      ...manualMethodValues,
      paymentProof,
    });
    expect(result.success).toBe(true);
  }
});

test("accepts a file with an allowed extension even when its MIME type is blank", () => {
  const schema = buildCheckoutFormSchema(true, true);
  const result = schema.safeParse({
    ...manualMethodValues,
    paymentProof: new File(["x"], "proof.pdf"),
  });
  expect(result.success).toBe(true);
});

test("rejects a payment proof larger than 5MB", () => {
  const schema = buildCheckoutFormSchema(true, true);
  const bigFile = new File([new Uint8Array(6 * 1024 * 1024)], "proof.png", {
    type: "image/png",
  });
  const result = schema.safeParse({
    ...manualMethodValues,
    paymentProof: bigFile,
  });
  expect(result.success).toBe(false);
});

test("rejects an unsupported proof type", () => {
  const schema = buildCheckoutFormSchema(true, true);
  const result = schema.safeParse({
    ...manualMethodValues,
    paymentProof: new File(["x"], "proof.txt", { type: "text/plain" }),
  });
  expect(result.success).toBe(false);
});

test("does not require a payment proof for a method the store enabled but never configured", () => {
  const schema = buildCheckoutFormSchema(
    true,
    true,
    new Set(),
    new Set(["YAPE"]),
  );
  const result = schema.safeParse({
    ...manualMethodValues,
    paymentMethod: "YAPE",
    paymentProof: null,
  });
  expect(result.success).toBe(true);
});

test("still requires a payment proof for a configured manual method not in the unconfigured set", () => {
  const schema = buildCheckoutFormSchema(
    true,
    true,
    new Set(),
    new Set(["YAPE"]),
  );
  const result = schema.safeParse({
    ...manualMethodValues,
    paymentMethod: "TRANSFER",
    paymentProof: null,
  });
  expect(result.success).toBe(false);
});
