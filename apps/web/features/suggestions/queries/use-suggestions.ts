"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const suggestionsKeys = {
  byStore: (storeId: string) => ["suggestions", storeId] as const,
};

export function useSuggestions(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  return useQuery({
    queryKey: suggestionsKeys.byStore(storeId as string),
    queryFn: () =>
      apiClient.suggestions.findAll(storeId as string, {
        fallbackErrorMessage,
      }),
    enabled: !!storeId,
  });
}
