import { apiFetch } from "@/lib/api";
import { paymentMethodsBreakdownSchema } from "../schemas/payment-methods.schema";
import type { PaymentRange } from "../lib/payment-date-ranges";

export const statsApi = {
  async getPaymentMethodsBreakdown(storeId: string, range: PaymentRange) {
    const query = new URLSearchParams({ from: range.from, to: range.to });
    const data = await apiFetch(
      `/stores/${storeId}/stats/payment-methods?${query.toString()}`,
    );
    return paymentMethodsBreakdownSchema.parse(data);
  },
};
