import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export function useCustomerRegister(slug: string) {
  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      apiClient.customerAuth.register(slug, { token, password }),
  });
}
