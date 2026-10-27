"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { ProductDetailResponseDto } from "@biasmarket/types";
import { apiClient } from "@/lib/api-client";
import {
  productsKeys,
  useProducts,
} from "@/features/products/queries/use-products";

// Same rules CreateAssistedOrderUseCase applies: published, not deleted, not
// discontinued, in this store (the list is already store-scoped).
export function useOrderableProducts(storeId: string | undefined) {
  const query = useProducts(storeId);
  const products = useMemo(
    () =>
      (query.data ?? []).filter(
        (product) =>
          product.status === "PUBLISHED" &&
          !product.deletedAt &&
          !product.discontinued,
      ),
    [query.data],
  );
  return { ...query, products };
}

// Variants live on the product detail. Shares its cache keys with
// `useProduct`, so a product opened elsewhere is not fetched twice.
export function useProductDetails(
  storeId: string | undefined,
  productIds: string[],
) {
  const unique = useMemo(
    () => [...new Set(productIds.filter(Boolean))],
    [productIds.join("\u0000")],
  );
  const results = useQueries({
    queries: unique.map((productId) => ({
      queryKey: productsKeys.detail(storeId as string, productId),
      queryFn: () => apiClient.products.findOne(storeId as string, productId),
      enabled: !!storeId,
    })),
  });
  const details = useMemo(() => {
    const map = new Map<string, ProductDetailResponseDto>();
    results.forEach((result, index) => {
      if (result.data) map.set(unique[index]!, result.data);
    });
    return map;
  }, [results, unique]);
  return details;
}
