import { apiFetch } from "@/lib/api";
import { collectionListSchema, type CreateCollectionInput } from "../schemas/collection.schema";

export const collectionsApi = {
  async list(storeId: string, fallbackErrorMessage?: string) {
    const data = await apiFetch(`/stores/${storeId}/collections`, {}, fallbackErrorMessage);
    return collectionListSchema.parse(data);
  },

  create(storeId: string, values: CreateCollectionInput, fallbackErrorMessage?: string) {
    return apiFetch(
      `/stores/${storeId}/collections`,
      {
        method: "POST",
        body: JSON.stringify({ name: values.name, description: values.description || undefined }),
      },
      fallbackErrorMessage,
    );
  },

  remove(storeId: string, collectionId: string, fallbackErrorMessage?: string) {
    return apiFetch(
      `/stores/${storeId}/collections/${collectionId}`,
      { method: "DELETE" },
      fallbackErrorMessage,
    );
  },

  addProduct(storeId: string, collectionId: string, productId: string, fallbackErrorMessage?: string) {
    return apiFetch(
      `/stores/${storeId}/collections/${collectionId}/products`,
      { method: "POST", body: JSON.stringify({ productId }) },
      fallbackErrorMessage,
    );
  },

  removeProduct(
    storeId: string,
    collectionId: string,
    productId: string,
    fallbackErrorMessage?: string,
  ) {
    return apiFetch(
      `/stores/${storeId}/collections/${collectionId}/products/${productId}`,
      { method: "DELETE" },
      fallbackErrorMessage,
    );
  },

  reorderProducts(
    storeId: string,
    collectionId: string,
    productIds: string[],
    fallbackErrorMessage?: string,
  ) {
    return apiFetch(
      `/stores/${storeId}/collections/${collectionId}/products/reorder`,
      { method: "PATCH", body: JSON.stringify({ productIds }) },
      fallbackErrorMessage,
    );
  },
};
