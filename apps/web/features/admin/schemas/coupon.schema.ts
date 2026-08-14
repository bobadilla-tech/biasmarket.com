import { z } from "zod";

export const couponFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4, "Min 4 characters")
    .max(8, "Max 8 characters")
    .regex(/^[A-Za-z0-9]+$/, "Only letters and numbers"),
  name: z.string().trim().min(1, "Required"),
  description: z.string().trim().optional().or(z.literal("")),
  maxUses: z.number().int().min(1, "At least 1 use"),
  startsAt: z.string().optional().or(z.literal("")),
  expiresAt: z.string().optional().or(z.literal("")),
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
  status: "active" | "inactive" | "expired";
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
