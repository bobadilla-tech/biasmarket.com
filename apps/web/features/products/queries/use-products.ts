"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const productsKeys = {
  byStore: (storeId: string) => ["products", storeId] as const,
  detail: (storeId: string, productId: string) =>
    ["products", storeId, productId] as const,
};

export function useProducts(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  return useQuery({
    queryKey: productsKeys.byStore(storeId as string),
    queryFn: () =>
      apiClient.products.findAll(storeId as string, { fallbackErrorMessage }),
    enabled: !!storeId,
  });
}
