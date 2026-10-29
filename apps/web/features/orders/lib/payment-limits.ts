import type { OrderPaymentResponseDto } from "@biasmarket/types";

type ProofLike = Pick<
  OrderPaymentResponseDto,
  "amount" | "reviewStatus" | "voidedAt" | "source"
>;

// A buyer proof that has not been reviewed yet. It holds part of the balance
// (the API will not let a seller payment settle the order past it).
export function isPendingProof(payment: ProofLike): boolean {
  return (
    payment.source === "BUYER_SUBMITTED" &&
    payment.reviewStatus === "PENDING_REVIEW" &&
    !payment.voidedAt
  );
}

export function reservedPendingCents(payments: ProofLike[]): number {
  return payments
    .filter(isPendingProof)
    .reduce(
      (sum, payment) => sum + Math.round(Number(payment.amount) * 100),
      0,
    );
}

// What the seller can still record, in cents (never negative).
export function recordableCents(
  pendingAmount: number,
  payments: ProofLike[],
): number {
  return Math.max(
    Math.round(pendingAmount * 100) - reservedPendingCents(payments),
    0,
  );
}

// Mirrors the API (`VoidOrderPaymentUseCase`): only while fulfillment is
// ORDERING, never on CANCELLED/REJECTED/VERIFIED orders, and only for a
// payment that counts toward paid. Known limitation: a payment that settled
// the order (VERIFIED) cannot be voided from here.
export function canVoidPayment(
  order: { paymentStatus: string; fulfillmentStatus: string },
  payment: Pick<
    OrderPaymentResponseDto,
    "source" | "reviewStatus" | "voidedAt"
  >,
): boolean {
  if (order.fulfillmentStatus !== "ORDERING") return false;
  if (
    order.paymentStatus === "CANCELLED" ||
    order.paymentStatus === "REJECTED" ||
    order.paymentStatus === "VERIFIED"
  ) {
    return false;
  }
  if (payment.voidedAt) return false;
  return (
    payment.source === "SELLER_RECORDED" || payment.reviewStatus === "APPROVED"
  );
}
