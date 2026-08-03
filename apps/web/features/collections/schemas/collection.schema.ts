import { z } from "zod";

// Scoped to the fields the UI actually uses — the API's findAllForStore
// includes the full Product record under `product` (Prisma `include`, no
// `select`), not just `{ id, name }`. zod strips unknown keys by default.
export const collectionProductSchema = z.object({
  productId: z.string(),
  position: z.number(),
  product: z.object({ id: z.string(), name: z.string() }),
});

export const collectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  products: z.array(collectionProductSchema),
});

export const collectionListSchema = z.array(collectionSchema);

export type CollectionProduct = z.infer<typeof collectionProductSchema>;
export type Collection = z.infer<typeof collectionSchema>;

export const createCollectionSchema = z.object({
  name: z.string().min(1, "name required"),
  description: z.string(),
});

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
