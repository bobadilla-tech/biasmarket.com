"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminCouponsApi } from "../api/admin-coupons.api";
import { adminCouponsKeys } from "../queries/use-admin-coupons";
import type { CouponFormValues } from "../schemas/coupon.schema";

export function useCreateCoupon(fallbackErrorMessage?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: CouponFormValues) =>
      adminCouponsApi.create(
        {
          code: values.code.toUpperCase(),
          name: values.name,
          description: values.description || undefined,
          durationDays: 30,
          maxUses: values.maxUses,
          startsAt: values.startsAt || undefined,
          expiresAt: values.expiresAt || undefined,
          isActive: true,
        },
        fallbackErrorMessage,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminCouponsKeys.all });
    },
  });
}
