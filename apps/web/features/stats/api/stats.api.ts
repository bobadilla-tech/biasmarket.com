import { apiFetch } from "@/lib/api";
import { statsOverviewSchema } from "../schemas/stats-overview.schema";
import {
  type AnalyticsRange,
  analyticsResultSchema,
} from "../schemas/analytics.schema";

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
};
