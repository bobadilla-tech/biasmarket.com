"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { ordersKeys } from "@/features/orders/queries/use-orders";

// Fixes a wrong buyer number before the buyer opened or claimed the link; the
// API rotates the link too. `gcTime: 0` for the same reason as the others.
export function useCorrectBuyerPhone(storeId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    gcTime: 0,
    mutationFn: ({
      orderId,
      customerPhone,
    }: {
      orderId: string;
      customerPhone: string;
    }) =>
      apiClient.orders.correctBuyerPhone(storeId as string, orderId, {
        customerPhone,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ordersKeys.byStore(storeId as string),
      }),
  });
}
