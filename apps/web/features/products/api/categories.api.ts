import { apiFetch } from "@/lib/api";
import { categoryListSchema, categorySchema } from "../schemas/category.schema";

export const categoriesApi = {
  async list(storeId: string, fallbackErrorMessage?: string) {
    const data = await apiFetch(
      `/stores/${storeId}/categories`,
      {},
      fallbackErrorMessage,
    );
    return categoryListSchema.parse(data);
  },

  async create(storeId: string, name: string, fallbackErrorMessage?: string) {
    const data = await apiFetch(
      `/stores/${storeId}/categories`,
      { method: "POST", body: JSON.stringify({ name }) },
      fallbackErrorMessage,
    );
    return categorySchema.parse(data);
  },
};
