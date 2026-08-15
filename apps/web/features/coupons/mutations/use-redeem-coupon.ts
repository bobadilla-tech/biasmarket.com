"use client";

import { useMutation } from "@tanstack/react-query";
import { userCouponsApi } from "../api/user-coupons.api";

export function useRedeemCoupon(fallbackErrorMessage?: string) {
  return useMutation({
    mutationFn: (code: string) =>
      userCouponsApi.redeem(code, fallbackErrorMessage),
  });
}
