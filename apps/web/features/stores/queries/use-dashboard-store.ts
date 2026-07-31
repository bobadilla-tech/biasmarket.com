"use client";

import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { storesApi } from "../api/stores.api";
import type { DashboardStore } from "../schemas/dashboard-store.schema";

export const dashboardStoreKeys = {
  bySlug: (slug: string) => ["store", "by-slug", slug] as const,
};

export function useDashboardStore() {
  const { slug } = useParams<{ slug: string }>();

  const {
    data: store,
    isPending,
    error,
  } = useQuery({
    queryKey: dashboardStoreKeys.bySlug(slug),
    queryFn: () => storesApi.getBySlug(slug),
    enabled: !!slug,
  });

  return {
    store: store ?? null,
    storeId: store?.id,
    slug,
    loading: isPending,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
  };
}

/**
 * Local cache patch after a settings mutation — mirrors the old
 * `broadcastStoreUpdate` CustomEvent, but writes straight into the query
 * cache instead of a window event, so every `useDashboardStore()` consumer
 * re-renders without a network round-trip.
 */
export function useUpdateDashboardStoreCache() {
  const queryClient = useQueryClient();

  return (slug: string, patch: Partial<DashboardStore>) => {
    queryClient.setQueryData<DashboardStore>(dashboardStoreKeys.bySlug(slug), (current) =>
      current ? { ...current, ...patch } : current,
    );
  };
}
