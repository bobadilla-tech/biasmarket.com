"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { sectionsKeys } from "../queries/use-sections";
import type { SectionFormInput } from "../schemas/section.schema";

function buildContent(values: SectionFormInput): Record<string, unknown> {
  if (values.type === "BANNER") {
    return { imageUrl: values.imageUrl, linkUrl: values.linkUrl || undefined };
  }
  if (values.type === "TEXT_BLOCK") {
    return { body: values.body };
  }
  return {};
}

export function useCreateSection(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: SectionFormInput) =>
      apiClient.storeSections.create(
        storeId as string,
        {
          type: values.type,
          collectionId: values.type === "COLLECTION"
            ? values.collectionId
            : undefined,
          content: buildContent(values),
        },
        { fallbackErrorMessage },
      ),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({
        queryKey: sectionsKeys.byStore(storeId),
      });
    },
  });
}
