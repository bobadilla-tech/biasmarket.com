import { afterEach, expect, test, vi } from "vitest";

const storesMock = { findAllForAdmin: vi.fn() };
vi.mock("@/lib/api-client", () => ({ apiClient: { stores: storesMock } }));

const { adminStoresApi } = await import("./admin-stores.api");

afterEach(() => {
  storesMock.findAllForAdmin.mockReset();
});

test("list delegates to the generated Stores.findAllForAdmin", async () => {
  storesMock.findAllForAdmin.mockResolvedValue([]);

  const result = await adminStoresApi.list();

  expect(storesMock.findAllForAdmin).toHaveBeenCalledWith({
    fallbackErrorMessage: undefined,
  });
  expect(result).toEqual([]);
});
