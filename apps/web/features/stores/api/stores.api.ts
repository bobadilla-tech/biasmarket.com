import { apiFetch } from "@/lib/api";
import { storeSchema, storeListSchema } from "../schemas/store.schema";
import { dashboardStoreSchema } from "../schemas/dashboard-store.schema";
import type { CreateStoreFormInput } from "../schemas/create-store.schema";

export const storesApi = {
  async listMine() {
    const data = await apiFetch("/me/stores");
    return storeListSchema.parse(data);
  },
  async getBySlug(slug: string) {
    const data = await apiFetch(`/stores/by-slug/${slug}`);
    return dashboardStoreSchema.parse(data);
  },
  async create(
    payload: CreateStoreFormInput & { themeConfig: Record<string, unknown> },
    fallbackErrorMessage?: string,
  ) {
    const data = await apiFetch(
      "/stores",
      { method: "POST", body: JSON.stringify(payload) },
      fallbackErrorMessage,
    );
    return storeSchema.parse(data);
  },
  async uploadLogo(storeId: string, file: File, fallbackErrorMessage?: string) {
    const formData = new FormData();
    formData.append("file", file);

    const apiUrl = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
    const res = await fetch(`${apiUrl}/api/stores/${storeId}/logo`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    if (!res.ok) {
      throw new Error(fallbackErrorMessage ?? "Network error");
    }
  },
  remove(storeId: string) {
    return apiFetch(`/stores/${storeId}`, { method: "DELETE" });
  },
};
