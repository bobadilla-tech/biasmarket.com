import { expect, test } from "vitest";
import { orderSchema } from "./order.schema";

const baseOrder = {
  id: "o1",
  customerName: "Jane Doe",
  customerPhone: "+51987654321",
  totalAmount: "100.00",
  requiredAmount: "100.00",
  paidAmount: 40,
  pendingAmount: 60,
  paidPercentage: 40,
  currency: "USD",
  paymentStatus: "PARTIALLY_PAID" as const,
  fulfillmentStatus: "ORDERING" as const,
  deliveryMethodType: "PICKUP" as const,
  deliveryDetails: { address: "123 Main St" },
  createdAt: "2026-01-01T00:00:00.000Z",
  items: [
    {
      id: "i1",
      quantity: 2,
      product: { id: "p1", name: "Tee", images: ["https://example.com/a.png"] },
      variant: { id: "v1", name: "Small" },
    },
  ],
  payments: [
    {
      id: "pay1",
      amount: "40.00",
      method: "YAPE",
      note: "First installment",
      imageUrl: "https://example.com/proof.png",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

test("accepts a full order payload", () => {
  const result = orderSchema.safeParse(baseOrder);
  expect(result.success).toBe(true);
});

test("accepts null deliveryDetails and a variant-less item", () => {
  const result = orderSchema.safeParse({
    ...baseOrder,
    deliveryDetails: null,
    items: [{ ...baseOrder.items[0], variant: null }],
  });
  expect(result.success).toBe(true);
});

test("rejects an invalid paymentStatus", () => {
  const result = orderSchema.safeParse({
    ...baseOrder,
    paymentStatus: "UNKNOWN",
  });
  expect(result.success).toBe(false);
});
