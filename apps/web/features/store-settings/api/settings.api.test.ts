import { afterEach, expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { settingsApi } = await import("./settings.api");

afterEach(() => {
  apiFetch.mockReset();
});

test("saveDeliverySettings creates new points, updates existing ones, and deletes removed ones", async () => {
  apiFetch.mockResolvedValue({});

  await settingsApi.saveDeliverySettings("store-1", {
    pickupEnabled: true,
    courierEnabled: false,
    courierCost: 15,
    points: [
      { id: "new:123", label: "New spot", enabled: true, sortOrder: 1 },
      { id: "existing-1", label: "Existing spot", enabled: false, sortOrder: 0 },
    ],
    deletedPointIds: ["deleted-1"],
  });

  const calledUrls = apiFetch.mock.calls.map((call) => call[0]);
  expect(calledUrls).toContain("/stores/store-1/delivery-methods");
  expect(calledUrls).toContain("/stores/store-1/pickup-points");
  expect(calledUrls).toContain("/stores/store-1/pickup-points/existing-1");
  expect(calledUrls).toContain("/stores/store-1/pickup-points/deleted-1");

  const deleteCall = apiFetch.mock.calls.find(
    (call) => call[0] === "/stores/store-1/pickup-points/deleted-1",
  );
  expect(deleteCall?.[1]).toEqual({ method: "DELETE" });
});

test("getDeliverySettings validates both methods and points", async () => {
  apiFetch
    .mockResolvedValueOnce([{ type: "PICKUP", enabled: true, details: {} }])
    .mockResolvedValueOnce([{ id: "p1", label: "Main", enabled: true, sortOrder: 0 }]);

  const result = await settingsApi.getDeliverySettings("store-1");

  expect(result.methods).toHaveLength(1);
  expect(result.points).toHaveLength(1);
});

test("savePaymentMethods POSTs all four methods with their enabled state", async () => {
  apiFetch.mockResolvedValue({});

  await settingsApi.savePaymentMethods("store-1", { YAPE: false, CASH: true });

  expect(apiFetch).toHaveBeenCalledTimes(4);
  const yapeCall = apiFetch.mock.calls.find((call) =>
    (call[1]?.body as string)?.includes("YAPE"),
  );
  expect(JSON.parse(yapeCall![1].body as string)).toEqual({ method: "YAPE", enabled: false });
});
