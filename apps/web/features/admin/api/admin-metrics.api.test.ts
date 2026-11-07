import { afterEach, expect, test, vi } from "vitest";

const statsMock = { getAssistedOrderMetrics: vi.fn() };
vi.mock("@/lib/api-client", () => ({ apiClient: { stats: statsMock } }));

const { adminMetricsApi } = await import("./admin-metrics.api");

afterEach(() => {
  statsMock.getAssistedOrderMetrics.mockReset();
});

test("getAssistedOrderMetrics delegates to the generated Stats.getAssistedOrderMetrics", async () => {
  const mockResponse = {
    summary: { totalAssistedOrders: 10 },
    invitationFunnel: { byMoment: [], totals: {} },
    weeklyStoreBreakdown: [],
  };
  statsMock.getAssistedOrderMetrics.mockResolvedValue(mockResponse);

  const query = { from: "2026-10-01", to: "2026-11-01", storeId: "store-1" };
  const result = await adminMetricsApi.getAssistedOrderMetrics(
    query,
    "Error de red",
  );

  expect(statsMock.getAssistedOrderMetrics).toHaveBeenCalledWith(query, {
    fallbackErrorMessage: "Error de red",
  });
  expect(result).toEqual(mockResponse);
});
