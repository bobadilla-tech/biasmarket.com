import { beforeEach, expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { discoveryApi } = await import("./discovery.api");

beforeEach(() => {
  apiFetch.mockReset();
});

test("getFeaturedStores omits the limit query param when not provided", async () => {
  apiFetch.mockResolvedValueOnce([]);
  await discoveryApi.getFeaturedStores();
  expect(apiFetch).toHaveBeenCalledWith("/stores/featured");
});

test("getFeaturedStores includes the limit query param when provided", async () => {
  apiFetch.mockResolvedValueOnce([]);
  await discoveryApi.getFeaturedStores(6);
  expect(apiFetch).toHaveBeenCalledWith("/stores/featured?limit=6");
});

test("getStoreDirectory builds q and page query params", async () => {
  apiFetch.mockResolvedValueOnce({ stores: [], total: 0, page: 2, limit: 24 });
  await discoveryApi.getStoreDirectory({ q: "kpop", page: 2 });
  expect(apiFetch).toHaveBeenCalledWith("/stores/directory?q=kpop&page=2");
});

test("searchProducts builds q query param only when provided", async () => {
  apiFetch.mockResolvedValueOnce({ products: [], total: 0, page: 1, limit: 24 });
  await discoveryApi.searchProducts({ q: "album" });
  expect(apiFetch).toHaveBeenCalledWith("/products/search?q=album");
});
