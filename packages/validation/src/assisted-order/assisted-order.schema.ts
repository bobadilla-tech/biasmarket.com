import { z } from "zod";
import { validatePhone } from "@biasmarket/utils/phone-country";

// Seller-side form for an order created on behalf of a buyer known only by
// WhatsApp number. Mirrors checkout.schema.ts (same delivery/payment rules,
// flat `shipping*` fields) but has no email and no proof of payment, and
// validates the phone for real instead of `min(1)`.
//
// Messages are stable codes, not copy: the form maps each code to a
// translated string, same as the checkout form.

const itemSchema = z.object({
  productId: z.string().min(1, "product required"),
  variantId: z.string(),
  quantity: z
    .number("quantity required")
    .int("quantity invalid")
    .min(1, "quantity invalid"),
});

export type AssistedOrderItemInput = z.infer<typeof itemSchema>;

export function buildAssistedOrderSchema(
  pickupPointsAvailable: boolean,
  paymentMethodsAvailable: boolean,
  pointsRequiringDate: ReadonlySet<string> = new Set(),
) {
  return z
    .object({
      customerPhone: z.string().superRefine((value, ctx) => {
        if (!value.trim()) {
          ctx.addIssue({ code: "custom", message: "phone required" });
        } else if (!validatePhone(value).ok) {
          ctx.addIssue({ code: "custom", message: "phone invalid" });
        }
      }),
      customerName: z
        .string()
        .max(60, "alias too long")
        .refine((value) => !/\p{Cc}/u.test(value), "alias invalid"),
      items: z.array(itemSchema).min(1, "items required"),
      deliveryMethodType: z.string().min(1, "delivery method required"),
      pickupPointId: z.string(),
      pickupDate: z.string(),
      paymentMethod: z.string(),
      paymentType: z.enum(["FULL", "PARTIAL"]),
      courierName: z.string(),
      courierModality: z.enum(["", "AGENCY", "HOME"]),
      shippingRecipientName: z.string(),
      shippingRecipientSurnames: z.string(),
      shippingPhone: z.string(),
      shippingDocumentType: z.enum(["", "DNI", "CE", "RUC", "PASSPORT"]),
      shippingDocumentNumber: z.string(),
      shippingDepartment: z.string(),
      shippingProvince: z.string(),
      shippingDistrict: z.string(),
      shippingLine1: z.string(),
      shippingLine2: z.string(),
      shippingCity: z.string(),
      shippingRegion: z.string(),
      shippingReference: z.string(),
      shippingAgencyName: z.string(),
    })
    .refine(
      (data) =>
        !(
          data.deliveryMethodType === "PICKUP" &&
          pickupPointsAvailable &&
          !data.pickupPointId
        ),
      { message: "pickup point required", path: ["pickupPointId"] },
    )
    .refine(
      (data) =>
        !(
          data.deliveryMethodType === "PICKUP" &&
          pointsRequiringDate.has(data.pickupPointId) &&
          !data.pickupDate
        ),
      { message: "pickup date required", path: ["pickupDate"] },
    )
    .refine((data) => !(paymentMethodsAvailable && !data.paymentMethod), {
      message: "payment method required",
      path: ["paymentMethod"],
    })
    .refine(
      (data) => !(data.deliveryMethodType === "COURIER" && !data.courierName),
      { message: "courier name required", path: ["courierName"] },
    )
    .refine(
      (data) =>
        !(data.deliveryMethodType === "COURIER" && !data.courierModality),
      { message: "courier modality required", path: ["courierModality"] },
    )
    .refine(
      (data) =>
        !(data.deliveryMethodType === "COURIER" && !data.shippingRecipientName),
      {
        message: "shipping recipient name required",
        path: ["shippingRecipientName"],
      },
    )
    .refine(
      (data) => !(data.deliveryMethodType === "COURIER" && !data.shippingPhone),
      { message: "shipping phone required", path: ["shippingPhone"] },
    )
    .refine(
      (data) =>
        !(
          data.deliveryMethodType === "COURIER" &&
          data.courierModality === "HOME" &&
          !data.shippingLine1
        ),
      { message: "shipping address required", path: ["shippingLine1"] },
    )
    .refine(
      (data) =>
        !(
          data.deliveryMethodType === "COURIER" &&
          data.courierModality === "HOME" &&
          !data.shippingCity
        ),
      { message: "shipping city required", path: ["shippingCity"] },
    )
    .refine(
      (data) =>
        !(
          data.deliveryMethodType === "COURIER" &&
          data.courierModality === "AGENCY" &&
          !data.shippingAgencyName
        ),
      { message: "agency name required", path: ["shippingAgencyName"] },
    );
}

export type AssistedOrderFormInput = z.infer<
  ReturnType<typeof buildAssistedOrderSchema>
>;
