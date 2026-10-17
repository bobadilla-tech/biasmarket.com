"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
// Direct submodule import, see `use-review-payment-proof.ts`.
import { statsKeys } from "@/features/stats/queries/use-stats-overview";
import { ordersApi } from "../api/orders.api";
import { ordersKeys } from "../queries/use-orders";

export function useVoidPayment(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      paymentId,
      reason,
    }: {
      orderId: string;
      paymentId: string;
      reason: string;
    }) =>
      ordersApi.voidPayment(
        storeId as string,
        orderId,
        paymentId,
        reason,
        fallbackErrorMessage,
      ),
    onSuccess: () => {
      if (!storeId) return;
      void queryClient.invalidateQueries({
        queryKey: ordersKeys.byStore(storeId),
      });
      void queryClient.invalidateQueries({
        queryKey: statsKeys.overview(storeId),
      });
    },
  });
}
