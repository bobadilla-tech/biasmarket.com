import type { ProductDetailResponseDto } from "@biasmarket/types";

export function getPublishedCatalogValue(
  products: ProductDetailResponseDto[],
  currency: string,
): number {
  return products.reduce((total, product) => {
    if (product.status !== "PUBLISHED") return total;
    if (product.currency !== currency) return total;
    return total + Number(product.price);
  }, 0);
}
