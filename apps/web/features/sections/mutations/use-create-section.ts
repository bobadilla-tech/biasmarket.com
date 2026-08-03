"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sectionsApi } from "../api/sections.api";
import { sectionsKeys } from "../queries/use-sections";
import type { SectionFormInput } from "../schemas/section.schema";

export function useCreateSection(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: SectionFormInput) =>
      sectionsApi.create(storeId as string, values, fallbackErrorMessage),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({
        queryKey: sectionsKeys.byStore(storeId),
      });
    },
  });
}
