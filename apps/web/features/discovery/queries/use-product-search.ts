"use client";

import { useQuery } from "@tanstack/react-query";
import { discoveryApi } from "../api/discovery.api";

export function useProductSearch(q: string, page: number) {
  const { data, isPending, error } = useQuery({
    queryKey: ["discovery", "product-search", q, page] as const,
    queryFn: () => discoveryApi.searchProducts({ q: q || undefined, page }),
    enabled: q.trim().length > 0,
  });

  return {
    result: data ?? null,
    loading: isPending,
    error: error
      ? (error instanceof Error ? error.message : String(error))
      : null,
  };
}
