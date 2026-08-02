"use client";

import { useQuery } from "@tanstack/react-query";
import { discoveryApi } from "../api/discovery.api";

export function useFeaturedStores(limit?: number) {
  const { data, isPending, error } = useQuery({
    queryKey: ["discovery", "featured-stores", limit] as const,
    queryFn: () => discoveryApi.getFeaturedStores(limit),
  });

  return {
    stores: data ?? [],
    loading: isPending,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
  };
}
