import { apiFetch } from "@/lib/api";
import { confirmResultSchema } from "../schemas/confirm-result.schema";

export const accountApi = {
  confirm: async (slug: string, token: string) => {
    const data = await apiFetch(
      `/stores/${slug}/account/confirm?token=${encodeURIComponent(token)}`,
    );
    return confirmResultSchema.parse(data);
  },
};
