"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { statsKeys } from "@/features/stats";
import { ordersApi } from "../api/orders.api";
import { useBuyerNoticeOffer } from "@/features/assisted-orders/mutations/use-buyer-notice";
import { noticeForFulfillment } from "@/features/assisted-orders/lib/buyer-notice-for-change";
import { ordersKeys } from "../queries/use-orders";

export function useAdvanceFulfillment(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  const queryClient = useQueryClient();
  const { offer } = useBuyerNoticeOffer(storeId);

  return useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      ordersApi.advance(
        storeId as string,
        orderId,
        status,
        fallbackErrorMessage,
      ),
    onSuccess: (_data, vars) => {
      if (!storeId) return;
      const refetched = queryClient.invalidateQueries({
        queryKey: ordersKeys.byStore(storeId),
      });
      void offer(refetched, vars.orderId, noticeForFulfillment(vars.status));
      void queryClient.invalidateQueries({
        queryKey: statsKeys.overview(storeId),
      });
    },
  });
}
