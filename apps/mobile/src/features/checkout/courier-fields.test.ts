import { expect, test } from "vitest";
import { getMobileMessages } from "@biasmarket/i18n/mobile";
import { buildCheckoutFormSchema } from "@biasmarket/validation";
import { courierFieldGroups } from "./courier-fields.js";

const baseForm = {
  customerName: "Ana Bobadilla",
  customerPhone: "999999999",
  customerEmail: "",
  deliveryMethodType: "COURIER",
  pickupPointId: "",
  pickupDate: "",
  paymentMethod: "YAPE",
  paymentType: "FULL",
  courierName: "Olva",
  courierModality: "HOME",
  shippingRecipientName: "Ana",
  shippingRecipientSurnames: "Bobadilla",
  shippingPhone: "999999999",
  shippingDocumentType: "DNI",
  shippingDocumentNumber: "12345678",
  shippingDepartment: "Lima",
  shippingProvince: "Lima",
  shippingDistrict: "Miraflores",
  shippingLine1: "Av. Principal 123",
  shippingLine2: "",
  shippingCity: "Lima",
  shippingRegion: "",
  shippingReference: "Near the park",
  shippingAgencyName: "Olva Miraflores",
  paymentProof: { name: "proof.jpg", type: "image/jpeg", size: 128 },
};

const validationFields = [
  "customerName",
  "shippingRecipientSurnames",
  "shippingDepartment",
  "shippingProvince",
  "shippingDistrict",
] as const;

test.each(["HOME", "AGENCY"] as const)(
  "shows translated validation for every required %s courier field",
  (modality) => {
    const messages = {
      en: getMobileMessages("en").checkout.validation,
      es: getMobileMessages("es").checkout.validation,
    };
    const schema = buildCheckoutFormSchema(false, false);
    const shownFields = [
      "shippingRecipientName",
      "shippingRecipientSurnames",
      "shippingDocumentType",
      "shippingDocumentNumber",
      "shippingPhone",
      ...courierFieldGroups(modality).flatMap(({ fields }) => fields),
    ];

    for (const field of shownFields) {
      const result = schema.safeParse({
        ...baseForm,
        courierModality: modality,
        [field]: "",
      });
      if (!result.success) {
        for (const issue of result.error.issues) {
          const key = String(issue.path[0]) as keyof typeof messages.en;
          expect(
            messages.en[key],
            `missing en checkout.validation.${key}`,
          ).toBeTruthy();
          expect(
            messages.es[key],
            `missing es checkout.validation.${key}`,
          ).toBeTruthy();
        }
      }
    }

    const agencyOrHome = schema.safeParse({
      ...baseForm,
      courierModality: modality,
    });
    expect(agencyOrHome.success).toBe(true);

    for (const key of validationFields) {
      expect(messages.en[key]).toBeTruthy();
      expect(messages.es[key]).toBeTruthy();
    }
  },
);

test("renders the shared location fields for both courier modalities", () => {
  for (const modality of ["HOME", "AGENCY"] as const) {
    expect(courierFieldGroups(modality)[0]?.fields).toEqual([
      "shippingDepartment",
      "shippingProvince",
      "shippingDistrict",
    ]);
  }
});
