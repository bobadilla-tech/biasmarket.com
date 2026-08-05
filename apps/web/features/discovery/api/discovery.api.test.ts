import { beforeEach, expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock(
  "@/lib/api",
  () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }),
);

const storesMock = { findFeatured: vi.fn(), findDirectory: vi.fn() };
vi.mock("@/lib/api-client", () => ({ apiClient: { stores: storesMock } }));

const { discoveryApi } = await import("./discovery.api");

beforeEach(() => {
  apiFetch.mockReset();
  storesMock.findFeatured.mockReset();
  storesMock.findDirectory.mockReset();
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

test("searchProducts builds q query param only when provided", async () => {
  apiFetch.mockResolvedValueOnce({
    products: [],
    total: 0,
    page: 1,
    limit: 24,
  });
  await discoveryApi.searchProducts({ q: "album" });
  expect(apiFetch).toHaveBeenCalledWith("/products/search?q=album");
});
