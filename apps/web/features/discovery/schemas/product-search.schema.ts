import { z } from "zod";

export const searchProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.union([z.string(), z.number()]),
  currency: z.string(),
  images: z.array(z.string()),
  store: z.object({ name: z.string(), slug: z.string() }),
});

export const productSearchResultSchema = z.object({
  products: z.array(searchProductSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export type SearchProduct = z.infer<typeof searchProductSchema>;
export type ProductSearchResult = z.infer<typeof productSearchResultSchema>;
