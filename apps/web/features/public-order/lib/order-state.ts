import type { PublicOrderResponseDto } from "@biasmarket/types";

export type BannerKey =
  | "cancelled"
  | "expired"
  | "rejected"
  | "pendingPayment"
  | "partiallyPaid"
  | "paymentSubmitted"
  | "verified"
  | "inTransit"
  | "ready"
  | "completed";

type OrderState = Pick<
  PublicOrderResponseDto,
  | "status"
  | "paymentStatus"
  | "fulfillmentStatus"
  | "pendingAmount"
  | "payments"
  | "closure"
>;

// Mirrors the server's cap (`MAX_PENDING_BUYER_PROOFS`).
export const MAX_PENDING_PROOFS = 5;

// `status` or `paymentStatus` CANCELLED (the latter also covers expired).
export function isCancelled(
  order: Pick<OrderState, "status" | "paymentStatus">,
): boolean {
  return order.status === "CANCELLED" || order.paymentStatus === "CANCELLED";
}

type PaymentsState = Pick<OrderState, "payments">;

function pendingProofs(order: PaymentsState) {
  return order.payments.filter(
    (payment) => payment.reviewStatus === "PENDING_REVIEW" && !payment.voidedAt,
  );
}

// A proof the store has not reviewed yet. The API never moves `paymentStatus`
// to PAYMENT_SUBMITTED on an upload, so "in review" has to come from here.
export function hasPendingProof(
  order: PaymentsState & Pick<OrderState, "status" | "paymentStatus">,
): boolean {
  return !isCancelled(order) && pendingProofs(order).length > 0;
}

// A pending proof on an order that will never be reviewed (cancelled or
// rejected): the label must not promise a review.
export function isClosedOrder(
  order: Pick<OrderState, "status" | "paymentStatus">,
): boolean {
  return isCancelled(order) || order.paymentStatus === "REJECTED";
}

// Sum of pending proofs, in cents (money never goes through float math).
export function reservedPendingAmount(order: PaymentsState): number {
  return pendingProofs(order).reduce(
    (sum, payment) => sum + Math.round(Number(payment.amount) * 100),
    0,
  );
}

// What the buyer can still send, in cents: the balance minus proofs waiting
// for review.
export function submittableCents(
  order: PaymentsState & Pick<OrderState, "pendingAmount">,
): number {
  return Math.max(
    Math.round(order.pendingAmount * 100) - reservedPendingAmount(order),
    0,
  );
}

export function getBannerKey(order: OrderState): BannerKey {
  if (isCancelled(order)) {
    return order.closure?.kind === "EXPIRED" ? "expired" : "cancelled";
  }
  if (order.fulfillmentStatus === "COMPLETED") return "completed";
  if (order.fulfillmentStatus === "READY") return "ready";
  if (order.fulfillmentStatus === "IN_TRANSIT") return "inTransit";
  switch (order.paymentStatus) {
    case "REJECTED":
      return "rejected";
    case "PARTIALLY_PAID":
      return hasPendingProof(order) ? "paymentSubmitted" : "partiallyPaid";
    case "PAYMENT_SUBMITTED":
      return "paymentSubmitted";
    case "VERIFIED":
      return "verified";
    default:
      return hasPendingProof(order) ? "paymentSubmitted" : "pendingPayment";
  }
}

// Whether the upload form is offered. Keep the fulfillment rule in sync with
// the server (`assertAcceptsProofs`): it rejects IN_TRANSIT, READY and
// COMPLETED, so ORDERING is the exact complement.
export function canSubmitProof(
  order: OrderState & Pick<PublicOrderResponseDto, "expiresAt">,
  now: Date = new Date(),
): boolean {
  if (order.status !== "ACTIVE" || order.fulfillmentStatus !== "ORDERING") {
    return false;
  }
  if (
    order.paymentStatus !== "PENDING_PAYMENT" &&
    order.paymentStatus !== "PARTIALLY_PAID" &&
    order.paymentStatus !== "PAYMENT_SUBMITTED" &&
    order.paymentStatus !== "VERIFIED"
  ) {
    return false;
  }
  if (order.expiresAt && new Date(order.expiresAt).getTime() < now.getTime()) {
    return false;
  }
  if (pendingProofs(order).length >= MAX_PENDING_PROOFS) return false;
  return submittableCents(order) > 0;
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
