"use client";

import { useQuery } from "@tanstack/react-query";
import { ordersApi } from "../api/orders.api";

export const ordersKeys = {
  byStore: (storeId: string) => ["orders", storeId] as const,
};

export function useOrders(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  return useQuery({
    queryKey: ordersKeys.byStore(storeId as string),
    queryFn: () => ordersApi.list(storeId as string, fallbackErrorMessage),
    enabled: !!storeId,
  });
}
