import { useMutation } from "@tanstack/react-query";
import { customerAuthApi } from "../api/customer-auth.api";

export function useCustomerForgotPassword(slug: string) {
  return useMutation({
    mutationFn: ({ phone }: { phone: string }) =>
      customerAuthApi.forgotPassword(slug, phone),
  });
}
