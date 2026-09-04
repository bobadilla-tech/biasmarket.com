import { z } from "zod";

export const redeemCouponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4, "Minimum 4 characters")
    .max(8, "Maximum 8 characters")
    .regex(/^[A-Za-z0-9]+$/, "Only letters and numbers"),
});

export type RedeemCouponValues = z.infer<typeof redeemCouponSchema>;
