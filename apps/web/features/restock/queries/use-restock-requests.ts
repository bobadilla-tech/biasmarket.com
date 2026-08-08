"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const restockKeys = {
  byStore: (storeId: string) => ["restock", storeId] as const,
  count: (storeId: string) =>
    [...restockKeys.byStore(storeId), "count"] as const,
};

export function useRestockRequests(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  return useQuery({
    queryKey: restockKeys.byStore(storeId as string),
    queryFn: () =>
      apiClient.restock.list(storeId as string, { fallbackErrorMessage }),
    enabled: !!storeId,
  });
}
