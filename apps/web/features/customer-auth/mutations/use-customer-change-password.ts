import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export function useCustomerChangePassword(slug: string) {
  return useMutation({
    mutationFn: (
      { currentPassword, newPassword }: {
        currentPassword: string;
        newPassword: string;
      },
    ) =>
      apiClient.customerAuth.changePassword(slug, {
        currentPassword,
        newPassword,
      }),
  });
}
