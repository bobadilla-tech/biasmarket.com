import { z } from "zod";
import { accountOrderSchema } from "@/features/account";

export const customerProfileSchema = z.object({
  customer: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string(),
    emailVerified: z.boolean(),
    pendingEmail: z.string().nullable(),
    pendingPhone: z.string().nullable(),
  }),
  orders: z.array(accountOrderSchema),
});

export type CustomerProfile = z.infer<typeof customerProfileSchema>;

export const updateCustomerProfileResultSchema = z.object({
  name: z.string().nullable(),
  pendingEmail: z.string().nullable(),
  pendingPhone: z.string().nullable(),
});

export type UpdateCustomerProfileResult = z.infer<
  typeof updateCustomerProfileResultSchema
>;
