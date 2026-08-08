import { apiClient } from "@/lib/api-client";
import type { RegisterPaymentInput } from "../schemas/register-payment.schema";

function apiUrl() {
  return process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
}

export const ordersApi = {
  list(storeId: string, fallbackErrorMessage?: string) {
    return apiClient.orders.findAll(storeId, undefined, {
      fallbackErrorMessage,
    });
  },

  review(
    storeId: string,
    orderId: string,
    decision: "approve" | "reject",
    reason?: string,
    fallbackErrorMessage?: string,
  ) {
    return apiClient.orders.review(
      storeId,
      orderId,
      { decision, ...(reason && { reason }) },
      { fallbackErrorMessage },
    );
  },

  advance(
    storeId: string,
    orderId: string,
    status: string,
    fallbackErrorMessage?: string,
  ) {
    return apiClient.orders.advance(
      storeId,
      orderId,
      { status: status as "IN_TRANSIT" | "READY" | "COMPLETED" },
      { fallbackErrorMessage },
    );
  },

  async registerPayment(
    storeId: string,
    orderId: string,
    values: RegisterPaymentInput,
    fallbackErrorMessage?: string,
  ) {
    const formData = new FormData();
    formData.append("amount", values.amount);
    formData.append("method", values.method);
    if (values.note) formData.append("note", values.note);
    if (values.file) formData.append("file", values.file);

    const res = await fetch(
      `${apiUrl()}/api/stores/${storeId}/orders/${orderId}/payments`,
      {
        method: "POST",
        credentials: "include",
        body: formData,
      },
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.message ?? fallbackErrorMessage ?? "Network error");
    }
    return data;
  },

  paymentImageUrl(storeId: string, orderId: string, paymentId: string) {
    return `${apiUrl()}/api/stores/${storeId}/orders/${orderId}/payments/${paymentId}/image`;
  },

  cancelOrder(
    storeId: string,
    orderId: string,
    data: {
      resolution: "REFUNDED" | "RETAINED" | "STORE_CREDIT";
      retainMode?: "FULL" | "PARTIAL";
      retainedAmount?: number;
      releasedResolution?: "REFUNDED" | "STORE_CREDIT";
      reason?: string;
    },
    fallbackErrorMessage?: string,
  ) {
    return apiClient.orders.cancel(storeId, orderId, data, {
      fallbackErrorMessage,
    });
  },
};
