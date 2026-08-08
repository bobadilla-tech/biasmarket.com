"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UpdateStoreSectionDto } from "@biasmarket/types";
import { apiClient } from "@/lib/api-client";
import { sectionsKeys } from "../queries/use-sections";

export function useUpdateSection(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      { sectionId, dto }: { sectionId: string; dto: UpdateStoreSectionDto },
    ) =>
      apiClient.storeSections.update(storeId as string, sectionId, dto, {
        fallbackErrorMessage,
      }),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({
        queryKey: sectionsKeys.byStore(storeId),
      });
    },
  });
}
