"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { collectionsKeys } from "../queries/use-collections";
import type { CreateCollectionInput } from "../schemas/collection.schema";

export function useCreateCollection(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: CreateCollectionInput) =>
      apiClient.collections.create(
        storeId as string,
        { name: values.name, description: values.description || undefined },
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
