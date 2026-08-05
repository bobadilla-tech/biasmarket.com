"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { productsKeys } from "./use-products";

export function useProduct(
  storeId: string | undefined,
  productId: string,
  fallbackErrorMessage?: string,
) {
  return useQuery({
    queryKey: productsKeys.detail(storeId as string, productId),
    queryFn: () =>
      apiClient.products.findOne(storeId as string, productId, {
        fallbackErrorMessage,
      }),
    enabled: !!storeId && !!productId,
  });
}
