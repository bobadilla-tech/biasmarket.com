import { Prisma } from "@biasmarket/db";
import { computePaymentSummary, withPaymentSummary } from "./payment-summary.js";

const d = (n: string) => new Prisma.Decimal(n);

describe("computePaymentSummary", () => {
  it("computes exact pendingAmount for the 99.99/40.00 float-trap case", () => {
    const summary = computePaymentSummary(d("99.99"), [{ amount: d("40.00") }]);
    expect(summary.paidAmount).toBe(40);
    expect(summary.pendingAmount).toBe(59.99);
  });

  it("computes exact zero pending and 100% paid for the 0.1+0.2-style trap", () => {
    const summary = computePaymentSummary(d("100.00"), [
      { amount: d("33.33") },
      { amount: d("33.33") },
      { amount: d("33.34") },
    ]);
    expect(summary.paidAmount).toBe(100);
    expect(summary.pendingAmount).toBe(0);
    expect(summary.paidPercentage).toBe(100);
  });

  it("clamps pendingAmount to 0 and paidPercentage to 100 on overpayment", () => {
    const summary = computePaymentSummary(d("50.00"), [{ amount: d("60.00") }]);
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
      payments: [{ amount: d("40.00") }],
    };
    const result = withPaymentSummary(order);
    expect(result.paidAmount).toBe(40);
    expect(result.pendingAmount).toBe(59.99);
  });
});
