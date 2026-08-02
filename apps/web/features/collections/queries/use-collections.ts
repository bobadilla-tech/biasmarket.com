"use client";

import { useQuery } from "@tanstack/react-query";
import { collectionsApi } from "../api/collections.api";

export const collectionsKeys = {
  byStore: (storeId: string) => ["collections", storeId] as const,
};

export function useCollections(storeId: string | undefined, fallbackErrorMessage?: string) {
  return useQuery({
    queryKey: collectionsKeys.byStore(storeId as string),
    queryFn: () => collectionsApi.list(storeId as string, fallbackErrorMessage),
    enabled: !!storeId,
  });
}
