import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const globalAccountKeys = {
  profile: ["global-account", "profile"] as const,
  orders: ["global-account", "orders"] as const,
  order: (orderId: string) => ["global-account", "order", orderId] as const,
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

// One order of the signed-in buyer account. Fetched in the browser on purpose:
// the buyer session cookie is host-only on the API host, so a server component
// calling INTERNAL_API_URL would never carry it (and would 401).
export function useGlobalOrder(orderId: string) {
  return useQuery({
    queryKey: globalAccountKeys.order(orderId),
    queryFn: () => apiClient.globalAccount.orderDetail(orderId),
    retry: false,
  });
}
