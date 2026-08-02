import { apiFetch } from "@/lib/api";
import { statsOverviewSchema } from "../schemas/stats-overview.schema";

export const statsApi = {
  async getOverview(storeId: string) {
    const data = await apiFetch(`/stores/${storeId}/stats/overview`);
    return statsOverviewSchema.parse(data);
  },
};
