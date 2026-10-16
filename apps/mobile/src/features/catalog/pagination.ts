export interface ProductSearchPage {
  products: unknown[];
  page: number;
  limit: number;
  total: number;
}

export function nextProductSearchPage(
  lastPage: Pick<ProductSearchPage, "page" | "limit" | "total">,
): number | undefined {
  return lastPage.page * lastPage.limit < lastPage.total
    ? lastPage.page + 1
    : undefined;
}

export function flattenProductPages<T>(pages: Array<{ products: T[] }>): T[] {
  return pages.flatMap((page) => page.products);
}
