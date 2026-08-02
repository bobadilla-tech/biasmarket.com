import { z } from "zod";
import { accountOrderSchema } from "@/features/account";

export const customerProfileSchema = z.object({
  customer: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string(),
    emailVerified: z.boolean(),
  }),
  orders: z.array(accountOrderSchema),
});

export type CustomerProfile = z.infer<typeof customerProfileSchema>;
