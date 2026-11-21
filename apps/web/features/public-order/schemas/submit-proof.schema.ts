import { z } from "zod";
import { MAX_FILE_SIZE } from "@biasmarket/validation";

export const PROOF_METHODS = ["YAPE", "PLIN", "TRANSFER", "CASH"] as const;

// Same rule as the server (`BuyerPaymentProofService`): digits with at most
// two decimals, nothing `Number()` would also accept ("1e2", "100.").
export const AMOUNT_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;
export const MAX_OPERATION_CODE_LENGTH = 64;
const PROOF_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const PROOF_EXTENSION = /\.(jpe?g|png|pdf)$/i;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/;

export function isAllowedProofFile(file: {
  name: string;
  type?: string;
}): boolean {
  if (file.type) return PROOF_TYPES.includes(file.type);
  return PROOF_EXTENSION.test(file.name);
}

// `maxCents` is what the buyer can still send (balance minus proofs waiting
// for review). Messages are i18n keys under `publicOrder.upload.errors`.
export function buildSubmitProofSchema(maxCents: number) {
  return z.object({
    amount: z
      .string()
      .regex(AMOUNT_PATTERN, "amountInvalid")
      .refine((value) => Math.round(Number(value) * 100) >= 1, "amountInvalid")
      .refine(
        (value) => Math.round(Number(value) * 100) <= maxCents,
        "amountTooHigh",
      ),
    method: z.enum(PROOF_METHODS, { message: "methodRequired" }),
    operationCode: z
      .string()
      .max(MAX_OPERATION_CODE_LENGTH, "codeInvalid")
      .refine((value) => !CONTROL_CHARS.test(value), "codeInvalid"),
    file: z
      .custom<File | null>(
        (value) => typeof File !== "undefined" && value instanceof File,
        "fileRequired",
      )
      .refine((file) => !file || file.size <= MAX_FILE_SIZE, "fileTooLarge")
      .refine((file) => !file || isAllowedProofFile(file), "fileType"),
  });
}

export type SubmitProofInput = z.infer<
  ReturnType<typeof buildSubmitProofSchema>
>;
