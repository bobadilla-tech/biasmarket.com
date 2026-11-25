import { z } from "zod";
import {
  isAllowedProof,
  MAX_FILE_SIZE,
  type ProofFileLike,
} from "../checkout/file-proof.js";

export const PAYMENT_METHOD_TYPES = [
  "YAPE",
  "PLIN",
  "TRANSFER",
  "CASH",
] as const;

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"];
const ACCEPTED_IMAGE_EXTENSION = /\.(jpe?g|png)$/i;
const ACCEPTED_BUYER_PROOF_TYPES = [...ACCEPTED_IMAGE_TYPES, "application/pdf"];
const ACCEPTED_BUYER_PROOF_EXTENSION = /\.(jpe?g|png|pdf)$/i;
// Keep the accepted numeric syntax in sync with the backend's AMOUNT_PATTERN.
const PAYMENT_AMOUNT_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;

/**
 * Mirrors the backend's validation for POST .../orders/:orderId/payments so
 * client-side errors surface before the network round-trip: amount finite,
 * >0, <= pendingAmount; method one of YAPE|PLIN|TRANSFER|CASH; file <=5MB.
 * Seller-recorded payments stay JPEG/PNG; buyer proof forms can opt into PDF.
 * `maxAmount` is the order's current pendingAmount, so the schema is built
 * per-order rather than a static export.
 */
export function buildRegisterPaymentSchema(
  maxAmount: number,
  options: { allowPdfProof?: boolean } = {},
) {
  return z.object({
    amount: z
      .string()
      .min(1)
      .refine((value) => PAYMENT_AMOUNT_PATTERN.test(value), "invalid amount")
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
    // or a ProofFileLike ({ name, type?, size }), with the type allowlist
    // selected for seller captures or buyer proofs. Web passes a File, which
    // satisfies this shape.
    file: z
      .custom<ProofFileLike | null>(isAllowedProof, "invalid file")
      .nullable()
      .refine((file) => !file || file.size <= MAX_FILE_SIZE, "file too large")
      .refine((file) => {
        if (!file) return true;
        // Use the MIME type when present; pickers that leave it empty fall
        // back to a filename extension.
        if (file.type !== undefined && file.type !== "") {
          return (
            options.allowPdfProof
              ? ACCEPTED_BUYER_PROOF_TYPES
              : ACCEPTED_IMAGE_TYPES
          ).includes(file.type);
        }
        return (
          options.allowPdfProof
            ? ACCEPTED_BUYER_PROOF_EXTENSION
            : ACCEPTED_IMAGE_EXTENSION
        ).test(file.name);
      }, "invalid file type"),
  });
}

export type RegisterPaymentInput = z.infer<
  ReturnType<typeof buildRegisterPaymentSchema>
>;
