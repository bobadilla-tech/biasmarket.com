"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { CategoryResponseDto } from "@biasmarket/types";
import { categoriesKeys } from "../queries/use-categories";

/**
 * Preserves the old `ensureCategory` semantic: resolve an existing category by
 * name, or create one. If creation fails (someone-else-just-created-it race),
 * refetch the list and re-resolve by name before giving up.
 */
export function useEnsureCategory(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const sid = storeId as string;
      const trimmed = name.trim();
      const normalized = trimmed.toLowerCase();
      const existing = queryClient
        .getQueryData<CategoryResponseDto[]>(categoriesKeys.byStore(sid))
        ?.find((category) => category.name.trim().toLowerCase() === normalized);
      if (existing) return existing;

      try {
        return await apiClient.categories.create(
          sid,
          { name: trimmed },
          { fallbackErrorMessage },
        );
      } catch {
        const refreshed = await apiClient.categories.findAll(sid, {
          fallbackErrorMessage,
        });
        queryClient.setQueryData(categoriesKeys.byStore(sid), refreshed);
        const resolved = refreshed.find((category) =>
          category.name.trim().toLowerCase() === normalized
        );
        if (!resolved) throw new Error(fallbackErrorMessage ?? "Network error");
        return resolved;
      }
    },
    onSuccess: (created) => {
      if (!storeId) return;
      queryClient.setQueryData<CategoryResponseDto[]>(
        categoriesKeys.byStore(storeId),
        (prev) => {
          if (!prev) return prev;
          if (prev.some((category) => category.id === created.id)) return prev;
          return [...prev, created];
        },
      );
    },
  });
}
