"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { collectionsApi } from "../api/collections.api";
import { collectionsKeys } from "../queries/use-collections";

export function useDeleteCollection(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (collectionId: string) =>
      collectionsApi.remove(
        storeId as string,
        collectionId,
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
