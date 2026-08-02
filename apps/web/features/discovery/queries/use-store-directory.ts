"use client";

import { useQuery } from "@tanstack/react-query";
import { discoveryApi } from "../api/discovery.api";

export function useStoreDirectory(q: string, page: number) {
  const { data, isPending, error } = useQuery({
    queryKey: ["discovery", "store-directory", q, page] as const,
    queryFn: () => discoveryApi.getStoreDirectory({ q: q || undefined, page }),
  });

  return {
    result: data ?? null,
    loading: isPending,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
  };
}
