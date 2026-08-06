import type { OrderResponseDto, StatsOverviewResponseDto } from "@biasmarket/types";

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

// `recentOrders` reuses `Order`'s own `OrderResponseDto` — see
// stats-response.dto.ts's comment on the apps/api side (same
// withPaymentSummary-over-{items,payments} shape `Customers` reuses too).
export type RecentOrder = OrderResponseDto;
export type StatsOverview = StatsOverviewResponseDto;
