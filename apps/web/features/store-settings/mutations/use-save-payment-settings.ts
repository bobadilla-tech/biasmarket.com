"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "../api/settings.api";
import { useUpdateDashboardStoreCache } from "@/features/stores";
import { paymentMethodsKeys } from "../queries/use-payment-methods";

export function useSavePaymentSettings(
  storeId: string | undefined,
  slug: string,
) {
  const queryClient = useQueryClient();
  const updateStoreCache = useUpdateDashboardStoreCache();
  return useMutation({
    mutationFn: (
      input: Parameters<typeof settingsApi.savePaymentSettings>[1],
    ) => settingsApi.savePaymentSettings(storeId as string, input),
    onSuccess: async (result) => {
      if (!storeId) return;
      if (result.store) updateStoreCache(slug, result.store);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: paymentMethodsKeys.byStore(storeId),
        }),
      ]);
    },
  });
}
