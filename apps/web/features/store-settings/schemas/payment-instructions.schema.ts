import { z } from "zod";

export const paymentInstructionsSchema = z.object({
  paymentInstructions: z.string().max(1000),
});

export type PaymentInstructionsInput = z.infer<
  typeof paymentInstructionsSchema
>;
