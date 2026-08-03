import { afterEach, expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock(
  "@/lib/api",
  () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }),
);

const { collectionsApi } = await import("./collections.api");

afterEach(() => {
  apiFetch.mockReset();
});

test("list validates the response against collectionListSchema", async () => {
  apiFetch.mockResolvedValue([]);

  const result = await collectionsApi.list("store-1");

  expect(apiFetch).toHaveBeenCalledWith(
    "/stores/store-1/collections",
    {},
    undefined,
  );
  expect(result).toEqual([]);
});

test("create omits an empty description", async () => {
  apiFetch.mockResolvedValue({});

  await collectionsApi.create("store-1", {
    name: "Photocards",
    description: "",
  });

  expect(apiFetch).toHaveBeenCalledWith(
    "/stores/store-1/collections",
    {
      method: "POST",
      body: JSON.stringify({ name: "Photocards", description: undefined }),
    },
    undefined,
  );
});

test("reorderProducts PATCHes the full reordered id list", async () => {
  apiFetch.mockResolvedValue({});

  await collectionsApi.reorderProducts("store-1", "c1", ["p2", "p1"]);

  expect(apiFetch).toHaveBeenCalledWith(
    "/stores/store-1/collections/c1/products/reorder",
    { method: "PATCH", body: JSON.stringify({ productIds: ["p2", "p1"] }) },
    undefined,
  );
});
