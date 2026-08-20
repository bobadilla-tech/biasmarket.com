"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { UpsertPaymentMethodDtoMethod } from "@biasmarket/types";
import { paymentMethodsKeys } from "../queries/use-payment-methods";

export function useSaveDepositPercent(storeId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      method,
      depositPercent,
    }: {
      method: UpsertPaymentMethodDtoMethod;
      depositPercent: number;
    }) =>
      apiClient.paymentConfig.upsert(storeId as string, {
        method,
        depositPercent,
      }),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({
        queryKey: paymentMethodsKeys.byStore(storeId),
      });
    },
  });
}
