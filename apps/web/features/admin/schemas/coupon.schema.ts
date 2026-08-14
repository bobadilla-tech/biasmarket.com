import { z } from "zod";

export const couponFormSchema = z.object({
  code: z.string().trim().min(1, "Required"),
  name: z.string().trim().min(1, "Required"),
  description: z.string().trim().optional(),
  durationDays: z.coerce.number().int().min(1),
  maxUses: z.coerce.number().int().min(1),
  startsAt: z.string().optional(),
  expiresAt: z.string().optional(),
  isActive: z.boolean().default(true),
});

export type CouponFormValues = z.infer<typeof couponFormSchema>;

export interface AdminCoupon {
  id: string;
  code: string;
  name: string;
  description: string;
  plan: string;
  durationDays: number;
  maxUses: number;
  isActive: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  redemptionCount: number;
}

export interface CouponRedemption {
  id: string;
  couponId: string;
  userId: string;
  userEmail: string;
  userName: string;
  redeemedAt: string;
  expiresAt: string;
}
