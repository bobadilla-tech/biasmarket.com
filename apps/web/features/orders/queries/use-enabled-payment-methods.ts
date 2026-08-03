"use client";

import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "@/features/store-settings";

export const enabledPaymentMethodsKeys = {
  byStore: (storeId: string) =>
    ["payment-methods", storeId, "enabled"] as const,
};

export function useEnabledPaymentMethods(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  return useQuery({
    queryKey: enabledPaymentMethodsKeys.byStore(storeId as string),
    queryFn: () =>
      settingsApi.getEnabledPaymentMethods(
        storeId as string,
        fallbackErrorMessage,
      ),
    enabled: !!storeId,
  });
}
