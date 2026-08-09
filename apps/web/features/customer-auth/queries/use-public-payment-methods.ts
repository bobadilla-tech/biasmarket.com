"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const publicPaymentMethodsKeys = {
  byStore: (slug: string) => ["public-payment-methods", slug] as const,
};

// Same public, unauthenticated read the checkout flow already uses
// (`checkoutApi.getDeliveryOptions`'s `publicPaymentConfig.findEnabled`) — a
// logged-in buyer submitting a proof needs the same enabled-method list the
// seller configured, not the seller-only `useEnabledPaymentMethods` hook
// (that one calls an AuthGuard'd endpoint the buyer session can't pass).
export function usePublicPaymentMethods(slug: string) {
  return useQuery({
    queryKey: publicPaymentMethodsKeys.byStore(slug),
    queryFn: () => apiClient.publicPaymentConfig.findEnabled(slug),
  });
}
