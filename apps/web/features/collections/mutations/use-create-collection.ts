"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { collectionsApi } from "../api/collections.api";
import { collectionsKeys } from "../queries/use-collections";
import type { CreateCollectionInput } from "../schemas/collection.schema";

export function useCreateCollection(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: CreateCollectionInput) =>
      collectionsApi.create(storeId as string, values, fallbackErrorMessage),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({
        queryKey: collectionsKeys.byStore(storeId),
      });
    },
  });
}
