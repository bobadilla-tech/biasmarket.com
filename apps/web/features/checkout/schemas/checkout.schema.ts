import { z } from "zod";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const ACCEPTED_EXTENSION = /\.(jpe?g|png|pdf)$/i;

function isValidProofFile(file: File): boolean {
  return (
    ACCEPTED_MIME_TYPES.includes(file.type) ||
    ACCEPTED_EXTENSION.test(file.name)
  );
}

const MANUAL_METHODS = ["YAPE", "PLIN", "TRANSFER"];

export function buildCheckoutFormSchema(
  pickupPointsAvailable: boolean,
  paymentMethodsAvailable: boolean,
  pointsRequiringDate: ReadonlySet<string> = new Set(),
) {
  return (
    z
      .object({
        customerName: z.string(),
        customerPhone: z.string().min(1, "phone required"),
        customerEmail: z.string().email("invalid email"),
        deliveryMethodType: z.string().min(1, "delivery method required"),
        pickupPointId: z.string(),
        pickupDate: z.string(),
        paymentMethod: z.string(),
        paymentType: z.enum(["FULL", "PARTIAL"]),
        courierName: z.string(),
        courierModality: z.enum(["", "AGENCY", "HOME"]),
        // Peru-specific common fields
        shippingRecipientName: z.string(),
        shippingRecipientSurnames: z.string(),
        shippingPhone: z.string(),
        shippingDocumentType: z.enum(["", "DNI", "PASSPORT"]),
        shippingDocumentNumber: z.string(),
        shippingDepartment: z.string(),
        shippingProvince: z.string(),
        shippingDistrict: z.string(),
        // Address fields (HOME modality)
        shippingLine1: z.string(),
        shippingLine2: z.string(),
        shippingCity: z.string(),
        shippingRegion: z.string(),
        shippingReference: z.string(),
        // AGENCY modality
        shippingAgencyName: z.string(),
        paymentProof: z
          .custom<File | null>(() => true)
          .nullable()
          .refine(
            (file) => !file || file.size <= MAX_FILE_SIZE,
            "file too large",
          )
          .refine(
            (file) => !file || isValidProofFile(file),
            "invalid file type",
          ),
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
          !(MANUAL_METHODS as readonly string[]).includes(data.paymentMethod) ||
          !!data.paymentProof,
        { message: "proof required", path: ["paymentProof"] },
      )
      // COURIER: courier name required
      .refine(
        (data) => !(data.deliveryMethodType === "COURIER" && !data.courierName),
        {
          message: "courier name required",
          path: ["courierName"],
        },
      )
      // COURIER: modality required
      .refine(
        (data) =>
          !(data.deliveryMethodType === "COURIER" && !data.courierModality),
        {
          message: "courier modality required",
          path: ["courierModality"],
        },
      )
      // Common fields: recipient name, phone required for COURIER
      .refine(
        (data) =>
          !(
            data.deliveryMethodType === "COURIER" && !data.shippingRecipientName
          ),
        {
          message: "shipping recipient name required",
          path: ["shippingRecipientName"],
        },
      )
      .refine(
        (data) =>
          !(data.deliveryMethodType === "COURIER" && !data.shippingPhone),
        { message: "shipping phone required", path: ["shippingPhone"] },
      )
      // HOME modality: address and city required
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
      // AGENCY modality: agency name required
      .refine(
        (data) =>
          !(
            data.deliveryMethodType === "COURIER" &&
            data.courierModality === "AGENCY" &&
            !data.shippingAgencyName
          ),
        { message: "agency name required", path: ["shippingAgencyName"] },
      )
  );
}

export type CheckoutFormInput = z.infer<
  ReturnType<typeof buildCheckoutFormSchema>
>;
