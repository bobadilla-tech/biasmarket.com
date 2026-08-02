import { afterEach, expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { ordersApi } = await import("./orders.api");

afterEach(() => {
  apiFetch.mockReset();
});

test("review PATCHes the review endpoint with the decision", async () => {
  apiFetch.mockResolvedValue({});

  await ordersApi.review("store-1", "o1", "approve");

  expect(apiFetch).toHaveBeenCalledWith(
    "/stores/store-1/orders/o1/review",
    { method: "PATCH", body: JSON.stringify({ decision: "approve" }) },
    undefined,
  );
});

test("advance PATCHes the fulfillment endpoint with the status", async () => {
  apiFetch.mockResolvedValue({});

  await ordersApi.advance("store-1", "o1", "IN_TRANSIT");

  expect(apiFetch).toHaveBeenCalledWith(
    "/stores/store-1/orders/o1/fulfillment",
    { method: "PATCH", body: JSON.stringify({ status: "IN_TRANSIT" }) },
    undefined,
  );
});

test("list validates the response against orderListSchema", async () => {
  apiFetch.mockResolvedValue([]);

  const result = await ordersApi.list("store-1");

  expect(apiFetch).toHaveBeenCalledWith("/stores/store-1/orders", {}, undefined);
  expect(result).toEqual([]);
});
