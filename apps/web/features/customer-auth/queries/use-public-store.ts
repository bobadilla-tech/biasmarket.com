import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const publicStoreKeys = {
  detail: (slug: string) => ["store", "public", slug] as const,
};

// Storefront-only need: the store's name/whatsappNumber for the
// "contact seller" button. Public endpoint, no auth required.
export function usePublicStore(slug: string) {
  return useQuery({
    queryKey: publicStoreKeys.detail(slug),
    queryFn: () => apiClient.stores.findPublic(slug),
  });
}
