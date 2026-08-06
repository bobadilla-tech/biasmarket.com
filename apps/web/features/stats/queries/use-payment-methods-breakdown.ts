"use client";

import { useQuery } from "@tanstack/react-query";
import { statsApi } from "../api/stats.api";
import type { PaymentRange } from "../lib/payment-date-ranges";

export const paymentMethodsKeys = {
  byStore: (storeId: string, range: PaymentRange) =>
    ["stats", "payment-methods", storeId, range] as const,
};

export function usePaymentMethodsBreakdown(
  storeId: string | undefined,
  range: PaymentRange,
) {
  const { data, isPending, error } = useQuery({
    queryKey: paymentMethodsKeys.byStore(storeId ?? "", range),
    queryFn: () =>
      statsApi.getPaymentMethodsBreakdown(storeId as string, range),
    enabled: !!storeId,
  });

  return {
    breakdown: data ?? null,
    loading: isPending,
    error: error
      ? (error instanceof Error ? error.message : String(error))
      : null,
  };
}
