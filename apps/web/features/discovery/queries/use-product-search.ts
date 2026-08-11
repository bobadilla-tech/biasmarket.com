"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

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
      apiClient.productSearch.search({
        q: q || undefined,
        page: String(page),
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
