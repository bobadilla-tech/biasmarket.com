"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { statsKeys } from "@/features/stats";
import { ordersApi } from "../api/orders.api";
import { ordersKeys } from "../queries/use-orders";
import type { RegisterPaymentInput } from "../schemas/register-payment.schema";

export function useRegisterPayment(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      { orderId, values }: { orderId: string; values: RegisterPaymentInput },
    ) =>
      ordersApi.registerPayment(
        storeId as string,
        orderId,
        values,
        fallbackErrorMessage,
      ),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({ queryKey: ordersKeys.byStore(storeId) });
      queryClient.invalidateQueries({ queryKey: statsKeys.overview(storeId) });
    },
  });
}
