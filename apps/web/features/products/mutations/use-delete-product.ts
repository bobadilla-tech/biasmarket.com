"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { productsApi } from "../api/products.api";
import { productsKeys } from "../queries/use-products";

export function useDeleteProduct(storeId: string | undefined, fallbackErrorMessage?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (productId: string) => productsApi.remove(storeId as string, productId, fallbackErrorMessage),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({ queryKey: productsKeys.byStore(storeId) });
    },
  });
}
