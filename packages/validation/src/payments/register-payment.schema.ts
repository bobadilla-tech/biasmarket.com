import { z } from "zod";
import { MAX_FILE_SIZE, type ProofFileShape } from "../checkout/file-proof.js";

export const PAYMENT_METHOD_TYPES = [
  "YAPE",
  "PLIN",
  "TRANSFER",
  "CASH",
] as const;

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"];

/**
 * Mirrors the backend's validation for POST .../orders/:orderId/payments so
 * client-side errors surface before the network round-trip: amount finite,
 * >0, <= pendingAmount; method one of YAPE|PLIN|TRANSFER|CASH; file <=5MB,
 * JPEG/PNG. `maxAmount` is the order's current pendingAmount, so the schema
 * is built per-order rather than a static export. The file is validated
 * structurally (not `instanceof File`) so the same schema runs under React
 * Native, where the browser `File` type does not exist — web still passes a
 * real `File` and mobile an image-picker asset; both overlap `ProofFileShape`.
 */
export function buildRegisterPaymentSchema(maxAmount: number) {
  return z.object({
    amount: z
      .string()
      .min(1)
      .refine((value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 && parsed <= maxAmount;
      }, "invalid amount"),
    method: z
      .string()
      .min(1)
      .refine(
        (value) => (PAYMENT_METHOD_TYPES as readonly string[]).includes(value),
        "invalid method",
      ),
    note: z.string(),
    file: z
      .custom<ProofFileShape>(() => true)
      .nullable()
      .refine(
        (file) => !file || (file.size ?? 0) <= MAX_FILE_SIZE,
        "file too large",
      )
      .refine(
        (file) =>
          !file || (!!file.type && ACCEPTED_IMAGE_TYPES.includes(file.type)),
        "invalid file type",
      ),
  });
}

export type RegisterPaymentInput = z.infer<
  ReturnType<typeof buildRegisterPaymentSchema>
>;
