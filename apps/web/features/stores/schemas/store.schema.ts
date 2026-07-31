import { z } from "zod";

export const storeSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  logoUrl: z.string().nullable(),
});

export const storeListSchema = z.array(storeSchema);

export type Store = z.infer<typeof storeSchema>;
