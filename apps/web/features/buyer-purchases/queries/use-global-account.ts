import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const globalAccountKeys = {
  profile: ["global-account", "profile"] as const,
  orders: ["global-account", "orders"] as const,
};

// A 401 just means "no buyer session" — the page renders its logged-out state
// instead of an error, so neither query retries.
export function useGlobalAccount() {
  return useQuery({
    queryKey: globalAccountKeys.profile,
    queryFn: () => apiClient.globalAccount.me(),
    retry: false,
  });
}

export function useGlobalOrders(enabled: boolean) {
  return useQuery({
    queryKey: globalAccountKeys.orders,
    queryFn: () => apiClient.globalAccount.orders(),
    enabled,
    retry: false,
  });
}
