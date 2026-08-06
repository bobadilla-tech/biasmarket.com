import { z } from "zod";

export const createCollectionSchema = z.object({
  name: z.string().min(1, "name required"),
  description: z.string(),
});

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
