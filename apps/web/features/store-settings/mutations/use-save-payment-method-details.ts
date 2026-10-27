"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "../api/settings.api";
import { paymentMethodsKeys } from "../queries/use-payment-methods";

export function useSavePaymentMethodDetails(storeId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      { method, details }: {
        method: "YAPE" | "PLIN" | "TRANSFER" | "CASH";
        details: Record<string, unknown>;
      },
    ) =>
      settingsApi.savePaymentMethodDetails(storeId as string, method, details),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({
        queryKey: paymentMethodsKeys.byStore(storeId),
      });
    },
  });
}
