import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { customerAuthKeys } from "../queries/use-customer-profile";

export function useCustomerUpdateProfile(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: { name: string; email?: string; phone?: string }) =>
      apiClient.customerAuth.updateMe(slug, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: customerAuthKeys.profile(slug),
      });
    },
  });
}
