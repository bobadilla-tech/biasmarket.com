import { z } from "zod";

// Pickup point / payment method are only required when the store actually
// has that option configured — built per-load since that depends on the
// fetched list, same shape as orders' buildRegisterPaymentSchema(maxAmount).
export function buildCheckoutFormSchema(
  pickupPointsAvailable: boolean,
  paymentMethodsAvailable: boolean,
) {
  return z
    .object({
      customerName: z.string(),
      customerPhone: z.string().min(1, "phone required"),
      customerEmail: z.string().email("invalid email"),
      deliveryMethodType: z.string().min(1, "delivery method required"),
      pickupPointId: z.string(),
      paymentMethod: z.string(),
    })
    .refine(
      (data) =>
        !(data.deliveryMethodType === "PICKUP" && pickupPointsAvailable &&
          !data.pickupPointId),
      { message: "pickup point required", path: ["pickupPointId"] },
    )
    .refine(
      (data) => !(paymentMethodsAvailable && !data.paymentMethod),
      { message: "payment method required", path: ["paymentMethod"] },
    );
}

export type CheckoutFormInput = z.infer<
  ReturnType<typeof buildCheckoutFormSchema>
>;
