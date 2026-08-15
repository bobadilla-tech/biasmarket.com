import { apiClient } from "@/lib/api-client";
import type { CouponRedemptionResponseDto } from "@biasmarket/types";

export type RedeemCouponResult = CouponRedemptionResponseDto;

export const userCouponsApi = {
  redeem(code: string, fallbackErrorMessage?: string) {
    return apiClient.coupons.redeemCoupon({ code }, { fallbackErrorMessage });
  },
};
