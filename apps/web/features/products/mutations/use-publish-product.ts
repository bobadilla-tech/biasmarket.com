"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { productsKeys } from "../queries/use-products";
import type { Product } from "../schemas/product.schema";

export function usePublishProduct(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (productId: string) =>
      apiClient.products.publish(storeId as string, productId, {
        fallbackErrorMessage,
      }),
    onSuccess: (_data, productId) => {
      if (!storeId) return;
      queryClient.invalidateQueries({
        queryKey: productsKeys.byStore(storeId),
      });
      queryClient.setQueryData<Product>(
        productsKeys.detail(storeId, productId),
        (current) => current ? { ...current, status: "PUBLISHED" } : current,
      );
    },
  });
}
