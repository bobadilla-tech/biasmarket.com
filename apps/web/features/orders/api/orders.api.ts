import { apiFetch } from "@/lib/api";
import { orderListSchema } from "../schemas/order.schema";
import type { RegisterPaymentInput } from "../schemas/register-payment.schema";

function apiUrl() {
  return process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
}

export const ordersApi = {
  async list(storeId: string, fallbackErrorMessage?: string) {
    const data = await apiFetch(`/stores/${storeId}/orders`, {}, fallbackErrorMessage);
    return orderListSchema.parse(data);
  },

  review(storeId: string, orderId: string, decision: "approve" | "reject", fallbackErrorMessage?: string) {
    return apiFetch(
      `/stores/${storeId}/orders/${orderId}/review`,
      { method: "PATCH", body: JSON.stringify({ decision }) },
      fallbackErrorMessage,
    );
  },

  advance(storeId: string, orderId: string, status: string, fallbackErrorMessage?: string) {
    return apiFetch(
      `/stores/${storeId}/orders/${orderId}/fulfillment`,
      { method: "PATCH", body: JSON.stringify({ status }) },
      fallbackErrorMessage,
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

    const res = await fetch(`${apiUrl()}/api/stores/${storeId}/orders/${orderId}/payments`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message ?? fallbackErrorMessage ?? "Network error");
    return data;
  },
};
