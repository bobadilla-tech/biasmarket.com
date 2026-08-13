import { apiClient } from "@/lib/api-client";
import type { CartItem } from "@/lib/cart";
import type { ShippingAddressDto } from "@biasmarket/types";

function apiUrl() {
  return process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
}

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

  // Multipart carve-out (see apps/web/AGENTS.md): the checkout endpoint now
  // carries the buyer's optional proof-of-payment file, so it stays on raw
  // fetch/FormData like orders' registerPayment instead of the generated
  // `apiClient.checkout.create` (the Orval client is regenerated for the
  // OpenAPI contract but no longer the transport for this route). The
  // `file` part is only appended for manual methods — CASH checkout carries
  // no proof. `items`/`shippingAddress` are JSON-string form fields the
  // backend parses back.
  async submit(
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
      paymentProof?: File | null;
      items: CartItem[];
    },
    fallbackErrorMessage?: string,
  ) {
    const formData = new FormData();
    formData.append("deliveryMethodType", values.deliveryMethodType);
    if (values.pickupPointId) {
      formData.append("pickupPointId", values.pickupPointId);
    }
    if (values.pickupDate) {
      formData.append("pickupDate", values.pickupDate);
    }
    if (values.paymentMethod) {
      formData.append("paymentMethod", values.paymentMethod);
    }
    formData.append("customerPhone", values.customerPhone);
    if (values.customerName) {
      formData.append("customerName", values.customerName);
    }
    if (values.customerEmail) {
      formData.append("customerEmail", values.customerEmail);
    }
    if (values.shippingAddress) {
      formData.append(
        "shippingAddress",
        JSON.stringify(values.shippingAddress),
      );
    }
    formData.append(
      "items",
      JSON.stringify(
        values.items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
        })),
      ),
    );
    if (values.paymentProof && values.paymentMethod !== "CASH") {
      formData.append("file", values.paymentProof);
    }

    const res = await fetch(`${apiUrl()}/api/stores/${slug}/checkout`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      // The backend's validation errors arrive as an array of messages (the
      // multipart controller flattens class-validator constraints) — join
      // them so the buyer sees every problem at once.
      const message = Array.isArray(data?.message)
        ? data.message.join("\n")
        : data?.message;
      throw new Error(message ?? fallbackErrorMessage ?? "Network error");
    }
    return data;
  },
};
