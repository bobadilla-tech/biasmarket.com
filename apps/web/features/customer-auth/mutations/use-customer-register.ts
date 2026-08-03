import { useMutation } from "@tanstack/react-query";
import { customerAuthApi } from "../api/customer-auth.api";

export function useCustomerRegister(slug: string) {
  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      customerAuthApi.register(slug, token, password),
  });
}
