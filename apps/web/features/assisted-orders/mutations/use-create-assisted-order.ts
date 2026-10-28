"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateAssistedOrderDto } from "@biasmarket/types";
import { apiClient } from "@/lib/api-client";
import { ordersKeys } from "@/features/orders/queries/use-orders";

// The response carries the private link, which the API never returns again.
// `gcTime: 0` keeps it out of the mutation cache once the screen unmounts; the
// caller holds it in component state only.
export function useCreateAssistedOrder(storeId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    gcTime: 0,
    mutationFn: (payload: CreateAssistedOrderDto) =>
      apiClient.orders.createAssisted(storeId as string, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ordersKeys.byStore(storeId as string),
      }),
  });
}
