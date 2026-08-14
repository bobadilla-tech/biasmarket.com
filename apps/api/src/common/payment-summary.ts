import { Prisma } from "@biasmarket/db";
import type {
  PaymentReviewStatus,
  PaymentSource,
  PaymentStatus,
} from "@biasmarket/db";

export interface PaymentSummary {
  paidAmount: number;
  pendingAmount: number;
  paidPercentage: number;
}

export interface SummablePayment {
  amount: Prisma.Decimal;
  source: PaymentSource;
  reviewStatus: PaymentReviewStatus;
}

// Single source of truth for "does this row count as paid" — every
// aggregation call site that sums `OrderPayment.amount` (stats revenue,
// customer lifetimeSpend, the featured-stores ranking, this file) must use
// this same predicate, or an unreviewed buyer-submitted proof silently
// inflates a different number in each place. See
// docs/plans/2026-08-08-buyer-proof-of-payment-upload-plan.md's "Critical
// invariant" section.
export function countsTowardPaid(payment: SummablePayment): boolean {
  return (
    payment.source === "SELLER_RECORDED" || payment.reviewStatus === "APPROVED"
  );
}

// The order payment statuses that carry money actually collected and verified
// — VERIFIED (balance settled) and PARTIALLY_PAID (at least one verified/
// seller-recorded payment received, remainder still owed). "Verified Revenue"
// is the sum of `countsTowardPaid` payments across orders in these states:
// a partial payment contributes only its paid amount, never the full order
// total, and an order with no registered payment contributes nothing. Kept
// next to `countsTowardPaid` so every revenue/spend aggregate (stats
// overview + analytics, customer lifetimeSpend, guest spend) applies the same
// rule instead of each hard-coding its own status set.
export const REVENUE_ORDER_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "VERIFIED",
  "PARTIALLY_PAID",
] as const;

export function countsTowardRevenue(paymentStatus: PaymentStatus): boolean {
  return REVENUE_ORDER_PAYMENT_STATUSES.includes(paymentStatus);
}

// Arithmetic stays in Decimal space until the final `.toNumber()` — plain
// `Number` subtraction here previously produced 59.989999999999995 instead
// of 59.99 for a 99.99 order with a 40.00 payment.
export function computePaymentSummary(
  requiredAmount: Prisma.Decimal,
  payments: SummablePayment[],
): PaymentSummary {
  const paid = payments
    .filter(countsTowardPaid)
    .reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
  const pending = Prisma.Decimal.max(requiredAmount.minus(paid), 0);
  const paidPercentage = requiredAmount.greaterThan(0)
    ? Prisma.Decimal.min(paid.dividedBy(requiredAmount).times(100), 100)
    : new Prisma.Decimal(0);

  return {
    paidAmount: paid.toNumber(),
    pendingAmount: pending.toNumber(),
    paidPercentage: paidPercentage.toNumber(),
  };
}

export function withPaymentSummary<
  T extends {
    requiredAmount: Prisma.Decimal;
    payments?: SummablePayment[];
  },
>(order: T): T & PaymentSummary {
  return {
    ...order,
    ...computePaymentSummary(order.requiredAmount, order.payments ?? []),
  };
}
