"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "../api/settings.api";
import {
  useUpdateDashboardStoreCache,
  type DashboardStore,
} from "@/features/stores";
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
      const response = result as { store?: Partial<DashboardStore> };
      if (response.store) updateStoreCache(slug, response.store);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: paymentMethodsKeys.byStore(storeId),
        }),
      ]);
    },
  });
}
