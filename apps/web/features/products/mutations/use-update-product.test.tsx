import { afterEach, expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const productsMock = {
  update: vi.fn(),
  findOne: vi.fn(),
  updateVariant: vi.fn(),
  addVariant: vi.fn(),
  deleteVariant: vi.fn(),
  removeImage: vi.fn(),
  reorderImages: vi.fn(),
};
vi.mock("@/lib/api-client", () => ({ apiClient: { products: productsMock } }));

const productsApiMock = {
  uploadImage: vi.fn(),
  uploadVariantImage: vi.fn(),
  removeImage: vi.fn(),
  reorderImages: vi.fn(),
};
vi.mock("../api/products.api", () => ({ productsApi: productsApiMock }));

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
  productsMock.update.mockReset();
  productsMock.findOne.mockReset();
  productsMock.updateVariant.mockReset();
  productsMock.addVariant.mockReset();
  productsMock.deleteVariant.mockReset();
  productsApiMock.uploadImage.mockReset();
  productsApiMock.removeImage.mockReset();
  productsApiMock.reorderImages.mockReset();
});

test("upserts matched and new variants against a fresh baseline, then deletes stale ones", async () => {
  productsMock.update.mockResolvedValue({});
  productsMock.findOne.mockResolvedValue(baseProduct);
  productsMock.updateVariant.mockResolvedValue({});
  productsMock.addVariant.mockResolvedValue({
    id: "v-new",
    name: "Large",
    stock: null,
    reserved: 0,
    priceOverride: null,
    imageOverride: null,
    attributes: { size: "L" },
  });
  productsMock.deleteVariant.mockResolvedValue({});
  productsApiMock.removeImage.mockResolvedValue({});
  productsApiMock.reorderImages.mockResolvedValue({});

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
    availability: "AVAILABLE",
    imageFiles: [],
    existingImages: [],
    variants: [
      { name: "Small", attributes: { size: "S" } },
      { name: "Large", attributes: { size: "L" } },
    ],
    variantImages: {},
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  expect(productsMock.deleteVariant).toHaveBeenCalledWith(
    "store-1",
    "p1",
    "v-stale",
  );
});

test("aggregates a failed upsert into one error and skips the delete pass", async () => {
  productsMock.update.mockResolvedValue({});
  productsMock.findOne.mockResolvedValue(baseProduct);
  productsMock.updateVariant.mockImplementation((_sid, _pid, variantId) =>
    variantId === "v-existing"
      ? Promise.reject(new Error("network blip"))
      : Promise.resolve({}),
  );
  productsApiMock.removeImage.mockResolvedValue({});
  productsApiMock.reorderImages.mockResolvedValue({});

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
    availability: "AVAILABLE",
    imageFiles: [],
    existingImages: [],
    variants: [{ name: "Small", attributes: { size: "S" } }],
    variantImages: {},
  });

  await waitFor(() => expect(result.current.isError).toBe(true));

  expect(productsMock.deleteVariant).not.toHaveBeenCalled();
});
