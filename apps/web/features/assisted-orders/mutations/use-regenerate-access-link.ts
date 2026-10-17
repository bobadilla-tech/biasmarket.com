"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { ordersKeys } from "@/features/orders/queries/use-orders";

// Rotates the private link. Like creation, the response carries the only copy
// of the new link, so the mutation cache keeps nothing (`gcTime: 0`).
export function useRegenerateAccessLink(storeId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    gcTime: 0,
    mutationFn: (orderId: string) =>
      apiClient.orders.regenerateAccessLink(storeId as string, orderId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ordersKeys.byStore(storeId as string),
      }),
  });
}
