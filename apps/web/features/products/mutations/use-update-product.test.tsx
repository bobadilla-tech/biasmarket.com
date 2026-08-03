import { afterEach, expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const apiFetch = vi.fn();
vi.mock(
  "@/lib/api",
  () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }),
);

const { useUpdateProduct } = await import("./use-update-product");

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

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
  variants: [
    {
      id: "v-existing",
      name: "Small",
      stock: 5,
      reserved: 0,
      priceOverride: null,
      imageOverride: null,
      attributes: { size: "S" },
    },
    {
      id: "v-stale",
      name: "Medium",
      stock: 5,
      reserved: 0,
      priceOverride: null,
      imageOverride: null,
      attributes: { size: "M" },
    },
  ],
};

afterEach(() => {
  apiFetch.mockReset();
});

test("upserts matched and new variants against a fresh baseline, then deletes stale ones", async () => {
  apiFetch.mockImplementation((path: string, options?: RequestInit) => {
    const method = options?.method;
    if (path === "/stores/store-1/products/p1" && method === "PATCH") {
      return Promise.resolve({});
    }
    if (path === "/stores/store-1/products/p1" && !method) {
      return Promise.resolve(baseProduct);
    }
    if (
      path === "/stores/store-1/products/p1/variants/v-existing" &&
      method === "PATCH"
    ) {
      return Promise.resolve({});
    }
    if (path === "/stores/store-1/products/p1/variants" && method === "POST") {
      return Promise.resolve({
        id: "v-new",
        name: "Large",
        stock: null,
        reserved: 0,
        priceOverride: null,
        imageOverride: null,
        attributes: { size: "L" },
      });
    }
    if (
      path === "/stores/store-1/products/p1/variants/v-stale" &&
      method === "DELETE"
    ) {
      return Promise.resolve({});
    }
    return Promise.reject(new Error(`unexpected call: ${path} ${method}`));
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { result } = renderHook(() => useUpdateProduct("store-1"), {
    wrapper: createWrapper(queryClient),
  });

  result.current.mutate({
    productId: "p1",
    name: "Tee",
    description: "",
    price: "10.00",
    currency: "USD",
    stock: "",
    categoryId: "",
    imageFile: null,
    variants: [
      { name: "Small", attributes: { size: "S" } },
      { name: "Large", attributes: { size: "L" } },
    ],
    variantImages: {},
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  const deleteCall = apiFetch.mock.calls.find(
    (call) => call[0] === "/stores/store-1/products/p1/variants/v-stale",
  );
  expect(deleteCall?.[1]).toEqual({ method: "DELETE" });
});

test("aggregates a failed upsert into one error and skips the delete pass", async () => {
  apiFetch.mockImplementation((path: string, options?: RequestInit) => {
    const method = options?.method;
    if (path === "/stores/store-1/products/p1" && method === "PATCH") {
      return Promise.resolve({});
    }
    if (path === "/stores/store-1/products/p1" && !method) {
      return Promise.resolve(baseProduct);
    }
    if (
      path === "/stores/store-1/products/p1/variants/v-existing" &&
      method === "PATCH"
    ) {
      return Promise.reject(new Error("network blip"));
    }
    return Promise.reject(new Error(`unexpected call: ${path} ${method}`));
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { result } = renderHook(() => useUpdateProduct("store-1"), {
    wrapper: createWrapper(queryClient),
  });

  result.current.mutate({
    productId: "p1",
    name: "Tee",
    description: "",
    price: "10.00",
    currency: "USD",
    stock: "",
    categoryId: "",
    imageFile: null,
    variants: [{ name: "Small", attributes: { size: "S" } }],
    variantImages: {},
  });

  await waitFor(() => expect(result.current.isError).toBe(true));

  const deleteCall = apiFetch.mock.calls.find(
    (call) => (call[1] as RequestInit | undefined)?.method === "DELETE",
  );
  expect(deleteCall).toBeUndefined();
});
