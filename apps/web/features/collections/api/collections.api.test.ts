import { afterEach, expect, test, vi } from "vitest";

const GET = vi.fn();
const POST = vi.fn();
const PATCH = vi.fn();
const DELETE = vi.fn();
vi.mock(
  "@/lib/api-client",
  () => ({ apiClient: { GET, POST, PATCH, DELETE } }),
);

const { collectionsApi } = await import("./collections.api");

afterEach(() => {
  GET.mockReset();
  POST.mockReset();
  PATCH.mockReset();
  DELETE.mockReset();
});

test("list calls GET with the storeId path param", async () => {
  GET.mockResolvedValue({ data: [] });

  const result = await collectionsApi.list("store-1");

  expect(GET).toHaveBeenCalledWith("/stores/{storeId}/collections", {
    params: { path: { storeId: "store-1" } },
  });
  expect(result).toEqual([]);
});

test("create omits an empty description", async () => {
  POST.mockResolvedValue({ data: {} });

  await collectionsApi.create("store-1", {
    name: "Photocards",
    description: "",
  });

  expect(POST).toHaveBeenCalledWith("/stores/{storeId}/collections", {
    params: { path: { storeId: "store-1" } },
    body: { name: "Photocards", description: undefined },
  });
});

test("reorderProducts PATCHes the full reordered id list", async () => {
  PATCH.mockResolvedValue({ data: [] });

  await collectionsApi.reorderProducts("store-1", "c1", ["p2", "p1"]);

  expect(PATCH).toHaveBeenCalledWith(
    "/stores/{storeId}/collections/{collectionId}/products/reorder",
    {
      params: { path: { storeId: "store-1", collectionId: "c1" } },
      body: { productIds: ["p2", "p1"] },
    },
  );
});

test("throws the backend error message on failure", async () => {
  GET.mockResolvedValue({ error: { message: "No sos dueño de esta store" } });

  await expect(collectionsApi.list("store-1")).rejects.toThrow(
    "No sos dueño de esta store",
  );
});

test("falls back to the caller-supplied message when the error has no message", async () => {
  GET.mockResolvedValue({ error: {} });

  await expect(collectionsApi.list("store-1", "Could not load collections"))
    .rejects.toThrow("Could not load collections");
});
