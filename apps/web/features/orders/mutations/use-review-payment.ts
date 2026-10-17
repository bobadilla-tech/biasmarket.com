"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { statsKeys } from "@/features/stats";
import { ordersApi } from "../api/orders.api";
import { useBuyerNoticeOffer } from "@/features/assisted-orders/mutations/use-buyer-notice";
import { ordersKeys } from "../queries/use-orders";

export function useReviewPayment(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  const queryClient = useQueryClient();
  const { offer } = useBuyerNoticeOffer(storeId);

  return useMutation({
    mutationFn: ({
      orderId,
      decision,
      reason,
    }: {
      orderId: string;
      decision: "approve" | "reject";
      reason?: string;
    }) =>
      ordersApi.review(
        storeId as string,
        orderId,
        decision,
        reason,
        fallbackErrorMessage,
      ),
    onSuccess: (_data, vars) => {
      if (!storeId) return;
      const refetched = queryClient.invalidateQueries({
        queryKey: ordersKeys.byStore(storeId),
      });
      if (vars.decision === "approve") {
        void offer(refetched, vars.orderId, "ASSISTED_PAYMENT_VALIDATED");
      }
      void queryClient.invalidateQueries({
        queryKey: statsKeys.overview(storeId),
      });
    },
  });
}
