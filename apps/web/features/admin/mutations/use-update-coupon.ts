"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminCouponsApi } from "../api/admin-coupons.api";
import { adminCouponsKeys } from "../queries/use-admin-coupons";
import type { CouponFormValues } from "../schemas/coupon.schema";

export function useUpdateCoupon(fallbackErrorMessage?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      couponId,
      values,
    }: {
      couponId: string;
      values: CouponFormValues;
    }) =>
      adminCouponsApi.update(
        couponId,
        {
          code: values.code,
          name: values.name,
          description: values.description || undefined,
          maxUses: values.maxUses,
          startsAt: values.startsAt || undefined,
          expiresAt: values.expiresAt || undefined,
        },
        fallbackErrorMessage,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminCouponsKeys.all });
    },
  });
}
