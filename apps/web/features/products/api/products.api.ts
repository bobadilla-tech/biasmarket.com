import { apiFetch } from "@/lib/api";
import { productSchema, productListSchema } from "../schemas/product.schema";
import { variantSchema, type VariantDraft } from "../schemas/variant.schema";

function apiUrl() {
  return process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
}

async function uploadMultipart(url: string, file: File, fallbackErrorMessage?: string) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(url, { method: "POST", credentials: "include", body: formData });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message ?? fallbackErrorMessage ?? "Network error");
  return data;
}

export const productsApi = {
  async list(storeId: string, fallbackErrorMessage?: string) {
    const data = await apiFetch(`/stores/${storeId}/products`, {}, fallbackErrorMessage);
    return productListSchema.parse(data);
  },

  async get(storeId: string, productId: string, fallbackErrorMessage?: string) {
    const data = await apiFetch(`/stores/${storeId}/products/${productId}`, {}, fallbackErrorMessage);
    return productSchema.parse(data);
  },

  async create(
    storeId: string,
    payload: {
      name: string;
      description?: string;
      price: number;
      currency: string;
      stock?: number;
      variants?: VariantDraft[];
      categoryIds?: string[];
    },
    fallbackErrorMessage?: string,
  ) {
    const data = await apiFetch(
      `/stores/${storeId}/products`,
      { method: "POST", body: JSON.stringify(payload) },
      fallbackErrorMessage,
    );
    return productSchema.parse(data);
  },

  update(
    storeId: string,
    productId: string,
    payload: { name: string; description?: string; price: number; currency: string; categoryIds: string[] },
    fallbackErrorMessage?: string,
  ) {
    return apiFetch(
      `/stores/${storeId}/products/${productId}`,
      { method: "PATCH", body: JSON.stringify(payload) },
      fallbackErrorMessage,
    );
  },

  remove(storeId: string, productId: string, fallbackErrorMessage?: string) {
    return apiFetch(`/stores/${storeId}/products/${productId}`, { method: "DELETE" }, fallbackErrorMessage);
  },

  publish(storeId: string, productId: string, fallbackErrorMessage?: string) {
    return apiFetch(
      `/stores/${storeId}/products/${productId}/publish`,
      { method: "PATCH" },
      fallbackErrorMessage,
    );
  },

  uploadImage(
    storeId: string,
    productId: string,
    file: File,
    options?: { replace?: boolean; fallbackErrorMessage?: string },
  ) {
    const query = options?.replace ? "?replace=1" : "";
    return uploadMultipart(
      `${apiUrl()}/api/stores/${storeId}/products/${productId}/images${query}`,
      file,
      options?.fallbackErrorMessage,
    );
  },

  uploadVariantImage(
    storeId: string,
    productId: string,
    variantId: string,
    file: File,
    fallbackErrorMessage?: string,
  ) {
    return uploadMultipart(
      `${apiUrl()}/api/stores/${storeId}/products/${productId}/variants/${variantId}/images`,
      file,
      fallbackErrorMessage,
    );
  },

  async createVariant(
    storeId: string,
    productId: string,
    payload: Record<string, unknown>,
    fallbackErrorMessage?: string,
  ) {
    const data = await apiFetch(
      `/stores/${storeId}/products/${productId}/variants`,
      { method: "POST", body: JSON.stringify(payload) },
      fallbackErrorMessage,
    );
    return variantSchema.parse(data);
  },

  updateVariant(
    storeId: string,
    productId: string,
    variantId: string,
    payload: Record<string, unknown>,
    fallbackErrorMessage?: string,
  ) {
    return apiFetch(
      `/stores/${storeId}/products/${productId}/variants/${variantId}`,
      { method: "PATCH", body: JSON.stringify(payload) },
      fallbackErrorMessage,
    );
  },

  deleteVariant(storeId: string, productId: string, variantId: string) {
    return apiFetch(`/stores/${storeId}/products/${productId}/variants/${variantId}`, {
      method: "DELETE",
    }).catch(() => undefined);
  },
};
