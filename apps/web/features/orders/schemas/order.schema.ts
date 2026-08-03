import { z } from "zod";

export const orderItemRowSchema = z.object({
  id: z.string(),
  quantity: z.number(),
  product: z.object({
    id: z.string(),
    name: z.string(),
    images: z.array(z.string()).optional(),
  }),
  variant: z.object({ id: z.string(), name: z.string() }).nullable(),
});

export const orderPaymentRowSchema = z.object({
  id: z.string(),
  amount: z.string(),
  method: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  createdAt: z.string(),
});

export const orderSchema = z.object({
  id: z.string(),
  customerName: z.string().nullable(),
  customerPhone: z.string(),
  totalAmount: z.string(),
  requiredAmount: z.string(),
  paidAmount: z.number(),
  pendingAmount: z.number(),
  paidPercentage: z.number(),
  currency: z.string(),
  paymentRejectionReason: z.string().nullable().optional(),
  status: z.enum([
    "ACTIVE",
    "CANCELLED",
  ]),
  paymentStatus: z.enum([
    "PENDING_PAYMENT",
    "PARTIALLY_PAID",
    "PAYMENT_SUBMITTED",
    "VERIFIED",
    "REJECTED",
    "CANCELLED",
  ]),
  fulfillmentStatus: z.enum(["ORDERING", "IN_TRANSIT", "READY", "COMPLETED"]),
  deliveryMethodType: z.enum(["PICKUP", "COURIER"]),
  deliveryDetails: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  items: z.array(orderItemRowSchema),
  payments: z.array(orderPaymentRowSchema),
});

export const orderListSchema = z.array(orderSchema);

export type OrderItemRow = z.infer<typeof orderItemRowSchema>;
export type OrderPaymentRow = z.infer<typeof orderPaymentRowSchema>;
export type Order = z.infer<typeof orderSchema>;
