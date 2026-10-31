"use client";

import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WhatsAppBuyerNoticeType } from "@biasmarket/utils/whatsapp";
import type { OrderResponseDto } from "@biasmarket/types";
import { apiClient } from "@/lib/api-client";
import { isNoticeApplicable } from "../lib/buyer-notice-for-change";
import { setBuyerNoticeOffer } from "../lib/buyer-notice-offer";

const ordersKey = (storeId: string) => ["orders", storeId] as const;

/**
 * Creates the "Avisar al comprador" offer after a status change. Pass the
 * promise of the orders refetch the caller already started: the decision is
 * made from the refetched order (phone, alias, tracking number, claim state),
 * not from the stale cache or the mutation variables. Only VENDOR_ASSISTED
 * orders are offered a notice.
 */
export function useBuyerNoticeOffer(storeId: string | undefined) {
  const queryClient = useQueryClient();

  const offer = useCallback(
    async (
      refetched: Promise<unknown>,
      orderId: string,
      notice: WhatsAppBuyerNoticeType | null,
    ) => {
      if (!storeId || !notice) return;
      try {
        await refetched;
      } catch {
        return;
      }
      const order = queryClient
        .getQueryData<OrderResponseDto[]>(ordersKey(storeId))
        ?.find((row) => row.id === orderId);
      if (order && isNoticeApplicable(order, notice)) {
        setBuyerNoticeOffer({ storeId, orderId, notice });
      }
    },
    [queryClient, storeId],
  );

  return { offer };
}

/** Logs that the seller sent a notice. Fire and forget: never blocks WhatsApp. */
export function useLogBuyerNotice(storeId: string) {
  return useMutation({
    mutationFn: (input: { orderId: string; notice: WhatsAppBuyerNoticeType }) =>
      apiClient.orders.recordBuyerNotice(storeId, input.orderId, {
        notice: input.notice,
      }),
  });
}
