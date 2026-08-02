import { apiFetch } from "@/lib/api";
import { storeListingListSchema, storeDirectoryResultSchema } from "../schemas/store-listing.schema";
import { productSearchResultSchema } from "../schemas/product-search.schema";

function buildQuery(params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") searchParams.set(key, String(value));
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

export const discoveryApi = {
  async getFeaturedStores(limit?: number) {
    const data = await apiFetch(`/stores/featured${buildQuery({ limit })}`);
    return storeListingListSchema.parse(data);
  },
  async getStoreDirectory(params: { q?: string; page?: number } = {}) {
    const data = await apiFetch(`/stores/directory${buildQuery(params)}`);
    return storeDirectoryResultSchema.parse(data);
  },
  async searchProducts(params: { q?: string; page?: number } = {}) {
    const data = await apiFetch(`/products/search${buildQuery(params)}`);
    return productSearchResultSchema.parse(data);
  },
};
