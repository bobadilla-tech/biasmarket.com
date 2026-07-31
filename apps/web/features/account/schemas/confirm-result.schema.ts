import { z } from "zod";

export const accountOrderSchema = z.object({
  id: z.string(),
  paymentStatus: z.enum([
    "PENDING_PAYMENT",
    "PARTIALLY_PAID",
    "PAYMENT_SUBMITTED",
    "VERIFIED",
    "REJECTED",
    "CANCELLED",
  ]),
  fulfillmentStatus: z.enum([
    "ORDERING",
    "IN_TRANSIT",
    "READY",
    "COMPLETED",
  ]),
  totalAmount: z.string(),
  currency: z.string(),
  createdAt: z.string(),
});

export const confirmResultSchema = z.object({
  customer: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string(),
  }),
  orders: z.array(accountOrderSchema),
});

export type AccountOrder = z.infer<typeof accountOrderSchema>;
export type ConfirmResult = z.infer<typeof confirmResultSchema>;
