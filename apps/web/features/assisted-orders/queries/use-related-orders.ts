"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const relatedOrdersKeys = {
  byOrder: (storeId: string, orderId: string) =>
    ["related-orders", storeId, orderId] as const,
};

// Other orders of the same buyer number in this store (seller side).
export function useRelatedOrders(storeId: string, orderId: string) {
  return useQuery({
    queryKey: relatedOrdersKeys.byOrder(storeId, orderId),
    queryFn: () => apiClient.orders.findRelated(storeId, orderId),
  });
}
