import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

// With a `slug` this is the per-store login (which also links the store to
// the buyer); without one it is the global login used by My purchases.
export function useCustomerLogin(slug?: string) {
  return useMutation({
    mutationFn: ({ phone, password }: { phone: string; password: string }) =>
      slug
        ? apiClient.customerAuth.login(slug, { phone, password })
        : apiClient.globalAccount.login({ phone, password }),
  });
}
