"use client";

import { useQuery } from "@tanstack/react-query";
import { checkoutApi } from "../api/checkout.api";

export const deliveryOptionsKeys = {
  bySlug: (slug: string) => ["checkout-delivery-options", slug] as const,
};

export function useDeliveryOptions(slug: string | undefined) {
  return useQuery({
    queryKey: deliveryOptionsKeys.bySlug(slug ?? ""),
    queryFn: () => checkoutApi.getDeliveryOptions(slug as string),
    enabled: !!slug,
  });
}
