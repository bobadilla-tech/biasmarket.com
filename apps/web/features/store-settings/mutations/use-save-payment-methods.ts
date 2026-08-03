"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "../api/settings.api";
import { paymentMethodsKeys } from "../queries/use-payment-methods";

export function useSavePaymentMethods(storeId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (enabledByMethod: Record<string, boolean>) =>
      settingsApi.savePaymentMethods(storeId as string, enabledByMethod),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({
        queryKey: paymentMethodsKeys.byStore(storeId),
      });
    },
  });
}
