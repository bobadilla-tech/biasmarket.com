"use client";

import { useQuery } from "@tanstack/react-query";
import type { ProductSearchResultResponseDto } from "@biasmarket/types";
import { discoveryApi } from "../api/discovery.api";

export function useLatestProducts(
  limit = 12,
  page = 1,
  opts: {
    sort?: "latest" | "bestseller";
    initialData?: ProductSearchResultResponseDto | null;
  } = {},
) {
  const sort = opts.sort ?? "latest";
  const { data, isPending, error } = useQuery({
    queryKey: ["discovery", "latest-products", limit, page, sort] as const,
    queryFn: () =>
      discoveryApi.searchProducts({
        q: undefined,
        page,
        limit,
        sort,
      }),
    initialData: opts.initialData ?? undefined,
    staleTime: opts.initialData ? 5 * 60 * 1000 : 0,
  });

  return {
    result: data ?? null,
    loading: isPending,
    error: error !== null,
  };
}
