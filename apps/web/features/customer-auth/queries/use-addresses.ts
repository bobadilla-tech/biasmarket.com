import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

// Shares the "addresses" root with checkout's useDefaultShippingAddress
// query key (["addresses", "default", slug]) so a broad
// invalidateQueries({ queryKey: ["addresses"] }) after an add/edit/delete/
// set-default refreshes both — the account page's list and checkout's
// prefill both read from the same buyer-scoped address book.
export const addressesKeys = {
  list: (slug: string) => ["addresses", "list", slug] as const,
};

export function useAddresses(slug: string) {
  return useQuery({
    queryKey: addressesKeys.list(slug),
    queryFn: () => apiClient.addresses.findAll(slug),
  });
}
