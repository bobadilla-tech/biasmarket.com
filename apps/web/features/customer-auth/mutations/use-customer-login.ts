import { useMutation } from "@tanstack/react-query";
import { customerAuthApi } from "../api/customer-auth.api";

export function useCustomerLogin(slug: string) {
  return useMutation({
    mutationFn: ({ phone, password }: { phone: string; password: string }) =>
      customerAuthApi.login(slug, phone, password),
  });
}
