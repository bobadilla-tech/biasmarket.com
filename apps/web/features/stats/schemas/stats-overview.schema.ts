import { z } from "zod";

export const paymentStatusValues = [
  "PENDING_PAYMENT",
  "PARTIALLY_PAID",
  "PAYMENT_SUBMITTED",
  "VERIFIED",
  "REJECTED",
  "CANCELLED",
] as const;

export const fulfillmentStatusValues = [
  "ORDERING",
  "IN_TRANSIT",
  "READY",
  "COMPLETED",
] as const;

export type PaymentStatusValue = (typeof paymentStatusValues)[number];
export type FulfillmentStatusValue = (typeof fulfillmentStatusValues)[number];

const paymentStatusCountsSchema = z.object({
  PENDING_PAYMENT: z.number(),
  PARTIALLY_PAID: z.number(),
  PAYMENT_SUBMITTED: z.number(),
  VERIFIED: z.number(),
  REJECTED: z.number(),
  CANCELLED: z.number(),
});

const fulfillmentStatusCountsSchema = z.object({
  ORDERING: z.number(),
  IN_TRANSIT: z.number(),
  READY: z.number(),
  COMPLETED: z.number(),
});

const recentOrderSchema = z.object({
  id: z.string(),
  customerName: z.string().nullable(),
  customerPhone: z.string(),
  totalAmount: z.union([z.string(), z.number()]),
  currency: z.string(),
  paymentStatus: z.enum(paymentStatusValues),
  fulfillmentStatus: z.enum(fulfillmentStatusValues),
  createdAt: z.string(),
  paidAmount: z.number(),
  pendingAmount: z.number(),
  paidPercentage: z.number(),
});

export const statsOverviewSchema = z.object({
  revenue: z.number(),
  totalOrders: z.number(),
  paymentStatusCounts: paymentStatusCountsSchema,
  fulfillmentStatusCounts: fulfillmentStatusCountsSchema,
  lowStockCount: z.number(),
  recentOrders: z.array(recentOrderSchema),
});

export type StatsOverview = z.infer<typeof statsOverviewSchema>;
export type RecentOrder = z.infer<typeof recentOrderSchema>;
