import { z } from "zod";

export const editContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
});

export type EditContactInput = z.infer<typeof editContactSchema>;
