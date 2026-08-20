"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { paymentMethodsKeys } from "../queries/use-payment-methods";

export function useUploadPaymentQrImage(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ method, file }: { method: "YAPE" | "PLIN"; file: File }) =>
      apiClient.paymentConfig.uploadQrImage(
        storeId as string,
        method,
        { file },
        { fallbackErrorMessage },
      ),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({
        queryKey: paymentMethodsKeys.byStore(storeId),
      });
    },
  });
}
