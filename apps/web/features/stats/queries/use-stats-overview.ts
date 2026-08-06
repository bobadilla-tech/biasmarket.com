"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const statsKeys = {
  overview: (storeId: string) => ["stats", "overview", storeId] as const,
};

export function useStatsOverview(storeId: string | undefined) {
  const { data, isPending, error } = useQuery({
    queryKey: statsKeys.overview(storeId ?? ""),
    queryFn: () => apiClient.stats.overview(storeId as string),
    enabled: !!storeId,
  });

  return {
    stats: data ?? null,
    loading: isPending,
    error: error
      ? (error instanceof Error ? error.message : String(error))
      : null,
  };
}
