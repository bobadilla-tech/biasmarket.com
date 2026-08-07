import { useMutation, useQueryClient } from "@tanstack/react-query";
import { statsKeys } from "@/features/stats";
import { ordersApi } from "../api/orders.api";
import { ordersKeys } from "../queries/use-orders";

export function useCancelOrder(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orderId,
      values,
    }: {
      orderId: string;
      values: {
        resolution: "REFUNDED" | "RETAINED" | "STORE_CREDIT";
        retainMode?: "FULL" | "PARTIAL";
        retainedAmount?: number;
        releasedResolution?: "REFUNDED" | "STORE_CREDIT";
        reason?: string;
      };
    }) => {
      if (!storeId) {
        throw new Error("Store ID is required");
      }

      return ordersApi.cancelOrder(
        storeId,
        orderId,
        values,
        fallbackErrorMessage,
      );
    },

    onSuccess() {
      if (!storeId) return;

      queryClient.invalidateQueries({
        queryKey: ordersKeys.byStore(storeId),
      });

      void queryClient.invalidateQueries({
        queryKey: statsKeys.overview(storeId),
      });
    },
  });
}
