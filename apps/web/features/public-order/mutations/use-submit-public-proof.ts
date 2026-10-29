import { useMutation, useQueryClient } from "@tanstack/react-query";
import { submitProof } from "../api/submit-proof";
import { publicOrderKeys } from "../queries/use-public-order";
import type { SubmitProofInput } from "../schemas/submit-proof.schema";

// Named apart from the customer-auth hook: this one is token-authorized.
export function useSubmitPublicProof(token: string, fallbackError?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: SubmitProofInput) =>
      submitProof(token, values, fallbackError),
    // Refetch also on failure: a 400 "El pedido venció" or a stale balance
    // means the page is out of date (the browser clock may be skewed).
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: publicOrderKeys.detail(token),
      }),
  });
}
