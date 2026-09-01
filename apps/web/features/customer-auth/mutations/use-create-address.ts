import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { AddressInput } from "@biasmarket/validation";

export function useCreateAddress(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: AddressInput) => apiClient.addresses.create(slug, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
    },
  });
}
