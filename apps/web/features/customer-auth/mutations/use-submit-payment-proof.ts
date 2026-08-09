"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RegisterPaymentInput } from "@/features/orders";
import { orderPaymentsApi } from "../api/order-payments.api";
import { orderDetailKeys } from "../queries/use-order-detail";

export function useSubmitPaymentProof(
  slug: string,
  orderId: string,
  fallbackErrorMessage?: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: RegisterPaymentInput) =>
      orderPaymentsApi.submitProof(
        slug,
        orderId,
        values,
        fallbackErrorMessage,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: orderDetailKeys.detail(slug, orderId),
      });
    },
  });
}
