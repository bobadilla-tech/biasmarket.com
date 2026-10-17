"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateAssistedOrderDto } from "@biasmarket/types";
import { ordersKeys } from "@/features/orders/queries/use-orders";
import { assistedOrdersApi } from "../api/assisted-orders.api";

// The response carries the private link, which the API never returns again.
// `gcTime: 0` keeps it out of the mutation cache once the screen unmounts; the
// caller holds it in component state only. `idempotencyKey` is chosen by the
// form so a retry of the same submit reuses it (see assisted-order-form).
export function useCreateAssistedOrder(storeId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    gcTime: 0,
    mutationFn: (input: {
      payload: CreateAssistedOrderDto;
      idempotencyKey: string;
    }) =>
      assistedOrdersApi.create(
        storeId as string,
        input.payload,
        input.idempotencyKey,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ordersKeys.byStore(storeId as string),
      }),
  });
}
