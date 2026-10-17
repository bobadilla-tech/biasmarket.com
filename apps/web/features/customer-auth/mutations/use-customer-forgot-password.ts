import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

// Without a `slug` this is the global (My purchases) forgot-password.
export function useCustomerForgotPassword(slug?: string) {
  return useMutation({
    mutationFn: ({ phone }: { phone: string }) =>
      slug
        ? apiClient.customerAuth.forgotPassword(slug, { phone })
        : apiClient.globalAccount.forgotPassword({ phone }),
  });
}
