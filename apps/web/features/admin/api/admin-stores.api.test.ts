import { afterEach, expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock(
  "@/lib/api",
  () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }),
);

const { adminStoresApi } = await import("./admin-stores.api");

afterEach(() => {
  apiFetch.mockReset();
});

test("list validates the response against adminStoreListSchema", async () => {
  apiFetch.mockResolvedValue([]);

  const result = await adminStoresApi.list();

  expect(apiFetch).toHaveBeenCalledWith("/stores", {}, undefined);
  expect(result).toEqual([]);
});
