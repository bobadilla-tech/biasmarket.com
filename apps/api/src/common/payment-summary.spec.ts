import { Prisma } from "@biasmarket/db";
import {
  computePaymentSummary,
  countsTowardPaid,
  withPaymentSummary,
} from "./payment-summary.js";

const d = (n: string) => new Prisma.Decimal(n);

// Seller-recorded rows always count; `N_A` is the review status
// seller-recorded rows carry (see schema.prisma's OrderPayment).
const sellerPayment = (amount: string) => ({
  amount: d(amount),
  source: "SELLER_RECORDED" as const,
  reviewStatus: "N_A" as const,
});
const pendingBuyerPayment = (amount: string) => ({
  amount: d(amount),
  source: "BUYER_SUBMITTED" as const,
  reviewStatus: "PENDING_REVIEW" as const,
});
const approvedBuyerPayment = (amount: string) => ({
  amount: d(amount),
  source: "BUYER_SUBMITTED" as const,
  reviewStatus: "APPROVED" as const,
});
const rejectedBuyerPayment = (amount: string) => ({
  amount: d(amount),
  source: "BUYER_SUBMITTED" as const,
  reviewStatus: "REJECTED" as const,
});

describe("countsTowardPaid", () => {
  it("counts SELLER_RECORDED rows regardless of reviewStatus", () => {
    expect(countsTowardPaid(sellerPayment("10"))).toBe(true);
  });

  it("counts BUYER_SUBMITTED rows only once APPROVED", () => {
    expect(countsTowardPaid(pendingBuyerPayment("10"))).toBe(false);
    expect(countsTowardPaid(rejectedBuyerPayment("10"))).toBe(false);
    expect(countsTowardPaid(approvedBuyerPayment("10"))).toBe(true);
  });
});

describe("computePaymentSummary", () => {
  it("computes exact pendingAmount for the 99.99/40.00 float-trap case", () => {
    const summary = computePaymentSummary(d("99.99"), [sellerPayment("40.00")]);
    expect(summary.paidAmount).toBe(40);
    expect(summary.pendingAmount).toBe(59.99);
  });

  it("computes exact zero pending and 100% paid for the 0.1+0.2-style trap", () => {
    const summary = computePaymentSummary(d("100.00"), [
      sellerPayment("33.33"),
      sellerPayment("33.33"),
      sellerPayment("33.34"),
    ]);
    expect(summary.paidAmount).toBe(100);
    expect(summary.pendingAmount).toBe(0);
    expect(summary.paidPercentage).toBe(100);
  });

  it("clamps pendingAmount to 0 and paidPercentage to 100 on overpayment", () => {
    const summary = computePaymentSummary(d("50.00"), [sellerPayment("60.00")]);
    expect(summary.pendingAmount).toBe(0);
    expect(summary.paidPercentage).toBe(100);
  });

  it("returns zero paidPercentage when requiredAmount is 0", () => {
    const summary = computePaymentSummary(d("0.00"), []);
    expect(summary.paidAmount).toBe(0);
    expect(summary.pendingAmount).toBe(0);
    expect(summary.paidPercentage).toBe(0);
  });

  it("treats a missing payments list as no payments", () => {
    const summary = computePaymentSummary(d("25.50"), []);
    expect(summary.paidAmount).toBe(0);
    expect(summary.pendingAmount).toBe(25.5);
    expect(summary.paidPercentage).toBe(0);
  });

  it("does NOT count a PENDING_REVIEW buyer-submitted row toward paidAmount", () => {
    const summary = computePaymentSummary(d("100.00"), [
      pendingBuyerPayment("40.00"),
    ]);
    expect(summary.paidAmount).toBe(0);
    expect(summary.pendingAmount).toBe(100);
    expect(summary.paidPercentage).toBe(0);
  });

  it("does NOT count a REJECTED buyer-submitted row toward paidAmount", () => {
    const summary = computePaymentSummary(d("100.00"), [
      rejectedBuyerPayment("40.00"),
    ]);
    expect(summary.paidAmount).toBe(0);
    expect(summary.pendingAmount).toBe(100);
  });

  it("DOES count an APPROVED buyer-submitted row toward paidAmount", () => {
    const summary = computePaymentSummary(d("100.00"), [
      approvedBuyerPayment("40.00"),
    ]);
    expect(summary.paidAmount).toBe(40);
    expect(summary.pendingAmount).toBe(60);
  });

  it("mixes seller-recorded and approved buyer-submitted rows, excluding pending ones", () => {
    const summary = computePaymentSummary(d("100.00"), [
      sellerPayment("20.00"),
      approvedBuyerPayment("30.00"),
      pendingBuyerPayment("50.00"),
    ]);
    expect(summary.paidAmount).toBe(50);
    expect(summary.pendingAmount).toBe(50);
  });
});

describe("withPaymentSummary", () => {
  it("spreads the summary fields onto the given order without payments", () => {
    const order = { id: "order-1", requiredAmount: d("99.99") };
    expect(withPaymentSummary(order)).toEqual({
      id: "order-1",
      requiredAmount: d("99.99"),
      paidAmount: 0,
      pendingAmount: 99.99,
      paidPercentage: 0,
    });
  });

  it("spreads the summary fields onto the given order with payments", () => {
    const order = {
      id: "order-2",
      requiredAmount: d("99.99"),
      payments: [sellerPayment("40.00")],
    };
    const result = withPaymentSummary(order);
    expect(result.paidAmount).toBe(40);
    expect(result.pendingAmount).toBe(59.99);
  });

  it("excludes a PENDING_REVIEW buyer-submitted payment from the order summary", () => {
    const order = {
      id: "order-3",
      requiredAmount: d("99.99"),
      payments: [pendingBuyerPayment("99.99")],
    };
    const result = withPaymentSummary(order);
    expect(result.paidAmount).toBe(0);
    expect(result.pendingAmount).toBe(99.99);
  });
});
