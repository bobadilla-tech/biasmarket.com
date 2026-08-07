"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { statsKeys } from "@/features/stats";
import { ordersApi } from "../api/orders.api";
import { ordersKeys } from "../queries/use-orders";

export function useAdvanceFulfillment(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      ordersApi.advance(
        storeId as string,
        orderId,
        status,
        fallbackErrorMessage,
      ),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({ queryKey: ordersKeys.byStore(storeId) });
      queryClient.invalidateQueries({ queryKey: statsKeys.overview(storeId) });
    },
  });
}
