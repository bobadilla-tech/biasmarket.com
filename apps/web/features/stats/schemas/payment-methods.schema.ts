import { z } from "zod";

export const paymentMethodValues = [
  "YAPE",
  "PLIN",
  "TRANSFER",
  "CASH",
] as const;
export type PaymentMethodValue = (typeof paymentMethodValues)[number];

export const paymentMethodBreakdownRowSchema = z.object({
  method: z.enum(paymentMethodValues).nullable(),
  amount: z.number(),
  count: z.number(),
  percentage: z.number(),
});

export const paymentMethodsBreakdownSchema = z.object({
  from: z.string(),
  to: z.string(),
  totalAmount: z.number(),
  totalCount: z.number(),
  byMethod: z.array(paymentMethodBreakdownRowSchema),
});

export type PaymentMethodBreakdownRow = z.infer<
  typeof paymentMethodBreakdownRowSchema
>;
export type PaymentMethodBreakdown = z.infer<
  typeof paymentMethodsBreakdownSchema
>;
