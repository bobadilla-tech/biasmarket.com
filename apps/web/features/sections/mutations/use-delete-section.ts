"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sectionsApi } from "../api/sections.api";
import { sectionsKeys } from "../queries/use-sections";

export function useDeleteSection(storeId: string | undefined, fallbackErrorMessage?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sectionId: string) =>
      sectionsApi.remove(storeId as string, sectionId, fallbackErrorMessage),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({ queryKey: sectionsKeys.byStore(storeId) });
    },
  });
}
