"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sectionsApi } from "../api/sections.api";
import { sectionsKeys } from "../queries/use-sections";

export function useReorderSections(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sectionIds: string[]) =>
      sectionsApi.reorder(storeId as string, sectionIds, fallbackErrorMessage),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({
        queryKey: sectionsKeys.byStore(storeId),
      });
    },
  });
}
