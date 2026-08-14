"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminCouponsApi } from "../api/admin-coupons.api";
import { adminCouponsKeys } from "../queries/use-admin-coupons";

export function useToggleCouponStatus(fallbackErrorMessage?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (couponId: string) =>
      adminCouponsApi.toggleStatus(couponId, fallbackErrorMessage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminCouponsKeys.all });
    },
  });
}
