import { expect, test } from "vitest";
import { statsOverviewSchema } from "./stats-overview.schema";

const valid = {
  revenue: 1250.5,
  totalOrders: 12,
  paymentStatusCounts: {
    PENDING_PAYMENT: 2,
    PARTIALLY_PAID: 1,
    PAYMENT_SUBMITTED: 1,
    VERIFIED: 6,
    REJECTED: 1,
    CANCELLED: 1,
  },
  fulfillmentStatusCounts: {
    ORDERING: 2,
    IN_TRANSIT: 1,
    READY: 1,
    COMPLETED: 8,
  },
  lowStockCount: 3,
  recentOrders: [
    {
      id: "order-1",
      customerName: "Ana",
      customerPhone: "+51987654321",
      totalAmount: "100.00",
      currency: "PEN",
      paymentStatus: "VERIFIED",
      fulfillmentStatus: "COMPLETED",
      createdAt: "2026-08-01T12:00:00.000Z",
      paidAmount: 100,
      pendingAmount: 0,
      paidPercentage: 100,
    },
  ],
};

test("parses a full stats overview payload", () => {
  expect(statsOverviewSchema.safeParse(valid).success).toBe(true);
});

test("parses when recentOrders is empty", () => {
  expect(statsOverviewSchema.safeParse({ ...valid, recentOrders: [] }).success)
    .toBe(true);
});

test("rejects a payload missing a paymentStatusCounts bucket", () => {
  const { CANCELLED, ...rest } = valid.paymentStatusCounts;
  void CANCELLED;
  expect(
    statsOverviewSchema.safeParse({ ...valid, paymentStatusCounts: rest })
      .success,
  ).toBe(false);
});

test("rejects an unknown paymentStatus on a recent order", () => {
  const invalid = {
    ...valid,
    recentOrders: [{ ...valid.recentOrders[0], paymentStatus: "UNKNOWN" }],
  };
  expect(statsOverviewSchema.safeParse(invalid).success).toBe(false);
});
