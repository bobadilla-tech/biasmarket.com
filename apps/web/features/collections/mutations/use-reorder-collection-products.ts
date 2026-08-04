"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { collectionsKeys } from "../queries/use-collections";

export function useReorderCollectionProducts(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      { collectionId, productIds }: {
        collectionId: string;
        productIds: string[];
      },
    ) =>
      apiClient.collections.reorderProducts(
        storeId as string,
        collectionId,
        { productIds },
        { fallbackErrorMessage },
      ),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({
        queryKey: collectionsKeys.byStore(storeId),
      });
    },
  });
}
