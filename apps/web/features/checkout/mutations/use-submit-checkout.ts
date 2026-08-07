"use client";

import { useMutation } from "@tanstack/react-query";
import { checkoutApi } from "../api/checkout.api";
import type { CartItem } from "@/lib/cart";

export function useSubmitCheckout(slug: string, fallbackErrorMessage?: string) {
  return useMutation({
    mutationFn: (values: {
      deliveryMethodType: string;
      pickupPointId?: string;
      pickupDate?: string;
      paymentMethod?: string;
      customerName?: string;
      customerPhone: string;
      customerEmail?: string;
      items: CartItem[];
    }) => checkoutApi.submit(slug, values, fallbackErrorMessage),
  });
}
