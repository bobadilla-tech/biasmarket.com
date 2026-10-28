import type { PublicOrderResponseDto } from "@biasmarket/types";

export type BannerKey =
  | "cancelled"
  | "rejected"
  | "pendingPayment"
  | "partiallyPaid"
  | "paymentSubmitted"
  | "verified"
  | "ready"
  | "completed";

type OrderState = Pick<
  PublicOrderResponseDto,
  "status" | "paymentStatus" | "fulfillmentStatus" | "pendingAmount"
>;

// `status` or `paymentStatus` CANCELLED (the latter also covers expired).
export function isCancelled(order: OrderState): boolean {
  return order.status === "CANCELLED" || order.paymentStatus === "CANCELLED";
}

export function getBannerKey(order: OrderState): BannerKey {
  if (isCancelled(order)) return "cancelled";
  if (order.fulfillmentStatus === "COMPLETED") return "completed";
  if (order.fulfillmentStatus === "READY") return "ready";
  switch (order.paymentStatus) {
    case "REJECTED":
      return "rejected";
    case "PARTIALLY_PAID":
      return "partiallyPaid";
    case "PAYMENT_SUBMITTED":
      return "paymentSubmitted";
    case "VERIFIED":
      return "verified";
    default:
      return "pendingPayment";
  }
}

// The how-to-pay block only for orders that still owe the buyer money. The API
// only nulls the methods for cancelled orders, so without this a paid order
// would read as "pay again".
export function shouldShowHowToPay(order: OrderState): boolean {
  if (order.status !== "ACTIVE" || order.paymentStatus === "CANCELLED") {
    return false;
  }
  if (
    order.paymentStatus === "PENDING_PAYMENT" ||
    order.paymentStatus === "REJECTED"
  ) {
    return true;
  }
  return order.paymentStatus === "PARTIALLY_PAID" && order.pendingAmount > 0;
}
