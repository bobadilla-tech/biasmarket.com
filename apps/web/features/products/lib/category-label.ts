import type { ProductDetailResponseDto } from "@biasmarket/types";

export function getCategoryLabel(product: ProductDetailResponseDto) {
  const names = (product.categories ?? []).map((row) => row.category.name)
    .filter(Boolean);
  if (names.length === 0) return "—";
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}
