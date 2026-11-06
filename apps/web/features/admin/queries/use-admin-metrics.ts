"use client";

import { useQuery } from "@tanstack/react-query";
import {
  adminMetricsApi,
  type AdminAssistedOrderMetricsQuery,
} from "../api/admin-metrics.api";

export const adminMetricsKeys = {
  all: ["admin-metrics"] as const,
  list: (query?: AdminAssistedOrderMetricsQuery) =>
    ["admin-metrics", query ?? {}] as const,
};

export function useAdminMetrics(
  query?: AdminAssistedOrderMetricsQuery,
  fallbackErrorMessage?: string,
) {
  return useQuery({
    queryKey: adminMetricsKeys.list(query),
    queryFn: () =>
      adminMetricsApi.getAssistedOrderMetrics(query, fallbackErrorMessage),
  });
}
