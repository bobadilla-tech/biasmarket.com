"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

// Session state can only be known by asking the API (the session cookie is
// HttpOnly) — a 401 here just means "guest/logged-out", not an error to
// surface, so this never retries. Only used to prefill the inline
// shippingAddress fields at COURIER checkout; checkout itself never reads
// saved addresses server-side — see
// docs/plans/2026-08-08-buyer-shipping-addresses-plan.md's "Important
// correction" section.
export function useDefaultShippingAddress(slug: string) {
  return useQuery({
    queryKey: ["addresses", "default", slug],
    queryFn: async () => {
      const addresses = await apiClient.addresses.findAll(slug);
      return addresses[0] ?? null;
    },
    retry: false,
  });
}
