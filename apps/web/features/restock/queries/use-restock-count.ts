"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { restockKeys } from "./use-restock-requests";

export function useRestockCount(storeId: string | undefined) {
  return useQuery({
    queryKey: restockKeys.count(storeId as string),
    queryFn: () => apiClient.restock.count(storeId as string),
    enabled: !!storeId,
  });
}
