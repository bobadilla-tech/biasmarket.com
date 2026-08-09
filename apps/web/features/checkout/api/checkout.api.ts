import { apiClient } from "@/lib/api-client";
import type { CartItem } from "@/lib/cart";
import type { ShippingAddressDto } from "@biasmarket/types";

export const checkoutApi = {
  async getDeliveryOptions(slug: string) {
    const [methods, pickupPoints, paymentMethods, store] = await Promise.all([
      apiClient.publicDeliveryConfig.findEnabled(slug),
      apiClient.publicPickupPoints.findEnabled(slug),
      // Already carries each method's structured `details` (bank account /
      // Yape-Plin number + QR) — the checkout confirmation screen reads this
      // same cached query instead of doing a second fetch.
      apiClient.publicPaymentConfig.findEnabled(slug),
      apiClient.stores.findPublic(slug),
    ]);
    return {
      methods,
      points: pickupPoints.points,
      // Server-computed weekday for openDays validation — the checkout form
      // must use this instead of `new Date().getDay()` so pickup availability
      // never diverges between browser and API.
      weekday: pickupPoints.weekday,
      paymentMethods,
      storePaymentInstructions: store.paymentInstructions,
    };
  },

  submit(
    slug: string,
    values: {
      deliveryMethodType: string;
      pickupPointId?: string;
      pickupDate?: string;
      paymentMethod?: string;
      customerName?: string;
      customerPhone: string;
      customerEmail?: string;
      shippingAddress?: ShippingAddressDto;
      items: CartItem[];
    },
    fallbackErrorMessage?: string,
  ) {
    return apiClient.checkout.create(
      slug,
      {
        deliveryMethodType: values.deliveryMethodType as "PICKUP" | "COURIER",
        pickupPointId: values.pickupPointId || undefined,
        pickupDate: values.pickupDate || undefined,
        paymentMethod: values.paymentMethod
          ? (values.paymentMethod as "YAPE" | "PLIN" | "TRANSFER" | "CASH")
          : undefined,
        customerName: values.customerName || undefined,
        customerPhone: values.customerPhone,
        customerEmail: values.customerEmail || undefined,
        shippingAddress: values.shippingAddress,
        items: values.items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
        })),
      },
      { fallbackErrorMessage },
    );
  },
};
