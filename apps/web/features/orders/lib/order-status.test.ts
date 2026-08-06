import { expect, test } from "vitest";
import { getOrderStatus, matchesTab } from "./order-status";
import type { OrderResponseDto } from "@biasmarket/types";

const t = ((key: string) => key) as unknown as Parameters<
  typeof getOrderStatus
>[1];

const baseOrder: OrderResponseDto = {
  id: "o1",
  storeId: "store-1",
  customerId: null,
  customerEmail: null,
  customerName: "Jane",
  customerPhone: "+51987654321",
  totalAmount: "100.00",
  requiredAmount: "100.00",
  paidAmount: 0,
  pendingAmount: 100,
  paidPercentage: 0,
  currency: "USD",
  status: "ACTIVE",
  paymentStatus: "PENDING_PAYMENT",
  paymentRejectionReason: null,
  fulfillmentStatus: "ORDERING",
  deliveryMethodType: "PICKUP",
  deliveryDetails: null,
  pickupPointId: null,
  cancellationResolution: null,
  cancellationReason: null,
  expiresAt: "2026-01-08T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  items: [],
  payments: [],
};

test("getOrderStatus: REJECTED wins over everything else", () => {
  const status = getOrderStatus({
    ...baseOrder,
    paymentStatus: "REJECTED",
    fulfillmentStatus: "COMPLETED",
  }, t);
  expect(status.label).toBe("status.rejected");
});

test("getOrderStatus: not-yet-VERIFIED shows toConfirm regardless of fulfillment", () => {
  const status = getOrderStatus(
    {
      ...baseOrder,
      paymentStatus: "PAYMENT_SUBMITTED",
      fulfillmentStatus: "COMPLETED",
    },
    t,
  );
  expect(status.label).toBe("status.toConfirm");
});

test("getOrderStatus: VERIFIED + ORDERING is pending", () => {
  const status = getOrderStatus({
    ...baseOrder,
    paymentStatus: "VERIFIED",
    fulfillmentStatus: "ORDERING",
  }, t);
  expect(status.label).toBe("status.pending");
});

test("getOrderStatus: VERIFIED + IN_TRANSIT/READY is inTransit", () => {
  const status = getOrderStatus({
    ...baseOrder,
    paymentStatus: "VERIFIED",
    fulfillmentStatus: "READY",
  }, t);
  expect(status.label).toBe("status.inTransit");
});

test("getOrderStatus: VERIFIED + COMPLETED is delivered", () => {
  const status = getOrderStatus({
    ...baseOrder,
    paymentStatus: "VERIFIED",
    fulfillmentStatus: "COMPLETED",
  }, t);
  expect(status.label).toBe("status.delivered");
});

test("matchesTab: 'pending' means needs-attention, not literally payment-pending", () => {
  const verifiedButOrdering: OrderResponseDto = {
    ...baseOrder,
    paymentStatus: "VERIFIED",
    fulfillmentStatus: "ORDERING",
  };
  const notYetVerified: OrderResponseDto = {
    ...baseOrder,
    paymentStatus: "PAYMENT_SUBMITTED",
  };
  const verifiedAndShipping: OrderResponseDto = {
    ...baseOrder,
    paymentStatus: "VERIFIED",
    fulfillmentStatus: "IN_TRANSIT",
  };

  expect(matchesTab(verifiedButOrdering, "pending")).toBe(true);
  expect(matchesTab(notYetVerified, "pending")).toBe(true);
  expect(matchesTab(verifiedAndShipping, "pending")).toBe(false);
});

test("matchesTab: 'transit' requires VERIFIED and IN_TRANSIT or READY", () => {
  expect(
    matchesTab({
      ...baseOrder,
      paymentStatus: "VERIFIED",
      fulfillmentStatus: "IN_TRANSIT",
    }, "transit"),
  ).toBe(
    true,
  );
  expect(
    matchesTab({
      ...baseOrder,
      paymentStatus: "VERIFIED",
      fulfillmentStatus: "READY",
    }, "transit"),
  ).toBe(true);
  expect(
    matchesTab({
      ...baseOrder,
      paymentStatus: "VERIFIED",
      fulfillmentStatus: "ORDERING",
    }, "transit"),
  ).toBe(
    false,
  );
});

test("matchesTab: 'delivered' requires VERIFIED and COMPLETED", () => {
  expect(
    matchesTab({
      ...baseOrder,
      paymentStatus: "VERIFIED",
      fulfillmentStatus: "COMPLETED",
    }, "delivered"),
  ).toBe(true);
  expect(
    matchesTab({
      ...baseOrder,
      paymentStatus: "VERIFIED",
      fulfillmentStatus: "READY",
    }, "delivered"),
  ).toBe(false);
});
