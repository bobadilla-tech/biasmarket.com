"use client";

import { useQuery } from "@tanstack/react-query";
import { statsApi } from "../api/stats.api";
import type { AnalyticsRange } from "../schemas/analytics.schema";

export const analyticsKeys = {
  byStore: (storeId: string, range: AnalyticsRange) => ["stats", "analytics", storeId, range] as const,
};

export function useAnalytics(storeId: string | undefined, range: AnalyticsRange) {
  const { data, isPending, error } = useQuery({
    queryKey: analyticsKeys.byStore(storeId ?? "", range),
    queryFn: () => statsApi.getAnalytics(storeId as string, range),
    enabled: !!storeId,
  });

  return {
    analytics: data ?? null,
    loading: isPending,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
  };
}
