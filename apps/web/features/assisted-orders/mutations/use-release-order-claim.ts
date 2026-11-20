"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { ordersKeys } from "@/features/orders/queries/use-orders";

export function useReleaseOrderClaim(storeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) =>
      apiClient.orders.releaseOrderClaim(storeId, orderId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ordersKeys.byStore(storeId) }),
  });
}
