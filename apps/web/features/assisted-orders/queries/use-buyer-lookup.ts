"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { validatePhone } from "@biasmarket/utils/phone-country";
import { apiClient } from "@/lib/api-client";

export const buyerLookupKeys = {
  byPhone: (storeId: string, phone: string) =>
    ["assisted-order-buyer-lookup", storeId, phone] as const,
};

// Waits for the seller to stop typing before asking the API about the number.
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

// Previous orders and last alias for a valid number; stays idle while the
// number is incomplete or invalid.
export function useBuyerLookup(storeId: string | undefined, rawPhone: string) {
  const debounced = useDebounced(rawPhone, 400);
  const validated = validatePhone(debounced);
  const phone = validated.ok ? validated.phone : "";

  return useQuery({
    queryKey: buyerLookupKeys.byPhone(storeId ?? "", phone),
    queryFn: () => apiClient.customers.lookup(storeId as string, { phone }),
    enabled: !!storeId && phone !== "",
  });
}
