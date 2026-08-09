import { z } from "zod";

// Pickup point / payment method are only required when the store actually
// has that option configured — built per-load since that depends on the
// fetched list, same shape as orders' buildRegisterPaymentSchema(maxAmount).
// `pointsRequiringDate` is the set of pickup-point IDs that aren't open
// today (per getPickupAvailability) — selecting one of those now requires a
// pickupDate too, since the card is selectable rather than disabled.
export function buildCheckoutFormSchema(
  pickupPointsAvailable: boolean,
  paymentMethodsAvailable: boolean,
  pointsRequiringDate: ReadonlySet<string> = new Set(),
) {
  return z
    .object({
      customerName: z.string(),
      customerPhone: z.string().min(1, "phone required"),
      customerEmail: z.string().email("invalid email"),
      deliveryMethodType: z.string().min(1, "delivery method required"),
      pickupPointId: z.string(),
      pickupDate: z.string(),
      paymentMethod: z.string(),
      // Only required for COURIER (validated below) — inline fields, no
      // addressId picker, see the plan doc referenced above.
      shippingRecipientName: z.string(),
      shippingPhone: z.string(),
      shippingLine1: z.string(),
      shippingLine2: z.string(),
      shippingCity: z.string(),
      shippingRegion: z.string(),
      shippingReference: z.string(),
    })
    .refine(
      (data) =>
        !(data.deliveryMethodType === "PICKUP" && pickupPointsAvailable &&
          !data.pickupPointId),
      { message: "pickup point required", path: ["pickupPointId"] },
    )
    .refine(
      (data) =>
        !(data.deliveryMethodType === "PICKUP" &&
          pointsRequiringDate.has(data.pickupPointId) &&
          !data.pickupDate),
      { message: "pickup date required", path: ["pickupDate"] },
    )
    .refine(
      (data) => !(paymentMethodsAvailable && !data.paymentMethod),
      { message: "payment method required", path: ["paymentMethod"] },
    )
    .refine(
      (data) =>
        !(data.deliveryMethodType === "COURIER" &&
          !data.shippingRecipientName),
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
      (data) => !(data.deliveryMethodType === "COURIER" && !data.shippingLine1),
      { message: "shipping address required", path: ["shippingLine1"] },
    )
    .refine(
      (data) => !(data.deliveryMethodType === "COURIER" && !data.shippingCity),
      { message: "shipping city required", path: ["shippingCity"] },
    );
}

export type CheckoutFormInput = z.infer<
  ReturnType<typeof buildCheckoutFormSchema>
>;
