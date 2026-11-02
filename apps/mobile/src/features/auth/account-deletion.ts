import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@biasmarket/types";

const BUYER_CHECKOUT_STORAGE_PREFIXES = [
  "biasmarket:cart:",
  "biasmarket:checkout-key:",
] as const;

export function isSessionEndedDeleteError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export async function clearBuyerCheckoutState(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const checkoutKeys = keys.filter((key) =>
    BUYER_CHECKOUT_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)),
  );
  if (checkoutKeys.length > 0) await AsyncStorage.multiRemove(checkoutKeys);
}

export function clearBuyerCheckoutQueries(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: ["cart"] });
  queryClient.removeQueries({ queryKey: ["checkout"] });
}
