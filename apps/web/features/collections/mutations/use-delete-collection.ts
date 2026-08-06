"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { collectionsKeys } from "../queries/use-collections";

export function useDeleteCollection(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (collectionId: string) =>
      apiClient.collections.remove(storeId as string, collectionId, {
        fallbackErrorMessage,
      }),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({
        queryKey: collectionsKeys.byStore(storeId),
      });
    },
  });
}
