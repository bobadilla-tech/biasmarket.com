"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { collectionsApi } from "../api/collections.api";
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
      collectionsApi.reorderProducts(
        storeId as string,
        collectionId,
        productIds,
        fallbackErrorMessage,
      ),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({
        queryKey: collectionsKeys.byStore(storeId),
      });
    },
  });
}
