import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export function useCustomerForgotPassword(slug: string) {
  return useMutation({
    mutationFn: ({ phone }: { phone: string }) =>
      apiClient.customerAuth.forgotPassword(slug, { phone }),
  });
}
