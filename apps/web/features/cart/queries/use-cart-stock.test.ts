import { afterEach, expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import { createElement } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// `computeStockMaps` is module-private; exercise it through the public
// `useCartStock` hook (zero source change for PR A). The hook's queryFn is
// `computeStockMaps(await apiClient.stores.findPublic(slug))`, so a mocked
// `findPublic` payload drives the pure mapping directly.
const findPublic = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-client", () => ({
  apiClient: { stores: { findPublic } },
}));

const { useCartStock } = await import("./use-cart-stock");

afterEach(() => {
  vi.clearAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function collectionSection(products: unknown[]) {
  return { type: "COLLECTION", collection: { products } };
}

async function run(payload: unknown) {
  findPublic.mockResolvedValue(payload);
  const { result } = renderHook(() => useCartStock("my-store"), { wrapper });
  await waitFor(() => {
    expect(findPublic).toHaveBeenCalledWith("my-store");
    // The hook returns empty maps until the query resolves.
    expect(
      result.current.variantAvail.size + result.current.productAvail.size,
    ).toBeGreaterThan(0);
  });
  return result.current;
}

test("null variant stock counts as unlimited (Infinity) at both levels", async () => {
  const { variantAvail, productAvail } = await run({
    sections: [
      collectionSection([
        {
          product: {
            id: "p1",
            discontinued: false,
            variants: [{ id: "v1", stock: null, reserved: 999 }],
          },
        },
      ]),
    ],
  });

  expect(variantAvail.get("v1")).toBe(Infinity);
  expect(productAvail.get("p1")).toBe(Infinity);
});

test("finite variant availability is stock minus reserved, summed per product", async () => {
  const { variantAvail, productAvail } = await run({
    sections: [
      collectionSection([
        {
          product: {
            id: "p1",
            discontinued: false,
            variants: [
              { id: "v1", stock: 10, reserved: 3 },
              { id: "v2", stock: 5, reserved: 5 },
            ],
          },
        },
      ]),
    ],
  });

  expect(variantAvail.get("v1")).toBe(7);
  expect(variantAvail.get("v2")).toBe(0);
  expect(productAvail.get("p1")).toBe(7);
});

test("a product with one unlimited variant is unlimited overall", async () => {
  const { productAvail } = await run({
    sections: [
      collectionSection([
        {
          product: {
            id: "p1",
            discontinued: false,
            variants: [
              { id: "v1", stock: 2, reserved: 0 },
              { id: "v2", stock: null, reserved: 0 },
            ],
          },
        },
      ]),
    ],
  });

  expect(productAvail.get("p1")).toBe(Infinity);
});

test("a product with no variants is treated as unlimited", async () => {
  const { productAvail, variantAvail } = await run({
    sections: [
      collectionSection([
        { product: { id: "p1", discontinued: false, variants: [] } },
      ]),
    ],
  });

  expect(productAvail.get("p1")).toBe(Infinity);
  expect(variantAvail.size).toBe(0);
});

test("discontinued products are skipped entirely", async () => {
  const { productAvail, variantAvail } = await run({
    sections: [
      collectionSection([
        {
          product: {
            id: "gone",
            discontinued: true,
            variants: [{ id: "v1", stock: 4, reserved: 0 }],
          },
        },
        {
          product: {
            id: "live",
            discontinued: false,
            variants: [{ id: "v2", stock: 4, reserved: 1 }],
          },
        },
      ]),
    ],
  });

  expect(productAvail.has("gone")).toBe(false);
  expect(variantAvail.has("v1")).toBe(false);
  expect(productAvail.get("live")).toBe(3);
});

test("non-collection sections and collection-less sections are ignored", async () => {
  const { productAvail } = await run({
    sections: [
      { type: "BANNER", collection: null },
      { type: "COLLECTION", collection: null },
      collectionSection([
        { product: { id: "p1", discontinued: false, variants: [] } },
      ]),
    ],
  });

  expect(productAvail.get("p1")).toBe(Infinity);
  expect(productAvail.size).toBe(1);
});
