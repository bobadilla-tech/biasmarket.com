import { z } from "zod";

// Scoped to the fields the UI actually uses — findAllForAdmin returns the
// full Store record (Prisma `include`, no `select` on the store itself,
// only `owner` is narrowed server-side).
export const adminStoreSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.string(),
  owner: z.object({ id: z.string(), email: z.string(), name: z.string().nullable() }),
});

export const adminStoreListSchema = z.array(adminStoreSchema);

export type AdminStore = z.infer<typeof adminStoreSchema>;
