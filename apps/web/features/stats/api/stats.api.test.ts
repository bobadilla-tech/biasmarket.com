import { beforeEach, expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

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
    fulfillmentStatusCounts: { ORDERING: 0, IN_TRANSIT: 0, READY: 0, COMPLETED: 1 },
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
  apiFetch.mockResolvedValueOnce({ range: "30d", buckets: [], topProducts: [] });

  const result = await statsApi.getAnalytics("store-1", "30d");

  expect(apiFetch).toHaveBeenCalledWith("/stores/store-1/stats/analytics?range=30d");
  expect(result.range).toBe("30d");
});
