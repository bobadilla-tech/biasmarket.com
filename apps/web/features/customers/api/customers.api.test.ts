import { beforeEach, expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { customersApi } = await import("./customers.api");

beforeEach(() => {
  apiFetch.mockReset();
});

test("list calls the store-scoped customers endpoint and validates the response", async () => {
  apiFetch.mockResolvedValueOnce([
    {
      id: "customer-1",
      name: "Ana",
      phone: "+51987654321",
      email: null,
      emailVerified: false,
      createdAt: "2026-08-01T12:00:00.000Z",
      orderCount: 1,
      lifetimeSpend: 40,
      lastOrderAt: "2026-08-01T12:00:00.000Z",
    },
  ]);

  const result = await customersApi.list("store-1");

  expect(apiFetch).toHaveBeenCalledWith("/stores/store-1/customers", {}, undefined);
  expect(result).toHaveLength(1);
});

test("getOne calls the customer detail endpoint and validates the response", async () => {
  apiFetch.mockResolvedValueOnce({
    customer: {
      id: "customer-1",
      name: "Ana",
      phone: "+51987654321",
      email: null,
      emailVerified: false,
      createdAt: "2026-08-01T12:00:00.000Z",
    },
    orders: [],
  });

  const result = await customersApi.getOne("store-1", "customer-1");

  expect(apiFetch).toHaveBeenCalledWith("/stores/store-1/customers/customer-1", {}, undefined);
  expect(result.orders).toEqual([]);
});
