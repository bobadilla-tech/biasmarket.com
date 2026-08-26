import type {
  FeaturedStoreResponseDto,
  ProductSearchResultResponseDto,
} from "@biasmarket/types";
import { apiClient } from "@/lib/api-client";
import { reportServerError } from "@/lib/report-server-error";

async function fetchProducts(
  limit: number,
  sort: "latest" | "bestseller",
): Promise<ProductSearchResultResponseDto | null> {
  try {
    return await apiClient.productSearch.search({
      limit: String(limit),
      sort,
    });
  } catch (error) {
    // The landing page must render even when the API is down — the sections
    // surface their own error/empty states client-side.
    await reportServerError(error, { fn: "fetchProducts", limit, sort });
    return null;
  }
}

/** Minimal store shape the landing "Descubre tiendas" section renders. */
export type LandingStore = Pick<
  FeaturedStoreResponseDto,
  "id" | "name" | "slug" | "logoUrl"
>;

async function fetchFeaturedStores(
  limit: number,
): Promise<LandingStore[] | null> {
  try {
    const featured = await apiClient.stores.findFeatured({
      limit: String(limit),
    });

    // Featured ranks stores by recent verified orders, so newly created
    // stores sit below its floor and would never show up. Fill the
    // remaining slots from the public directory (dedup by id).
    if (featured.length < limit) {
      const directory = await apiClient.stores.findDirectory({
        page: String(1),
        limit: String(limit),
      });
      const seen = new Set(featured.map((store) => store.id));
      return [
        ...featured,
        ...directory.stores.filter((store) => !seen.has(store.id)),
      ].slice(0, limit);
    }

    return featured;
  } catch (error) {
    await reportServerError(error, { fn: "fetchFeaturedStores", limit });
    return null;
  }
}

export async function getHomeDiscoveryData() {
  const [latestTrend, bestSellers, discoverProducts, featuredStores] =
    await Promise.all([
      fetchProducts(3, "latest"),
      fetchProducts(3, "bestseller"),
      fetchProducts(12, "latest"),
      fetchFeaturedStores(4),
    ]);

  return { latestTrend, bestSellers, discoverProducts, featuredStores };
}
