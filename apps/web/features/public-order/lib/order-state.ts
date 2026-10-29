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

// "Or pay the total" is the second option in the deposit prompt, so it has to
// be the balance left on the order — not `totalAmount`, which a buyer who
// already paid part of it would read as paying that part twice. Cents
// arithmetic so a float artifact cannot display an amount nobody charges.
export function remainingTotalAmount(
  order: Pick<PublicOrderResponseDto, "totalAmount" | "paidAmount">,
): string | number {
  const totalCents = Math.round(Number(order.totalAmount) * 100);
  const paidCents = Math.round(order.paidAmount * 100);
  // Better the raw total than "PEN NaN" on a buyer-facing page.
  if (!Number.isFinite(totalCents) || !Number.isFinite(paidCents)) {
    return order.totalAmount;
  }
  return Math.max(totalCents - paidCents, 0) / 100;
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
