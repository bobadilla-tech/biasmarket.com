import { apiClient } from "@/lib/api-client";
import type { CartItem } from "@/lib/cart";

export const checkoutApi = {
  async getDeliveryOptions(slug: string) {
    const [methods, pickupPoints, paymentMethods] = await Promise.all([
      apiClient.publicDeliveryConfig.findEnabled(slug),
      apiClient.publicPickupPoints.findEnabled(slug),
      apiClient.publicPaymentConfig.findEnabled(slug),
    ]);
    return {
      methods,
      points: pickupPoints.points,
      // Server-computed weekday for openDays validation — the checkout form
      // must use this instead of `new Date().getDay()` so pickup availability
      // never diverges between browser and API.
      weekday: pickupPoints.weekday,
      paymentMethods,
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
