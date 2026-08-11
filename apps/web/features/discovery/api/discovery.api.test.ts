import { beforeEach, expect, test, vi } from "vitest";

const storesMock = { findFeatured: vi.fn(), findDirectory: vi.fn() };
const productSearchMock = { search: vi.fn() };
vi.mock("@/lib/api-client", () => ({
  apiClient: { stores: storesMock, productSearch: productSearchMock },
}));

const { discoveryApi } = await import("./discovery.api");

beforeEach(() => {
  storesMock.findFeatured.mockReset();
  storesMock.findDirectory.mockReset();
  productSearchMock.search.mockReset();
});

test("getFeaturedStores omits the limit param when not provided", async () => {
  storesMock.findFeatured.mockResolvedValue([]);
  await discoveryApi.getFeaturedStores();
  expect(storesMock.findFeatured).toHaveBeenCalledWith({ limit: undefined });
});

test("getFeaturedStores stringifies the limit param when provided", async () => {
  storesMock.findFeatured.mockResolvedValue([]);
  await discoveryApi.getFeaturedStores(6);
  expect(storesMock.findFeatured).toHaveBeenCalledWith({ limit: "6" });
});

test("getStoreDirectory passes q and stringifies page", async () => {
  storesMock.findDirectory.mockResolvedValue({
    stores: [],
    total: 0,
    page: 2,
    limit: 24,
  });
  await discoveryApi.getStoreDirectory({ q: "kpop", page: 2 });
  expect(storesMock.findDirectory).toHaveBeenCalledWith({
    q: "kpop",
    page: "2",
  });
});

test("searchProducts passes q and stringifies page", async () => {
  productSearchMock.search.mockResolvedValue({
    products: [],
    total: 0,
    page: 1,
    limit: 24,
  });
  await discoveryApi.searchProducts({ q: "album", page: 2 });
  expect(productSearchMock.search).toHaveBeenCalledWith({
    q: "album",
    page: "2",
    limit: undefined,
    category: undefined,
    sort: undefined,
  });
});

test("searchProducts passes category and sort when provided", async () => {
  productSearchMock.search.mockResolvedValue({
    products: [],
    total: 0,
    page: 1,
    limit: 24,
  });
  await discoveryApi.searchProducts({
    page: 1,
    category: "Photocards",
    sort: "bestseller",
  });
  expect(productSearchMock.search).toHaveBeenCalledWith({
    q: undefined,
    page: "1",
    limit: undefined,
    category: "Photocards",
    sort: "bestseller",
  });
});

test("searchProducts stringifies limit when provided", async () => {
  productSearchMock.search.mockResolvedValue({
    products: [],
    total: 0,
    page: 1,
    limit: 12,
  });
  await discoveryApi.searchProducts({ page: 1, limit: 12 });
  expect(productSearchMock.search).toHaveBeenCalledWith({
    q: undefined,
    page: "1",
    limit: "12",
    category: undefined,
    sort: undefined,
  });
});
