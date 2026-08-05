"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const sectionsKeys = {
  byStore: (storeId: string) => ["sections", storeId] as const,
};

export function useSections(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  return useQuery({
    queryKey: sectionsKeys.byStore(storeId as string),
    queryFn: () =>
      apiClient.storeSections.findAll(storeId as string, {
        fallbackErrorMessage,
      }),
    enabled: !!storeId,
  });
}
