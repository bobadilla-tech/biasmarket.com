import { z } from "zod";
import type { CheckoutResultResponseDto } from "@biasmarket/types";

// Was a zod schema for the Checkout.create response; now a type alias onto
// the generated response DTO — see the OpenAPI note in apps/web/AGENTS.md.
// `whatsappUrl` is `null`, never `undefined`, when the store has no
// WhatsApp number configured (create-order.usecase.ts) — the generated DTO
// already models this correctly (`nullable`, not optional).
export type CheckoutResult = CheckoutResultResponseDto;

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
        !(data.deliveryMethodType === "PICKUP" && pickupPointsAvailable &&
          !data.pickupPointId),
      { message: "pickup point required", path: ["pickupPointId"] },
    );
}

export type CheckoutFormInput = z.infer<
  ReturnType<typeof buildCheckoutFormSchema>
>;
