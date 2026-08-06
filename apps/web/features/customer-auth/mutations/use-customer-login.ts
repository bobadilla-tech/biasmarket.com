import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export function useCustomerLogin(slug: string) {
  return useMutation({
    mutationFn: ({ phone, password }: { phone: string; password: string }) =>
      apiClient.customerAuth.login(slug, { phone, password }),
  });
}
