import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { customerAuthKeys } from "../queries/use-customer-profile";

export function useCustomerLogout(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.customerAuth.logout(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: customerAuthKeys.profile(slug),
      });
    },
  });
}
