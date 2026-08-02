"use client";

import { useQuery } from "@tanstack/react-query";
import { productsApi } from "../api/products.api";
import { productsKeys } from "./use-products";

export function useProduct(
  storeId: string | undefined,
  productId: string,
  fallbackErrorMessage?: string,
) {
  return useQuery({
    queryKey: productsKeys.detail(storeId as string, productId),
    queryFn: () => productsApi.get(storeId as string, productId, fallbackErrorMessage),
    enabled: !!storeId && !!productId,
  });
}
