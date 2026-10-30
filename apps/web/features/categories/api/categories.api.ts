import { apiClient } from "@/lib/api-client";

function apiUrl() {
  return process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
}

export const categoriesApi = {
  update: apiClient.categories.update,
  remove: apiClient.categories.remove,
  async uploadImage(
    storeId: string,
    categoryId: string,
    file: File,
    fallbackErrorMessage?: string,
  ) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(
      `${apiUrl()}/api/stores/${storeId}/categories/${categoryId}/image`,
      { method: "POST", credentials: "include", body: formData },
    );
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.message ?? fallbackErrorMessage ?? "Network error");
    }
    return data;
  },
};
