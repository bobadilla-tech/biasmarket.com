import { Prisma } from "@biasmarket/db";

export interface PaymentSummary {
  paidAmount: number;
  pendingAmount: number;
  paidPercentage: number;
}

// Arithmetic stays in Decimal space until the final `.toNumber()` — plain
// `Number` subtraction here previously produced 59.989999999999995 instead
// of 59.99 for a 99.99 order with a 40.00 payment.
export function computePaymentSummary(
  requiredAmount: Prisma.Decimal,
  payments: { amount: Prisma.Decimal }[],
): PaymentSummary {
  const paid = payments.reduce(
    (sum, payment) => sum.plus(payment.amount),
    new Prisma.Decimal(0),
  );
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
    payments?: { amount: Prisma.Decimal }[];
  },
>(order: T): T & PaymentSummary {
  return {
    ...order,
    ...computePaymentSummary(order.requiredAmount, order.payments ?? []),
  };
}
