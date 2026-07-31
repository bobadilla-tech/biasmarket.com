import { z } from "zod";

export const paymentMethodConfigSchema = z.object({
  method: z.enum(["YAPE", "PLIN", "TRANSFER", "CASH"]),
  enabled: z.boolean(),
});

export const paymentMethodConfigListSchema = z.array(paymentMethodConfigSchema);

export type PaymentMethodConfig = z.infer<typeof paymentMethodConfigSchema>;
