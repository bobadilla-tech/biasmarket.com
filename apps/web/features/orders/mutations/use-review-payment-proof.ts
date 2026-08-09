"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
// Direct submodule import, not the `@/features/stats` barrel — that barrel
// re-exports `RecentOrdersList`, which imports `getOrderStatus` from the
// `@/features/orders` barrel (this file's own feature), which in turn
// re-exports `useEnabledPaymentMethods` -> `@/features/store-settings`
// barrel -> a component importing `@/i18n/navigation`. That chain is fine at
// runtime, but `i18n/navigation.ts` calls `createNavigation()` at module
// load time, which needs `redirect` from `next/navigation` — any unit test
// that mocks `next/navigation` narrowly (just `useParams`, the common case)
// breaks the moment it transitively imports this file. Same class of bug as
// the `@/lib/api-client` transitive-barrel gotcha documented in
// vitest.config.ts; same fix, import the leaf module directly.
import { statsKeys } from "@/features/stats/queries/use-stats-overview";
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
