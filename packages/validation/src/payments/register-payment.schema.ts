import { z } from "zod";
import {
  MAX_FILE_SIZE,
  type ProofFileLike,
  isAllowedProof,
} from "../checkout/file-proof.js";

export const PAYMENT_METHOD_TYPES = [
  "YAPE",
  "PLIN",
  "TRANSFER",
  "CASH",
] as const;

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"];
const ACCEPTED_IMAGE_EXTENSION = /\.(jpe?g|png)$/i;

/**
 * Mirrors the backend's validation for POST .../orders/:orderId/payments so
 * client-side errors surface before the network round-trip: amount finite,
 * >0, <= pendingAmount; method one of YAPE|PLIN|TRANSFER|CASH; file <=5MB,
 * JPEG/PNG. `maxAmount` is the order's current pendingAmount, so the schema
 * is built per-order rather than a static export.
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
    // RN-safe structural file check (no `File` global): proof is null/undefined
    // or a ProofFileLike ({ name, type?, size }), keeping the same 5MB +
    // JPEG/PNG rules. Web passes a real File, which satisfies this shape.
    file: z
      .custom<ProofFileLike | null>(isAllowedProof, "invalid file")
      .nullable()
      .refine((file) => !file || file.size <= MAX_FILE_SIZE, "file too large")
      .refine((file) => {
        if (!file) return true;
        // When a MIME type is present (and non-blank) it must be an accepted
        // image; pickers that leave `type` empty fall back to a JPEG/PNG
        // filename extension (PDF is not accepted for per-payment images).
        if (file.type !== undefined && file.type !== "") {
          return ACCEPTED_IMAGE_TYPES.includes(file.type);
        }
        return ACCEPTED_IMAGE_EXTENSION.test(file.name);
      }, "invalid file type"),
  });
}

export type RegisterPaymentInput = z.infer<
  ReturnType<typeof buildRegisterPaymentSchema>
>;
