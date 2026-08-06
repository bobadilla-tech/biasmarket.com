import { beforeEach, expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock(
  "@/lib/api",
  () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }),
);

const { restockApi } = await import("./restock.api");

beforeEach(() => {
  apiFetch.mockReset();
});

test("request POSTs the interest to the store-scoped endpoint and validates the response", async () => {
  apiFetch.mockResolvedValueOnce({
    id: "req-1",
    createdAt: "2026-08-05T12:00:00.000Z",
  });

  const result = await restockApi.request("myshop", {
    name: "Jane",
    phone: "+51999000111",
    productId: "product-1",
    variantId: "variant-1",
  });

  expect(apiFetch).toHaveBeenCalledWith("/stores/myshop/restock-requests", {
    method: "POST",
    body: JSON.stringify({
      name: "Jane",
      phone: "+51999000111",
      productId: "product-1",
      variantId: "variant-1",
    }),
  }, undefined);
  expect(result.id).toBe("req-1");
});

test("request POSTs a variant-less interest when variantId is omitted", async () => {
  apiFetch.mockResolvedValueOnce({ id: "req-2", createdAt: "" });

  await restockApi.request("myshop", {
    name: "Jane",
    phone: "+51999000111",
    productId: "product-1",
  });

  expect(apiFetch).toHaveBeenCalledWith("/stores/myshop/restock-requests", {
    method: "POST",
    body: JSON.stringify({
      name: "Jane",
      phone: "+51999000111",
      productId: "product-1",
    }),
  }, undefined);
});

test("request throws when the response fails schema validation", async () => {
  apiFetch.mockResolvedValueOnce({ nope: true });

  await expect(
    restockApi.request("myshop", {
      name: "Jane",
      phone: "+51999000111",
      productId: "product-1",
    }),
  ).rejects.toThrow();
});

test("list fetches the store-scoped requests and validates the payload", async () => {
  apiFetch.mockResolvedValueOnce([
    {
      id: "req-1",
      name: "Jane",
      phone: "+51999000111",
      createdAt: "2026-08-05T12:00:00.000Z",
      product: { id: "product-1", name: "Photocard", images: [] },
      variant: { id: "variant-1", name: "Jungkook" },
    },
    {
      id: "req-2",
      name: "Ana",
      phone: "+51999000222",
      createdAt: "2026-08-04T12:00:00.000Z",
      product: { id: "product-1", name: "Photocard", images: [] },
      variant: null,
    },
  ]);

  const result = await restockApi.list("store-1");

  expect(apiFetch).toHaveBeenCalledWith(
    "/stores/store-1/restock-requests",
    {},
    undefined,
  );
  expect(result).toHaveLength(2);
  expect(result[0].variant?.name).toBe("Jungkook");
  expect(result[1].variant).toBeNull();
});

test("list throws when a request is missing the product", async () => {
  apiFetch.mockResolvedValueOnce([{ id: "req-1", name: "Jane", phone: "123" }]);

  await expect(restockApi.list("store-1")).rejects.toThrow();
});
