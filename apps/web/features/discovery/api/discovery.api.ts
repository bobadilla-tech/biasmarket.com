import { apiFetch } from "@/lib/api";
import { apiClient } from "@/lib/api-client";
import { productSearchResultSchema } from "../schemas/product-search.schema";

function buildQuery(params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

export const discoveryApi = {
  getFeaturedStores(limit?: number) {
    return apiClient.stores.findFeatured({
      limit: limit === undefined ? undefined : String(limit),
    });
  },
  getStoreDirectory(params: { q?: string; page?: number } = {}) {
    return apiClient.stores.findDirectory({
      q: params.q,
      page: params.page === undefined ? undefined : String(params.page),
    });
  },
  // ProductSearch tag — not migrated yet (Batch 6, see
  // docs/plans/2026-08-05-orval-rollout-batches-3-6-plan.md).
  async searchProducts(params: { q?: string; page?: number } = {}) {
    const data = await apiFetch(`/products/search${buildQuery(params)}`);
    return productSearchResultSchema.parse(data);
  },
};
