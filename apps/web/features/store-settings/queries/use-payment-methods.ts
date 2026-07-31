"use client";

import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "../api/settings.api";

export const paymentMethodsKeys = {
  byStore: (storeId: string) => ["payment-methods", storeId] as const,
};

export function usePaymentMethods(storeId: string | undefined) {
  return useQuery({
    queryKey: paymentMethodsKeys.byStore(storeId ?? ""),
    queryFn: () => settingsApi.getPaymentMethods(storeId as string),
    enabled: !!storeId,
  });
}
