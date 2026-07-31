import { useMutation, useQueryClient } from "@tanstack/react-query";
import { storesApi } from "../api/stores.api";

export function useDeleteStore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (storeId: string) => storesApi.remove(storeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores", "mine"] });
    },
  });
}
