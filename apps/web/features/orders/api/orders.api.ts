import { apiClient } from "@/lib/api-client";
import type { SellerPaymentInput } from "@biasmarket/validation";
import { limaDayInstant } from "@/lib/lima-date";

function apiUrl() {
  return process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
}

// The API answers a duplicate operation code with a 409 whose body is exactly
// `{ code, orderId }`. `ApiError` carries no body, so the multipart call below
// reads it and throws this typed error for the form's duplicate dialog.
export class DuplicateOperationCodeError extends Error {
  orderId: string;

  constructor(orderId: string) {
    super("duplicate operation code");
    this.name = "DuplicateOperationCodeError";
    this.orderId = orderId;
  }
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
    values: SellerPaymentInput,
    options: { confirmDuplicate?: boolean; fallbackErrorMessage?: string } = {},
  ) {
    const formData = new FormData();
    formData.append("amount", values.amount);
    formData.append("method", values.method);
    if (values.note) formData.append("note", values.note);
    if (values.operationCode.trim()) {
      formData.append("operationCode", values.operationCode.trim());
    }
    // A picked day, sent as noon Lima so it never drifts to the day before.
    formData.append("paidAt", limaDayInstant(values.paidAt));
    if (options.confirmDuplicate) formData.append("confirmDuplicate", "true");
    if (values.file instanceof File) formData.append("file", values.file);

    const res = await fetch(
      `${apiUrl()}/api/stores/${storeId}/orders/${orderId}/payments`,
      {
        method: "POST",
        credentials: "include",
        body: formData,
      },
    );
    const data = await res.json().catch(() => null);
    if (
      res.status === 409 &&
      data?.code === "DUPLICATE_OPERATION_CODE" &&
      typeof data.orderId === "string"
    ) {
      throw new DuplicateOperationCodeError(data.orderId);
    }
    if (!res.ok) {
      throw new Error(
        data?.message ?? options.fallbackErrorMessage ?? "Network error",
      );
    }
    return data;
  },

  voidPayment(
    storeId: string,
    orderId: string,
    paymentId: string,
    reason: string,
    fallbackErrorMessage?: string,
  ) {
    return apiClient.orders.voidPayment(
      storeId,
      orderId,
      paymentId,
      { reason },
      { fallbackErrorMessage },
    );
  },

  paymentImageUrl(storeId: string, orderId: string, paymentId: string) {
    return `${apiUrl()}/api/stores/${storeId}/orders/${orderId}/payments/${paymentId}/image`;
  },

  packedPhotoUrl(storeId: string, orderId: string) {
    return `${apiUrl()}/api/stores/${storeId}/orders/${orderId}/shipping/photo`;
  },

  async updateShipping(
    storeId: string,
    orderId: string,
    data: { trackingNumber: string | null; trackingUrl: string | null },
    fallbackErrorMessage?: string,
  ) {
    return apiClient.orders.updateShipping(storeId, orderId, data, {
      fallbackErrorMessage,
    });
  },

  async uploadPackedPhoto(
    storeId: string,
    orderId: string,
    file: File,
    fallbackErrorMessage?: string,
  ) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(
      `${apiUrl()}/api/stores/${storeId}/orders/${orderId}/shipping/photo`,
      { method: "POST", credentials: "include", body: formData },
    );
    const result = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        result?.message ?? fallbackErrorMessage ?? "Network error",
      );
    }
    return result;
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
