import { apiFetch } from "@/lib/api";
import { suggestionListSchema } from "../schemas/suggestion.schema";

export const suggestionsApi = {
  async list(storeId: string, fallbackErrorMessage?: string) {
    const data = await apiFetch(
      `/stores/${storeId}/suggestions`,
      {},
      fallbackErrorMessage,
    );
    return suggestionListSchema.parse(data);
  },
};
