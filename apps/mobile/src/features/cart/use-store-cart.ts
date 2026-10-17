import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CartItem, CartItemIdentity } from "@biasmarket/utils/cart";
import {
  addToStoreCart,
  readStoreCart,
  removeFromStoreCart,
  setStoreCartQuantity,
} from "./cart-storage";

const cartKey = (storeSlug: string) => ["cart", storeSlug] as const;

export function useStoreCart(storeSlug: string) {
  const queryClient = useQueryClient();
  const cartQuery = useQuery({
    queryKey: cartKey(storeSlug),
    queryFn: () => readStoreCart(storeSlug),
    enabled: Boolean(storeSlug),
  });

  const mutation = useMutation({
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: cartKey(storeSlug) });
    },
    mutationFn: async (
      operation:
        | { type: "add"; item: CartItem }
        | { type: "quantity"; target: CartItemIdentity; quantity: number }
        | { type: "remove"; target: CartItemIdentity },
    ) => {
      if (operation.type === "add") {
        return addToStoreCart(storeSlug, operation.item);
      }
      if (operation.type === "quantity") {
        return setStoreCartQuantity(
          storeSlug,
          operation.target,
          operation.quantity,
        );
      }
      return removeFromStoreCart(storeSlug, operation.target);
    },
    onSuccess: (items) => queryClient.setQueryData(cartKey(storeSlug), items),
  });

  return {
    items: cartQuery.data ?? [],
    isLoading: cartQuery.isPending,
    error: mutation.error ?? cartQuery.error,
    isSaving: mutation.isPending,
    add: (item: CartItem) => mutation.mutate({ type: "add", item }),
    setQuantity: (target: CartItemIdentity, quantity: number) =>
      mutation.mutate({ type: "quantity", target, quantity }),
    remove: (target: CartItemIdentity) =>
      mutation.mutate({ type: "remove", target }),
  };
}
