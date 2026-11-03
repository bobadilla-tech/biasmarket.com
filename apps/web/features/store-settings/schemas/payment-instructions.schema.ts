import { z } from "zod";

export const paymentInstructionsSchema = z.object({
  paymentInstructions: z.string(),
});

export type PaymentInstructionsInput = z.infer<
  typeof paymentInstructionsSchema
>;
