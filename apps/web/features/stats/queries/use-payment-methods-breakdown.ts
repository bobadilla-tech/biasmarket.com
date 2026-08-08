"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
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
      apiClient.stats.paymentMethods(storeId as string, {
        from: range.from,
        to: range.to,
      }),
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
