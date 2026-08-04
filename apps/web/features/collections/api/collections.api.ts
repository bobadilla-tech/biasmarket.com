import { apiClient } from "@/lib/api-client";
import type { components } from "@biasmarket/types";
import type { Collection, CreateCollectionInput } from "../schemas/collection.schema";

type CollectionResponse = components["schemas"]["CollectionResponseDto"];
type CollectionProductResponse =
  components["schemas"]["CollectionProductResponseDto"];

// Error responses aren't part of the OpenAPI generation pipeline (only 2xx
// paths are typed — see the plan doc's Phase 3 scope note), so `error` here
// is untyped. Same defensive shape apiFetch used: try the backend's
// `message` field, fall back to a caller-supplied message.
function errorMessage(error: unknown, fallback?: string): string {
  if (
    error && typeof error === "object" && "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return fallback ?? "Network error";
}

export const collectionsApi = {
  async list(storeId: string, fallbackErrorMessage?: string): Promise<Collection[]> {
    const { data, error } = await apiClient.GET(
      "/stores/{storeId}/collections",
      { params: { path: { storeId } } },
    );
    if (error) throw new Error(errorMessage(error, fallbackErrorMessage));
    return data;
  },

  async create(
    storeId: string,
    values: CreateCollectionInput,
    fallbackErrorMessage?: string,
  ): Promise<CollectionResponse> {
    const { data, error } = await apiClient.POST(
      "/stores/{storeId}/collections",
      {
        params: { path: { storeId } },
        body: {
          name: values.name,
          description: values.description || undefined,
        },
      },
    );
    if (error) throw new Error(errorMessage(error, fallbackErrorMessage));
    return data;
  },

  async remove(
    storeId: string,
    collectionId: string,
    fallbackErrorMessage?: string,
  ): Promise<CollectionResponse> {
    const { data, error } = await apiClient.DELETE(
      "/stores/{storeId}/collections/{collectionId}",
      { params: { path: { storeId, collectionId } } },
    );
    if (error) throw new Error(errorMessage(error, fallbackErrorMessage));
    return data;
  },

  async addProduct(
    storeId: string,
    collectionId: string,
    productId: string,
    fallbackErrorMessage?: string,
  ): Promise<CollectionProductResponse> {
    const { data, error } = await apiClient.POST(
      "/stores/{storeId}/collections/{collectionId}/products",
      {
        params: { path: { storeId, collectionId } },
        body: { productId },
      },
    );
    if (error) throw new Error(errorMessage(error, fallbackErrorMessage));
    return data;
  },

  async removeProduct(
    storeId: string,
    collectionId: string,
    productId: string,
    fallbackErrorMessage?: string,
  ): Promise<CollectionProductResponse> {
    const { data, error } = await apiClient.DELETE(
      "/stores/{storeId}/collections/{collectionId}/products/{productId}",
      { params: { path: { storeId, collectionId, productId } } },
    );
    if (error) throw new Error(errorMessage(error, fallbackErrorMessage));
    return data;
  },

  async reorderProducts(
    storeId: string,
    collectionId: string,
    productIds: string[],
    fallbackErrorMessage?: string,
  ): Promise<CollectionProductResponse[]> {
    const { data, error } = await apiClient.PATCH(
      "/stores/{storeId}/collections/{collectionId}/products/reorder",
      {
        params: { path: { storeId, collectionId } },
        body: { productIds },
      },
    );
    if (error) throw new Error(errorMessage(error, fallbackErrorMessage));
    return data;
  },
};
