"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "../api/settings.api";
import { paymentMethodsKeys } from "../queries/use-payment-methods";

export function useSaveDepositPercent(storeId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      method,
      depositPercent,
    }: {
      method: string;
      depositPercent: number;
    }) =>
      settingsApi.saveDepositPercent(storeId as string, method, depositPercent),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({
        queryKey: paymentMethodsKeys.byStore(storeId),
      });
    },
  });
}
