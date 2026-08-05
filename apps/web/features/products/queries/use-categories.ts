"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const categoriesKeys = {
  byStore: (storeId: string) => ["categories", storeId] as const,
};

export function useCategories(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  return useQuery({
    queryKey: categoriesKeys.byStore(storeId as string),
    queryFn: () =>
      apiClient.categories.findAll(storeId as string, {
        fallbackErrorMessage,
      }),
    enabled: !!storeId,
  });
}
