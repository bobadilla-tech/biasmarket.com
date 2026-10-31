import { BadRequestException } from "@nestjs/common";

export const STORE_CATALOG_SORTS = [
  "recientes",
  "precio_asc",
  "precio_desc",
  "nombre_asc",
] as const;
export type StoreCatalogSort = (typeof STORE_CATALOG_SORTS)[number];

export interface StoreCatalogQuery {
  page: number;
  limit: number;
  q?: string;
  categories: string[];
  sort: StoreCatalogSort;
}

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;
const MAX_QUERY_LENGTH = 100;
const MAX_CATEGORY_SLUG_LENGTH = 100;
const MAX_CATEGORIES = 20;

export function parseStoreCatalogQuery(
  rawPage: string | undefined,
  rawLimit: string | undefined,
  rawQ: string | string[] | undefined,
  rawCategories: string | string[] | undefined,
  rawSort: string | undefined,
): StoreCatalogQuery {
  const page = rawPage === undefined ? 1 : Number(rawPage);
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new BadRequestException("page inválido");
  }
  const limit = rawLimit === undefined ? DEFAULT_LIMIT : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new BadRequestException("limit inválido");
  }
  if (rawQ !== undefined && typeof rawQ !== "string") {
    throw new BadRequestException("q inválido");
  }
  const q = rawQ?.trim();
  if (q && q.length > MAX_QUERY_LENGTH) {
    throw new BadRequestException("q demasiado largo");
  }
  const categories =
    (Array.isArray(rawCategories) ? rawCategories : rawCategories?.split(","))
      ?.map((slug) => slug.trim())
      .filter(Boolean) ?? [];
  if (
    categories.length > MAX_CATEGORIES ||
    categories.some((slug) => slug.length > MAX_CATEGORY_SLUG_LENGTH)
  ) {
    throw new BadRequestException("categorias inválidas");
  }
  const sort = rawSort ?? "recientes";
  if (!STORE_CATALOG_SORTS.includes(sort as StoreCatalogSort)) {
    throw new BadRequestException("sort inválido");
  }
  return {
    page,
    limit,
    q: q || undefined,
    categories: [...new Set(categories)],
    sort: sort as StoreCatalogSort,
  };
}
