import { useMutation } from "@tanstack/react-query";
import { customerAuthApi } from "../api/customer-auth.api";

export function useCustomerChangePassword(slug: string) {
  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      customerAuthApi.changePassword(slug, currentPassword, newPassword),
  });
}
