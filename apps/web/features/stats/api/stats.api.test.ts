import { beforeEach, expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock(
  "@/lib/api",
  () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }),
);

const { statsApi } = await import("./stats.api");

beforeEach(() => {
  apiFetch.mockReset();
});

test("getOverview calls the store-scoped overview endpoint and validates the response", async () => {
  apiFetch.mockResolvedValueOnce({
    revenue: 10,
    totalOrders: 1,
    paymentStatusCounts: {
      PENDING_PAYMENT: 0,
      PARTIALLY_PAID: 0,
      PAYMENT_SUBMITTED: 0,
      VERIFIED: 1,
      REJECTED: 0,
      CANCELLED: 0,
    },
    fulfillmentStatusCounts: {
      ORDERING: 0,
      IN_TRANSIT: 0,
      READY: 0,
      COMPLETED: 1,
    },
    lowStockCount: 0,
    recentOrders: [],
  });

  const result = await statsApi.getOverview("store-1");

  expect(apiFetch).toHaveBeenCalledWith("/stores/store-1/stats/overview");
  expect(result.revenue).toBe(10);
});

test("getOverview throws when the response fails schema validation", async () => {
  apiFetch.mockResolvedValueOnce({ revenue: "not-a-number" });

  await expect(statsApi.getOverview("store-1")).rejects.toThrow();
});

test("getAnalytics calls the store-scoped analytics endpoint with the range query param", async () => {
  apiFetch.mockResolvedValueOnce({
    range: "30d",
    buckets: [],
    topProducts: [],
  });

  const result = await statsApi.getAnalytics("store-1", "30d");

  expect(apiFetch).toHaveBeenCalledWith(
    "/stores/store-1/stats/analytics?range=30d",
  );
  expect(result.range).toBe("30d");
});

test("getPaymentMethodsBreakdown calls the payment-methods endpoint with from/to and validates the response", async () => {
  apiFetch.mockResolvedValueOnce({
    from: "2026-08-01T00:00:00.000Z",
    to: "2026-08-16T00:00:00.000Z",
    totalAmount: 100,
    totalCount: 3,
    byMethod: [
      { method: "YAPE", amount: 60, count: 2, percentage: 60 },
      { method: "PLIN", amount: 0, count: 0, percentage: 0 },
      { method: "TRANSFER", amount: 0, count: 0, percentage: 0 },
      { method: "CASH", amount: 40, count: 1, percentage: 40 },
    ],
  });

  const result = await statsApi.getPaymentMethodsBreakdown("store-1", {
    preset: "month",
    from: "2026-08-01T00:00:00.000Z",
    to: "2026-08-16T00:00:00.000Z",
  });

  expect(apiFetch).toHaveBeenCalledWith(
    "/stores/store-1/stats/payment-methods?from=2026-08-01T00%3A00%3A00.000Z&to=2026-08-16T00%3A00%3A00.000Z",
  );
  expect(result.totalAmount).toBe(100);
});

test("getPaymentMethodsBreakdown throws when the response fails schema validation", async () => {
  apiFetch.mockResolvedValueOnce({ totalAmount: "not-a-number" });

  await expect(
    statsApi.getPaymentMethodsBreakdown("store-1", {
      preset: "month",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-16T00:00:00.000Z",
    }),
  ).rejects.toThrow();
});
