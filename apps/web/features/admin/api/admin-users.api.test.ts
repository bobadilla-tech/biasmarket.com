import { afterEach, expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock(
  "@/lib/api",
  () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }),
);

const { adminUsersApi } = await import("./admin-users.api");

afterEach(() => {
  apiFetch.mockReset();
});

test("getStoreCounts validates the response against storeCountListSchema", async () => {
  apiFetch.mockResolvedValue([{ userId: "u1", storeCount: 3 }]);

  const result = await adminUsersApi.getStoreCounts();

  expect(apiFetch).toHaveBeenCalledWith(
    "/admin/users/store-counts",
    {},
    undefined,
  );
  expect(result).toEqual([{ userId: "u1", storeCount: 3 }]);
});
