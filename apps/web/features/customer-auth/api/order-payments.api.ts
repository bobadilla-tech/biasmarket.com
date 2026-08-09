import type { RegisterPaymentInput } from "@/features/orders";

// Same multipart carve-out as `features/orders/api/orders.api.ts`'s
// `registerPayment` — see apps/web/AGENTS.md's OpenAPI note. Buyer-side
// counterpart, gated by the customer session cookie instead of the seller's
// better-auth one; both cookies are `credentials: "include"`-sent the same
// way, so this mirrors that file's fetch shape exactly.
function apiUrl() {
  return process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
}

export const orderPaymentsApi = {
  async submitProof(
    slug: string,
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
      `${apiUrl()}/api/stores/${slug}/account/orders/${orderId}/payments`,
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

  paymentImageUrl(slug: string, orderId: string, paymentId: string) {
    return `${apiUrl()}/api/stores/${slug}/account/orders/${orderId}/payments/${paymentId}/image`;
  },
};
