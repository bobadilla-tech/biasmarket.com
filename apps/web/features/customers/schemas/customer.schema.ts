import { z } from "zod";
import { orderSchema } from "@/features/orders";

export const customerListItemSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  phone: z.string(),
  email: z.string().nullable(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
  orderCount: z.number(),
  lifetimeSpend: z.number(),
  lastOrderAt: z.string().nullable(),
});

export const customerListSchema = z.array(customerListItemSchema);

export const customerDetailSchema = z.object({
  customer: z.object({
    id: z.string(),
    name: z.string().nullable(),
    phone: z.string(),
    email: z.string().nullable(),
    emailVerified: z.boolean(),
    createdAt: z.string(),
  }),
  orders: z.array(orderSchema),
});

export type CustomerListItem = z.infer<typeof customerListItemSchema>;
export type CustomerDetail = z.infer<typeof customerDetailSchema>;
