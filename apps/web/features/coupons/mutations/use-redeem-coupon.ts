"use client";

import { useMutation } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { userCouponsApi } from "../api/user-coupons.api";

export function useRedeemCoupon(fallbackErrorMessage?: string) {
  // useUserPlan() (features/coupons/queries/use-my-plan.ts) reads plan/
  // premiumUntil off this same better-auth session cache. Without an
  // explicit refetch here, a successful redemption leaves the "Premium
  // until ..." banner showing the pre-redemption state until something
  // else happens to revalidate the session.
  const { refetch: refetchSession } = authClient.useSession();

  return useMutation({
    mutationFn: (code: string) =>
      userCouponsApi.redeem(code, fallbackErrorMessage),
    onSuccess: () => {
      void refetchSession();
    },
  });
}
