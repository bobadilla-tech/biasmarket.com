"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { collectionsApi } from "../api/collections.api";
import { collectionsKeys } from "../queries/use-collections";

export function useRemoveCollectionProduct(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ collectionId, productId }: { collectionId: string; productId: string }) =>
      collectionsApi.removeProduct(storeId as string, collectionId, productId, fallbackErrorMessage),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({ queryKey: collectionsKeys.byStore(storeId) });
    },
  });
}
