import { apiFetch } from "@/lib/api";
import type { CartItem } from "@/lib/cart";
import {
  checkoutResultSchema,
  deliveryMethodListSchema,
  paymentMethodListSchema,
  pickupPointListSchema,
} from "../schemas/checkout.schema";

export const checkoutApi = {
  async getDeliveryOptions(slug: string) {
    const [methods, points, paymentMethods] = await Promise.all([
      apiFetch(`/stores/${slug}/public/delivery-methods`),
      apiFetch(`/stores/${slug}/public/pickup-points`),
      apiFetch(`/stores/${slug}/public/payment-methods`),
    ]);
    return {
      methods: deliveryMethodListSchema.parse(methods),
      points: pickupPointListSchema.parse(points),
      paymentMethods: paymentMethodListSchema.parse(paymentMethods),
    };
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
