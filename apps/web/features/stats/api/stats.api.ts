import { apiFetch } from "@/lib/api";
import { statsOverviewSchema } from "../schemas/stats-overview.schema";
import {
  type AnalyticsRange,
  analyticsResultSchema,
} from "../schemas/analytics.schema";
import { paymentMethodsBreakdownSchema } from "../schemas/payment-methods.schema";
import type { PaymentRange } from "../lib/payment-date-ranges";

export const statsApi = {
  async getOverview(storeId: string) {
    const data = await apiFetch(`/stores/${storeId}/stats/overview`);
    return statsOverviewSchema.parse(data);
  },
  async getAnalytics(storeId: string, range: AnalyticsRange) {
    const data = await apiFetch(
      `/stores/${storeId}/stats/analytics?range=${range}`,
    );
    return analyticsResultSchema.parse(data);
  },
  async getPaymentMethodsBreakdown(storeId: string, range: PaymentRange) {
    const query = new URLSearchParams({ from: range.from, to: range.to });
    const data = await apiFetch(
      `/stores/${storeId}/stats/payment-methods?${query.toString()}`,
    );
    return paymentMethodsBreakdownSchema.parse(data);
  },
};
