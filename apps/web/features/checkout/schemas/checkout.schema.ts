import { z } from "zod";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const ACCEPTED_EXTENSION = /\.(jpe?g|png|pdf)$/i;

// Mirrors the backend's checkout proof rules (see checkout.controller.ts):
// required only for manual methods (YAPE/PLIN/TRANSFER — the buyer uploads
// it at checkout), ≤5MB, JPEG/PNG/PDF. `file.type` is empty for some
// oddball browsers/extensions, so the filename extension is accepted as a
// fallback, same spirit as register-payment's MIME-only check but without
// rejecting a valid PDF whose MIME the platform left blank.
function isValidProofFile(file: File): boolean {
  return (
    ACCEPTED_MIME_TYPES.includes(file.type) ||
    ACCEPTED_EXTENSION.test(file.name)
  );
}

const MANUAL_METHODS = ["YAPE", "PLIN", "TRANSFER"];

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
      paymentType: z.enum(["FULL", "PARTIAL"]),
      // Only required for COURIER (validated below) — inline fields, no
      // addressId picker, see the plan doc referenced above.
      shippingRecipientName: z.string(),
      shippingPhone: z.string(),
      shippingLine1: z.string(),
      shippingLine2: z.string(),
      shippingCity: z.string(),
      shippingRegion: z.string(),
      shippingReference: z.string(),
      paymentProof: z
        .custom<File | null>(() => true)
        .nullable()
        .refine((file) => !file || file.size <= MAX_FILE_SIZE, "file too large")
        .refine((file) => !file || isValidProofFile(file), "invalid file type"),
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
      (data) =>
        // The upload field is only rendered for a picked manual method, but
        // validate unconditionally so a cleared file can't sneak through.
        !(MANUAL_METHODS as readonly string[]).includes(data.paymentMethod) ||
        !!data.paymentProof,
      { message: "proof required", path: ["paymentProof"] },
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
