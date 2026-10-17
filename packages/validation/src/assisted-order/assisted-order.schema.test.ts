import { expect, test } from "vitest";
import { buildAssistedOrderSchema } from "./assisted-order.schema";

const valid = {
  customerPhone: "987 654 321",
  customerName: "",
  items: [{ productId: "p1", variantId: "", quantity: 1 }],
  deliveryMethodType: "PICKUP",
  pickupPointId: "",
  pickupDate: "",
  paymentMethod: "",
  paymentType: "FULL" as const,
  courierName: "",
  courierModality: "" as const,
  shippingRecipientName: "",
  shippingRecipientSurnames: "",
  shippingPhone: "",
  shippingDocumentType: "" as const,
  shippingDocumentNumber: "",
  shippingDepartment: "",
  shippingProvince: "",
  shippingDistrict: "",
  shippingLine1: "",
  shippingLine2: "",
  shippingCity: "",
  shippingRegion: "",
  shippingReference: "",
  shippingAgencyName: "",
};

const messagesOf = (
  result: ReturnType<ReturnType<typeof buildAssistedOrderSchema>["safeParse"]>,
) => (result.success ? [] : result.error.issues.map((i) => i.message));

test("accepts a minimal valid pickup order without alias, email or proof", () => {
  expect(buildAssistedOrderSchema(false, false).safeParse(valid).success).toBe(
    true,
  );
});

test("validates the phone for real, not just non-empty", () => {
  const schema = buildAssistedOrderSchema(false, false);
  expect(
    messagesOf(schema.safeParse({ ...valid, customerPhone: "" })),
  ).toContain("phone required");
  for (const customerPhone of ["abc", "12345", "812345678", "+99 123456789"]) {
    expect(messagesOf(schema.safeParse({ ...valid, customerPhone }))).toContain(
      "phone invalid",
    );
  }
  for (const customerPhone of ["987654321", "+51 987 654 321", "51987654321"]) {
    expect(schema.safeParse({ ...valid, customerPhone }).success).toBe(true);
  }
});

test("alias is optional, capped at 60 and rejects control characters", () => {
  const schema = buildAssistedOrderSchema(false, false);
  expect(schema.safeParse({ ...valid, customerName: "Sofi" }).success).toBe(
    true,
  );
  expect(
    messagesOf(schema.safeParse({ ...valid, customerName: "x".repeat(61) })),
  ).toContain("alias too long");
  expect(
    messagesOf(schema.safeParse({ ...valid, customerName: "a\u0007b" })),
  ).toContain("alias invalid");
});

test("needs at least one item with a quantity of 1 or more", () => {
  const schema = buildAssistedOrderSchema(false, false);
  expect(messagesOf(schema.safeParse({ ...valid, items: [] }))).toContain(
    "items required",
  );
  expect(
    messagesOf(
      schema.safeParse({
        ...valid,
        items: [{ productId: "p1", variantId: "", quantity: 0 }],
      }),
    ),
  ).toContain("quantity invalid");
});

test("applies the checkout's pickup and payment rules", () => {
  const schema = buildAssistedOrderSchema(true, true, new Set(["closed"]));
  expect(messagesOf(schema.safeParse(valid))).toEqual(
    expect.arrayContaining([
      "pickup point required",
      "payment method required",
    ]),
  );
  const withPoint = {
    ...valid,
    pickupPointId: "closed",
    paymentMethod: "YAPE",
  };
  expect(messagesOf(schema.safeParse(withPoint))).toContain(
    "pickup date required",
  );
  expect(
    schema.safeParse({ ...withPoint, pickupDate: "2026-11-03" }).success,
  ).toBe(true);
});

test("applies the checkout's courier rules", () => {
  const schema = buildAssistedOrderSchema(false, false);
  const courier = { ...valid, deliveryMethodType: "COURIER" };
  expect(messagesOf(schema.safeParse(courier))).toEqual(
    expect.arrayContaining([
      "courier name required",
      "courier modality required",
      "shipping recipient name required",
      "shipping phone required",
    ]),
  );
  const home = {
    ...courier,
    courierName: "Olva",
    courierModality: "HOME" as const,
    shippingRecipientName: "Ana",
    shippingPhone: "999111222",
  };
  expect(messagesOf(schema.safeParse(home))).toEqual(
    expect.arrayContaining([
      "shipping address required",
      "shipping city required",
    ]),
  );
  const agency = { ...home, courierModality: "AGENCY" as const };
  expect(messagesOf(schema.safeParse(agency))).toContain(
    "agency name required",
  );
  expect(
    schema.safeParse({ ...agency, shippingAgencyName: "Olva Miraflores" })
      .success,
  ).toBe(true);
});
