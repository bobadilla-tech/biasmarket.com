import { apiClient } from "@/lib/api-client";
import { dashboardStoreSchema } from "../schemas/dashboard-store.schema";
import type { CreateStoreFormInput } from "../schemas/create-store.schema";

export const storesApi = {
  listMine() {
    return apiClient.myStores.findMine();
  },
  async getBySlug(slug: string) {
    const data = await apiClient.stores.findBySlug(slug);
    return dashboardStoreSchema.parse(data);
  },
  create(
    payload: CreateStoreFormInput & { themeConfig: Record<string, unknown> },
    fallbackErrorMessage?: string,
  ) {
    return apiClient.stores.create(payload, { fallbackErrorMessage });
  },
  // Multipart upload — stays on plain fetch + FormData, not the generated
  // client (same carve-out as products' image uploads; Orval does generate
  // a `stores.uploadLogo` function from the spec, it's just unused here).
  async uploadLogo(storeId: string, file: File, fallbackErrorMessage?: string) {
    const formData = new FormData();
    formData.append("file", file);

    const apiUrl = process.env.INTERNAL_API_URL ??
      process.env.NEXT_PUBLIC_API_URL;
    const res = await fetch(`${apiUrl}/api/stores/${storeId}/logo`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.message ?? fallbackErrorMessage ?? "Network error");
    }
    return data as { id: string; slug: string; logoUrl: string | null };
  },
  remove(storeId: string) {
    return apiClient.stores.remove(storeId);
  },
};
