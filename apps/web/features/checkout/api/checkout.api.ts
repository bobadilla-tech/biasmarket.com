import { apiFetch } from "@/lib/api";
import { apiClient } from "@/lib/api-client";
import type { CartItem } from "@/lib/cart";
import { checkoutResultSchema } from "../schemas/checkout.schema";

export const checkoutApi = {
  async getDeliveryOptions(slug: string) {
    const [methods, points, paymentMethods] = await Promise.all([
      apiClient.publicDeliveryConfig.findEnabled(slug),
      apiClient.publicPickupPoints.findEnabled(slug),
      apiClient.publicPaymentConfig.findEnabled(slug),
    ]);
    return { methods, points, paymentMethods };
  },

  async submit(
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
    const data = await apiFetch(
      `/stores/${slug}/checkout`,
      {
        method: "POST",
        body: JSON.stringify({
          deliveryMethodType: values.deliveryMethodType,
          pickupPointId: values.pickupPointId || undefined,
          customerName: values.customerName || undefined,
          customerPhone: values.customerPhone,
          customerEmail: values.customerEmail || undefined,
          items: values.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
          })),
        }),
      },
      fallbackErrorMessage,
    );
    return checkoutResultSchema.parse(data);
  },
};
