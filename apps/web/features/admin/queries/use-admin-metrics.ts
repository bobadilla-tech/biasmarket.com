"use client";

import { useQuery } from "@tanstack/react-query";
import {
  adminMetricsApi,
  type AdminAssistedOrderMetricsQuery,
} from "../api/admin-metrics.api";
import {
  metricsRangeFromPreset,
  type AdminMetricsPreset,
} from "./metrics-range";

export interface AdminMetricsQuery {
  preset: AdminMetricsPreset;
  storeId?: string;
}

export const adminMetricsKeys = {
  all: ["admin-metrics"] as const,
  list: (query?: AdminMetricsQuery) => ["admin-metrics", query ?? {}] as const,
};

export function useAdminMetrics(
  query: AdminMetricsQuery,
  fallbackErrorMessage?: string,
) {
  return useQuery({
    queryKey: adminMetricsKeys.list(query),
    queryFn: () => {
      const range = metricsRangeFromPreset(query.preset);
      const request: AdminAssistedOrderMetricsQuery = {
        ...range,
        storeId: query.storeId,
      };
      return adminMetricsApi.getAssistedOrderMetrics(
        request,
        fallbackErrorMessage,
      );
    },
  });
}
