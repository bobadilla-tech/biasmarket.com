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
