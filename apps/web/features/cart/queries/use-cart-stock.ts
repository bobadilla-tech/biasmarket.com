"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const cartStockKeys = {
  bySlug: (slug: string) => ["cart", "stock", slug] as const,
};

export type CartStockMaps = {
  variantAvail: Map<string, number>;
  productAvail: Map<string, number>;
};

function computeStockMaps(
  data: Awaited<ReturnType<typeof apiClient.stores.findPublic>>,
): CartStockMaps {
  const variantAvail = new Map<string, number>();
  const productAvail = new Map<string, number>();
  for (const section of data.sections) {
    if (section.type !== "COLLECTION" || !section.collection) continue;
    for (const cp of section.collection.products) {
      const product = cp.product;
      if (product.discontinued) continue;
      const variants = product.variants;
      if (variants.length === 0) {
        productAvail.set(product.id, Infinity);
        continue;
      }
      let sum = 0;
      let unlimited = false;
      for (const variant of variants) {
        const available =
          variant.stock === null ? Infinity : variant.stock - variant.reserved;
        variantAvail.set(variant.id, available);
        if (available === Infinity) unlimited = true;
        else sum += available;
      }
      productAvail.set(product.id, unlimited ? Infinity : sum);
    }
  }
  return { variantAvail, productAvail };
}

export function useCartStock(slug: string) {
  const { data } = useQuery({
    queryKey: cartStockKeys.bySlug(slug),
    queryFn: async () =>
      computeStockMaps(await apiClient.stores.findPublic(slug)),
    // This pulls the entire public-store payload just to derive availability.
    // Stock changes slowly relative to a cart session, so serve it stale for
    // 30s and keep it cached a while after unmount instead of refetching on
    // every cart-page entry.
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  return {
    variantAvail: data?.variantAvail ?? new Map<string, number>(),
    productAvail: data?.productAvail ?? new Map<string, number>(),
  };
}
