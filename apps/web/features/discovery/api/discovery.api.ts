import { apiClient } from "@/lib/api-client";

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
  searchProducts(params: { q?: string; page?: number; limit?: number } = {}) {
    return apiClient.productSearch.search({
      q: params.q,
      page: params.page === undefined ? undefined : String(params.page),
      limit: params.limit === undefined ? undefined : String(params.limit),
    });
  },
};
