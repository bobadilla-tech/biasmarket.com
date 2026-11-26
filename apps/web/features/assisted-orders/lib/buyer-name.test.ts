import { expect, test } from "vitest";
import { buildAssistedOrderSchema } from "@biasmarket/validation";
import { withRequiredBuyerName } from "./buyer-name";

const valid = {
  customerPhone: "987654321",
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

test("the shared schema still accepts an order without a name", () => {
  expect(buildAssistedOrderSchema(false, false).safeParse(valid).success).toBe(
    true,
  );
});

test("the create-order form requires a non-blank buyer name", () => {
  const schema = withRequiredBuyerName(buildAssistedOrderSchema(false, false));
  const missing = schema.safeParse(valid);
  expect(missing.success).toBe(false);
  if (!missing.success) {
    expect(missing.error.issues.map((issue) => issue.message)).toContain(
      "alias required",
    );
  }
  expect(
    schema.safeParse({ ...valid, customerName: "   " }).success,
  ).toBe(false);
  expect(schema.safeParse({ ...valid, customerName: "Vale" }).success).toBe(
    true,
  );
});
