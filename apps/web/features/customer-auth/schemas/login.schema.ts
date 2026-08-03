import { z } from "zod";

export const customerLoginSchema = z.object({
  phone: z.string().min(1),
  password: z.string().min(1),
});

export type CustomerLoginInput = z.infer<typeof customerLoginSchema>;
