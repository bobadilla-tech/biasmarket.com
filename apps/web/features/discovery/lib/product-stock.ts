export interface StockVariant {
  stock: number | null;
  reserved: number;
}

export interface StockProduct {
  soldOut: boolean;
  variants: StockVariant[];
}

/**
 * Product-level "effectively out of stock" signal, shared between the
 * storefront grid's sort order and JSON-LD availability. Doesn't account for
 * a currently-selected variant — that's client-only state ProductCard adds
 * on top of this.
 */
export function isProductOutOfStock(product: StockProduct): boolean {
  if (product.soldOut) return true;
  if (product.variants.length === 0) return false;
  return product.variants.every((v) => {
    const available = v.stock === null ? Infinity : v.stock - v.reserved;
    return available <= 0;
  });
}
