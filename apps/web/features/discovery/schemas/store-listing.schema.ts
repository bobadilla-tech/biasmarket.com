import { z } from "zod";

export const storeListingSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  logoUrl: z.string().nullable(),
});

export const storeListingListSchema = z.array(storeListingSchema);

export const storeDirectoryResultSchema = z.object({
  stores: storeListingListSchema,
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export type StoreListing = z.infer<typeof storeListingSchema>;
export type StoreDirectoryResult = z.infer<typeof storeDirectoryResultSchema>;
