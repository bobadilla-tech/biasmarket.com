"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { statsKeys } from "@/features/stats";
import { apiClient } from "@/lib/api-client";
import { ordersKeys } from "../queries/use-orders";

// Approve/reject a single buyer-submitted proof row (`OrderPayment.source ===
// "BUYER_SUBMITTED"`) — distinct from `useReviewPayment`, which reviews the
// order's overall paymentStatus. See
// docs/plans/2026-08-08-buyer-proof-of-payment-upload-plan.md.
export function useReviewPaymentProof(
  storeId: string,
  fallbackErrorMessage?: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orderId,
      paymentId,
      decision,
    }: {
      orderId: string;
      paymentId: string;
      decision: "approve" | "reject";
    }) =>
      apiClient.orders.reviewPaymentProof(
        storeId,
        orderId,
        paymentId,
        { decision },
        { fallbackErrorMessage },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersKeys.byStore(storeId) });
      void queryClient.invalidateQueries({
        queryKey: statsKeys.overview(storeId),
      });
    },
  });
}
