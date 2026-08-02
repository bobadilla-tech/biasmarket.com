import { afterEach, expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { productsApi } = await import("./products.api");

const baseProduct = {
  id: "p1",
  name: "Tee",
  description: "",
  price: "10.00",
  currency: "USD",
  status: "DRAFT" as const,
  soldOut: false,
  images: [],
  availableUntil: null,
};

afterEach(() => {
  apiFetch.mockReset();
});

test("create POSTs the payload and validates the response", async () => {
  apiFetch.mockResolvedValue(baseProduct);

  const result = await productsApi.create("store-1", {
    name: "Tee",
    price: 10,
    currency: "USD",
    variants: [{ name: "Small", attributes: { size: "S" } }],
  });

  expect(apiFetch).toHaveBeenCalledWith(
    "/stores/store-1/products",
    {
      method: "POST",
      body: JSON.stringify({
        name: "Tee",
        price: 10,
        currency: "USD",
        variants: [{ name: "Small", attributes: { size: "S" } }],
      }),
    },
    undefined,
  );
  expect(result).toEqual(baseProduct);
});

test("update PATCHes the product", async () => {
  apiFetch.mockResolvedValue({});

  await productsApi.update("store-1", "p1", {
    name: "Tee",
    price: 12,
    currency: "USD",
    categoryIds: ["c1"],
  });

  expect(apiFetch).toHaveBeenCalledWith(
    "/stores/store-1/products/p1",
    {
      method: "PATCH",
      body: JSON.stringify({ name: "Tee", price: 12, currency: "USD", categoryIds: ["c1"] }),
    },
    undefined,
  );
});

test("deleteVariant swallows a failed request instead of rejecting", async () => {
  apiFetch.mockRejectedValue(new Error("not found"));

  await expect(productsApi.deleteVariant("store-1", "p1", "v1")).resolves.toBeUndefined();
});

test("publish PATCHes the publish endpoint", async () => {
  apiFetch.mockResolvedValue({});

  await productsApi.publish("store-1", "p1");

  expect(apiFetch).toHaveBeenCalledWith(
    "/stores/store-1/products/p1/publish",
    { method: "PATCH" },
    undefined,
  );
});
