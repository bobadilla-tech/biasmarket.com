"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { useTranslations } from "next-intl";
import { ordersKeys } from "../queries/use-orders";
import { useReviewPayment } from "./use-review-payment";
import { useAdvanceFulfillment } from "./use-advance-fulfillment";
import { useCancelOrder } from "./use-cancel-order";
import type { Order } from "../schemas/order.schema";

const UNDO_WINDOW_MS = 8000;

type StatusField = "paymentStatus" | "fulfillmentStatus";
type PendingMap = Record<string, { field: StatusField; previousValue: string }>;

/**
 * Wraps the "review" and "advance" mutations with a delayed-commit/undo UX:
 * apply the status change to the orders query cache immediately, show an
 * undo toast for UNDO_WINDOW_MS, and only fire the real mutation once the
 * window elapses without the seller clicking undo. TanStack Query's
 * `onMutate` optimistic pattern doesn't have this "delay the commit" shape
 * built in, so this is a plain setTimeout/clearTimeout wrapper around
 * `queryClient.setQueryData`, same as the page-local version it replaces.
 *
 * The sensitive-transition path (rejecting a payment, advancing to
 * COMPLETED) deliberately bypasses this hook — callers use the returned
 * `reviewPayment`/`advanceFulfillment` mutations directly instead, awaiting
 * them before closing a confirm dialog.
 */
export function useOptimisticStatusChange(
  storeId: string | undefined,
  t: ReturnType<typeof useTranslations>,
) {
  const queryClient = useQueryClient();
  const reviewPayment = useReviewPayment(storeId);
  const advanceFulfillment = useAdvanceFulfillment(storeId);
  const cancelOrder = useCancelOrder(storeId);
  const [pending, setPending] = useState<PendingMap>({});

  const patch = (orderId: string, field: StatusField, value: string) => {
    if (!storeId) return;
    queryClient.setQueryData<Order[]>(
      ordersKeys.byStore(storeId),
      (orders) =>
        orders?.map((
          order,
        ) => (order.id === orderId ? { ...order, [field]: value } : order)),
    );
  };

  const clearPending = (orderId: string) => {
    setPending((prev) => {
      const { [orderId]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const schedule = (
    orderId: string,
    field: StatusField,
    previousValue: string,
    nextValue: string,
    label: string,
    commit: () => Promise<unknown>,
  ) => {
    patch(orderId, field, nextValue);
    setPending((prev) => ({ ...prev, [orderId]: { field, previousValue } }));

    const timeoutId = setTimeout(() => {
      clearPending(orderId);
      commit().catch(() => undefined);
    }, UNDO_WINDOW_MS);

    toast(t("undoToast.message", { status: label }), {
      duration: UNDO_WINDOW_MS,
      action: {
        label: t("undoToast.undo"),
        onClick: () => {
          clearTimeout(timeoutId);
          patch(orderId, field, previousValue);
          clearPending(orderId);
        },
      },
    });
  };

  const scheduleReview = (order: Order, label: string) => {
    schedule(
      order.id,
      "paymentStatus",
      order.paymentStatus,
      "VERIFIED",
      label,
      () =>
        reviewPayment.mutateAsync({ orderId: order.id, decision: "approve" }),
    );
  };

  const scheduleAdvance = (order: Order, nextStatus: string, label: string) => {
    schedule(
      order.id,
      "fulfillmentStatus",
      order.fulfillmentStatus,
      nextStatus,
      label,
      () =>
        advanceFulfillment.mutateAsync({
          orderId: order.id,
          status: nextStatus,
        }),
    );
  };

  return {
    pending,
    scheduleReview,
    scheduleAdvance,
    reviewPayment,
    advanceFulfillment,
  };
}
