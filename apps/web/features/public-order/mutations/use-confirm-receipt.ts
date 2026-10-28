import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { publicOrderKeys } from "../queries/use-public-order";

// Must run in the browser (the token page is client-rendered). The API only
// accepts JSON, so an empty object body carries the content type.
export function useConfirmReceipt(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.publicOrders.confirmReceipt(token, {
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: publicOrderKeys.detail(token),
      }),
  });
}
