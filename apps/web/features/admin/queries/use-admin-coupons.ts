"use client";

import { useQuery } from "@tanstack/react-query";
import { adminCouponsApi } from "../api/admin-coupons.api";

export const adminCouponsKeys = {
  all: ["admin-coupons"] as const,
  byId: (couponId: string) => ["admin-coupons", couponId] as const,
};

export function useAdminCoupons(fallbackErrorMessage?: string) {
  return useQuery({
    queryKey: adminCouponsKeys.all,
    queryFn: () => adminCouponsApi.list(fallbackErrorMessage),
  });
}

export function useCouponRedemptions(
  couponId: string | null,
  fallbackErrorMessage?: string,
) {
  return useQuery({
    queryKey: adminCouponsKeys.byId(couponId ?? ""),
    queryFn: () =>
      couponId
        ? adminCouponsApi.listRedemptions(couponId, fallbackErrorMessage)
        : Promise.resolve([]),
    enabled: !!couponId,
  });
}
