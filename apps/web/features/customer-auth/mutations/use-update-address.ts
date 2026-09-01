import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { AddressInput } from "@biasmarket/validation";

export function useUpdateAddress(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      dto,
    }: {
      id: string;
      dto: Partial<AddressInput> & { isDefault?: boolean };
    }) => apiClient.addresses.update(slug, id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
    },
  });
}
