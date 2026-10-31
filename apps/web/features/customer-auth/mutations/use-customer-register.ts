import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

// Without a `slug` this redeems a token for the global reset-password page.
export function useCustomerRegister(slug?: string) {
  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      slug
        ? apiClient.customerAuth.register(slug, { token, password })
        : apiClient.globalAccount.resetPassword({ token, password }),
  });
}
