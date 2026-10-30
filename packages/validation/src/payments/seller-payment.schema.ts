import { z } from "zod";
import {
  isAllowedProof,
  MAX_FILE_SIZE,
  type ProofFileLike,
} from "../checkout/file-proof.js";
import { PAYMENT_METHOD_TYPES } from "./register-payment.schema.js";

// Same rule as the API (`assertSellerPaymentInput`): digits with at most two
// decimals, nothing `Number()` would also accept ("1e2", "100.").
const AMOUNT_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;
const MAX_OPERATION_CODE_LENGTH = 64;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"];
const ACCEPTED_IMAGE_EXTENSION = /\.(jpe?g|png)$/i;
// eslint-disable-next-line no-control-regex -- control characters are exactly what this rejects
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/;

export const SELLER_PAYMENT_ERRORS = {
  amountInvalid: "amountInvalid",
  amountTooHigh: "amountTooHigh",
  methodRequired: "methodRequired",
  codeInvalid: "codeInvalid",
  dateInvalid: "dateInvalid",
  dateFuture: "dateFuture",
  fileRequired: "fileRequired",
  fileTooLarge: "fileTooLarge",
  fileType: "fileType",
} as const;

/**
 * Seller-side payment form. `maxCents` is what can still be recorded: the
 * balance minus buyer proofs waiting for review. `paidAt` is the picked
 * calendar day (YYYY-MM-DD), converted to an instant by the caller. The
 * capture is required unless the method is CASH. Messages are error keys, not
 * text, so each app translates them.
 */
export function buildSellerPaymentSchema(maxCents: number, today: string) {
  return z
    .object({
      amount: z
        .string()
        .regex(AMOUNT_PATTERN, SELLER_PAYMENT_ERRORS.amountInvalid)
        .refine(
          (value) => Math.round(Number(value) * 100) >= 1,
          SELLER_PAYMENT_ERRORS.amountInvalid,
        )
        .refine(
          (value) => Math.round(Number(value) * 100) <= maxCents,
          SELLER_PAYMENT_ERRORS.amountTooHigh,
        ),
      method: z
        .string()
        .refine(
          (value) =>
            (PAYMENT_METHOD_TYPES as readonly string[]).includes(value),
          SELLER_PAYMENT_ERRORS.methodRequired,
        ),
      operationCode: z
        .string()
        .max(MAX_OPERATION_CODE_LENGTH, SELLER_PAYMENT_ERRORS.codeInvalid)
        .refine(
          (value) => !CONTROL_CHARS.test(value),
          SELLER_PAYMENT_ERRORS.codeInvalid,
        ),
      paidAt: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, SELLER_PAYMENT_ERRORS.dateInvalid)
        .refine((value) => value <= today, SELLER_PAYMENT_ERRORS.dateFuture),
      note: z.string(),
      // RN-safe structural file check (no `File` global), like the buyer form.
      file: z
        .custom<ProofFileLike | null>(
          (value) => value === null || isAllowedProof(value),
          SELLER_PAYMENT_ERRORS.fileType,
        )
        .nullable()
        .refine(
          (file) => !file || file.size <= MAX_FILE_SIZE,
          SELLER_PAYMENT_ERRORS.fileTooLarge,
        )
        .refine((file) => {
          if (!file) return true;
          if (file.type !== undefined && file.type !== "") {
            return ACCEPTED_IMAGE_TYPES.includes(file.type);
          }
          return ACCEPTED_IMAGE_EXTENSION.test(file.name);
        }, SELLER_PAYMENT_ERRORS.fileType),
    })
    .superRefine((value, ctx) => {
      if (value.method !== "CASH" && !value.file) {
        ctx.addIssue({
          code: "custom",
          path: ["file"],
          message: SELLER_PAYMENT_ERRORS.fileRequired,
        });
      }
    });
}

export type SellerPaymentInput = z.infer<
  ReturnType<typeof buildSellerPaymentSchema>
>;
