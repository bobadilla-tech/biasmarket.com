"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminCouponsApi } from "../api/admin-coupons.api";
import { adminCouponsKeys } from "../queries/use-admin-coupons";

export function useUnredeemCoupon(fallbackErrorMessage?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      couponId,
      redemptionId,
    }: {
      couponId: string;
      redemptionId: string;
    }) =>
      adminCouponsApi.unredeem(couponId, redemptionId, fallbackErrorMessage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminCouponsKeys.all });
    },
  });
}
