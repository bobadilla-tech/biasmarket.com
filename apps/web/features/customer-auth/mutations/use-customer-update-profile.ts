import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customerAuthApi } from "../api/customer-auth.api";
import { customerAuthKeys } from "../queries/use-customer-profile";

export function useCustomerUpdateProfile(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: { name: string; email?: string; phone?: string }) =>
      customerAuthApi.updateProfile(slug, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerAuthKeys.profile(slug) });
    },
  });
}
