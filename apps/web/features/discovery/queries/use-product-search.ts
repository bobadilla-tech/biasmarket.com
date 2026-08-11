"use client";

import { useQuery } from "@tanstack/react-query";
import { discoveryApi } from "../api/discovery.api";

export function useProductSearch(
  q: string,
  page: number,
  opts: {
    category?: string;
    sort?: "latest" | "bestseller";
  } = {},
) {
  const { data, isPending, error } = useQuery({
    queryKey: [
      "discovery",
      "product-search",
      q,
      page,
      opts.category,
      opts.sort,
    ] as const,
    queryFn: () =>
      discoveryApi.searchProducts({
        q: q || undefined,
        page,
        category: opts.category || undefined,
        sort: opts.sort,
      }),
  });

  return {
    result: data ?? null,
    loading: isPending,
    error: error !== null,
  };
}
