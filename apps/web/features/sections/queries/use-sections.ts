"use client";

import { useQuery } from "@tanstack/react-query";
import { sectionsApi } from "../api/sections.api";

export const sectionsKeys = {
  byStore: (storeId: string) => ["sections", storeId] as const,
};

export function useSections(storeId: string | undefined, fallbackErrorMessage?: string) {
  return useQuery({
    queryKey: sectionsKeys.byStore(storeId as string),
    queryFn: () => sectionsApi.list(storeId as string, fallbackErrorMessage),
    enabled: !!storeId,
  });
}
