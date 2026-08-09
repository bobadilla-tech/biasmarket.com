import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const orderDetailKeys = {
  detail: (slug: string, orderId: string) =>
    ["customer-auth", "order-detail", slug, orderId] as const,
};

// Same "ask the API, a failure just means logged-out/not-yours" convention as
// useCustomerProfile — 401 (no session) and 404 (wrong buyer or bad orderId)
// both resolve as isError, no retry.
export function useOrderDetail(slug: string, orderId: string) {
  return useQuery({
    queryKey: orderDetailKeys.detail(slug, orderId),
    queryFn: () => apiClient.customerAuth.orderDetail(slug, orderId),
    retry: false,
  });
}
