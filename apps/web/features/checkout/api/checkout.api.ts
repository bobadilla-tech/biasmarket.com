import { apiClient } from "@/lib/api-client";
import type { CartItem } from "@/lib/cart";

export const checkoutApi = {
  async getDeliveryOptions(slug: string) {
    const [methods, points, paymentMethods] = await Promise.all([
      apiClient.publicDeliveryConfig.findEnabled(slug),
      apiClient.publicPickupPoints.findEnabled(slug),
      apiClient.publicPaymentConfig.findEnabled(slug),
    ]);
    return { methods, points, paymentMethods };
  },

  submit(
    slug: string,
    values: {
      deliveryMethodType: string;
      pickupPointId?: string;
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
