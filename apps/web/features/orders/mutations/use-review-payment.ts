"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ordersApi } from "../api/orders.api";
import { ordersKeys } from "../queries/use-orders";

export function useReviewPayment(storeId: string | undefined, fallbackErrorMessage?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, decision }: { orderId: string; decision: "approve" | "reject" }) =>
      ordersApi.review(storeId as string, orderId, decision, fallbackErrorMessage),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({ queryKey: ordersKeys.byStore(storeId) });
    },
  });
}
