import { apiClient } from "@/lib/api-client";
import type { CartItem } from "@/lib/cart";
import type { PublicCourierDto, ShippingAddressDto } from "@biasmarket/types";

function apiUrl() {
  return process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
}

export const checkoutApi = {
  async getDeliveryOptions(slug: string) {
    const [methods, pickupPoints, paymentMethods, store, courierRows] =
      await Promise.all([
        apiClient.publicDeliveryConfig.findEnabled(slug),
        apiClient.publicPickupPoints.findEnabled(slug),
        apiClient.publicPaymentConfig.findEnabled(slug),
        apiClient.stores.findPublic(slug),
        fetchPublicCouriers(slug),
      ]);
    return {
      methods,
      points: pickupPoints.points,
      weekday: pickupPoints.weekday,
      paymentMethods,
      storePaymentInstructions: store.paymentInstructions,
      couriers: courierRows,
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
      paymentType?: "FULL" | "PARTIAL";
      customerName?: string;
      customerPhone: string;
      customerEmail?: string;
      shippingAddress?: ShippingAddressDto;
      courierName?: string;
      courierModality?: "AGENCY" | "HOME";
      paymentProof?: File | null;
      items: CartItem[];
    },
    fallbackErrorMessage?: string,
  ) {
    if (!/^[a-z0-9-]+$/i.test(slug)) {
      throw new Error("Invalid store slug");
    }
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
    if (values.paymentType) {
      formData.append("paymentType", values.paymentType);
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
    if (values.courierName) {
      formData.append("courierName", values.courierName);
    }
    if (values.courierModality) {
      formData.append("courierModality", values.courierModality);
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

    // The base URL is fixed env config; only `slug` is user input, and it's
    // validated against /^[a-z0-9-]+$/i above and percent-encoded here, so it
    // cannot alter the origin or traverse the path (SSRF false positive).
    // eslint-disable-next-line security/detect-unsafe-url
    const res = await fetch(
      `${apiUrl()}/api/stores/${encodeURIComponent(slug)}/checkout`,
      {
        method: "POST",
        credentials: "include",
        body: formData,
      },
    );
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

async function fetchPublicCouriers(slug: string): Promise<PublicCourierDto[]> {
  try {
    return await apiClient.publicCouriers.findEnabled(slug);
  } catch {
    return [];
  }
}
