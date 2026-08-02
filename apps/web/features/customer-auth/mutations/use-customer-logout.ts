import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customerAuthApi } from "../api/customer-auth.api";
import { customerAuthKeys } from "../queries/use-customer-profile";

export function useCustomerLogout(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => customerAuthApi.logout(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerAuthKeys.profile(slug) });
    },
  });
}
