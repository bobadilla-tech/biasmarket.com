"use client";

import { useQuery } from "@tanstack/react-query";
import { discoveryApi } from "../api/discovery.api";

export function useLatestProducts(limit = 12, page = 1) {
  const { data, isPending, error } = useQuery({
    queryKey: ["discovery", "latest-products", limit, page] as const,
    queryFn: () =>
      discoveryApi.searchProducts({ q: undefined, page, limit }),
  });

  return {
    result: data ?? null,
    loading: isPending,
    error: error
      ? (error instanceof Error ? error.message : String(error))
      : null,
  };
}
