import { z } from "zod";

export const deliveryMethodSchema = z.object({
  type: z.enum(["PICKUP", "COURIER"]),
  enabled: z.boolean(),
  details: z.record(z.string(), z.unknown()),
});

export const deliveryMethodListSchema = z.array(deliveryMethodSchema);

export const pickupPointSchema = z.object({
  id: z.string(),
  label: z.string(),
  enabled: z.boolean(),
});

export const pickupPointListSchema = z.array(pickupPointSchema);

// `whatsappUrl` is `null`, never `undefined`, when the store has no WhatsApp
// number configured (create-order.usecase.ts) — `.nullable()`, not
// `.optional()`, or a completed checkout without WhatsApp throws on parse.
export const checkoutResultSchema = z.object({
  order: z.object({ id: z.string() }),
  whatsappUrl: z.string().nullable(),
});

export type DeliveryMethod = z.infer<typeof deliveryMethodSchema>;
export type PickupPoint = z.infer<typeof pickupPointSchema>;
export type CheckoutResult = z.infer<typeof checkoutResultSchema>;

// Pickup point is only required when the store actually has pickup points
// configured — built per-load since that depends on the fetched list, same
// shape as orders' buildRegisterPaymentSchema(maxAmount).
export function buildCheckoutFormSchema(pickupPointsAvailable: boolean) {
  return z
    .object({
      customerName: z.string(),
      customerPhone: z.string().min(1, "phone required"),
      customerEmail: z.union([z.literal(""), z.string().email()]),
      deliveryMethodType: z.string().min(1, "delivery method required"),
      pickupPointId: z.string(),
    })
    .refine(
      (data) =>
        !(data.deliveryMethodType === "PICKUP" && pickupPointsAvailable && !data.pickupPointId),
      { message: "pickup point required", path: ["pickupPointId"] },
    );
}

export type CheckoutFormInput = z.infer<ReturnType<typeof buildCheckoutFormSchema>>;
