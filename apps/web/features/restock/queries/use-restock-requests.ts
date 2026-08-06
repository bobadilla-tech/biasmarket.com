"use client";

import { useQuery } from "@tanstack/react-query";
import { restockApi } from "../api/restock.api";

export const restockKeys = {
  byStore: (storeId: string) => ["restock", storeId] as const,
};

export function useRestockRequests(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  return useQuery({
    queryKey: restockKeys.byStore(storeId as string),
    queryFn: () => restockApi.list(storeId as string, fallbackErrorMessage),
    enabled: !!storeId,
  });
}
