import { afterEach, expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { categoriesApi } = await import("./categories.api");

afterEach(() => {
  apiFetch.mockReset();
});

test("list validates the response against categoryListSchema", async () => {
  apiFetch.mockResolvedValue([{ id: "c1", name: "Clothing" }]);

  const result = await categoriesApi.list("store-1");

  expect(apiFetch).toHaveBeenCalledWith("/stores/store-1/categories", {}, undefined);
  expect(result).toEqual([{ id: "c1", name: "Clothing" }]);
});

test("create POSTs the trimmed name and validates the response", async () => {
  apiFetch.mockResolvedValue({ id: "c2", name: "Accessories" });

  const result = await categoriesApi.create("store-1", "Accessories");

  expect(apiFetch).toHaveBeenCalledWith(
    "/stores/store-1/categories",
    { method: "POST", body: JSON.stringify({ name: "Accessories" }) },
    undefined,
  );
  expect(result).toEqual({ id: "c2", name: "Accessories" });
});
