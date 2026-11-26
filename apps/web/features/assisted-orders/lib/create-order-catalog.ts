export const ORDER_CATALOG_PAGE_SIZE = 12;

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
}

export function filterOrderCatalog<T extends { id: string; name: string }>(
  products: readonly T[],
  input: {
    query: string;
    collectionId: string | null;
    productCollections: ReadonlyMap<string, ReadonlySet<string>>;
  },
): T[] {
  const query = fold(input.query);
  return products.filter((product) => {
    if (query && !fold(product.name).includes(query)) {
      return false;
    }
    if (!input.collectionId) return true;
    return (
      input.productCollections.get(product.id)?.has(input.collectionId) ?? false
    );
  });
}

export function visibleCatalogPage<T>(
  products: readonly T[],
  visibleCount: number,
): T[] {
  return products.slice(0, visibleCount);
}
