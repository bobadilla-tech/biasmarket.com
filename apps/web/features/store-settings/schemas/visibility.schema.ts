import { z } from "zod";

export const visibilityFormSchema = z.object({
  isPublic: z.boolean(),
});

export type VisibilityFormInput = z.infer<typeof visibilityFormSchema>;
