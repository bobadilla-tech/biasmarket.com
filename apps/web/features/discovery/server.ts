import type { ProductSearchResultResponseDto } from "@biasmarket/types";
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

export async function getHomeDiscoveryData() {
  const [latestTrend, bestSellers, discoverProducts] = await Promise.all([
    fetchProducts(3, "latest"),
    fetchProducts(3, "bestseller"),
    fetchProducts(12, "latest"),
  ]);

  return { latestTrend, bestSellers, discoverProducts };
}
