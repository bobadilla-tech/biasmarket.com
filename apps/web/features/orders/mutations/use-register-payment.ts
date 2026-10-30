"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { statsKeys } from "@/features/stats";
import { ordersApi } from "../api/orders.api";
import { ordersKeys } from "../queries/use-orders";
import type { SellerPaymentInput } from "@biasmarket/validation";

export function useRegisterPayment(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orderId,
      values,
      confirmDuplicate,
    }: {
      orderId: string;
      values: SellerPaymentInput;
      confirmDuplicate?: boolean;
    }) =>
      ordersApi.registerPayment(storeId as string, orderId, values, {
        confirmDuplicate,
        fallbackErrorMessage,
      }),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({ queryKey: ordersKeys.byStore(storeId) });
      void queryClient.invalidateQueries({
        queryKey: statsKeys.overview(storeId),
      });
    },
  });
}
