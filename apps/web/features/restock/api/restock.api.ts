import { apiFetch } from "@/lib/api";
import {
  restockRequestListSchema,
  restockRequestResultSchema,
  type RestockRequestPayload,
} from "../schemas/restock-request.schema";

export const restockApi = {
  async request(
    slug: string,
    payload: RestockRequestPayload,
    fallbackErrorMessage?: string,
  ) {
    const data = await apiFetch(
      `/stores/${slug}/restock-requests`,
      { method: "POST", body: JSON.stringify(payload) },
      fallbackErrorMessage,
    );
    return restockRequestResultSchema.parse(data);
  },

  async list(storeId: string, fallbackErrorMessage?: string) {
    const data = await apiFetch(
      `/stores/${storeId}/restock-requests`,
      {},
      fallbackErrorMessage,
    );
    return restockRequestListSchema.parse(data);
  },
};
