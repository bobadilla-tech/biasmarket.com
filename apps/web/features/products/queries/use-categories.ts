"use client";

import { useQuery } from "@tanstack/react-query";
import { categoriesApi } from "../api/categories.api";

export const categoriesKeys = {
  byStore: (storeId: string) => ["categories", storeId] as const,
};

export function useCategories(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  return useQuery({
    queryKey: categoriesKeys.byStore(storeId as string),
    queryFn: () => categoriesApi.list(storeId as string, fallbackErrorMessage),
    enabled: !!storeId,
  });
}
