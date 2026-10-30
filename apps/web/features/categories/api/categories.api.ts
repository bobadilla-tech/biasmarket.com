import { apiClient } from "@/lib/api-client";

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
    const data = await apiClient.categories.uploadImage(storeId, categoryId, {
      credentials: "include",
      body: formData,
      fallbackErrorMessage,
    });
    return data;
  },
};
