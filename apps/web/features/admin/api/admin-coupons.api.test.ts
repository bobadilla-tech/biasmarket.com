import { afterEach, expect, test, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { adminCouponsApi } = await import("./admin-coupons.api");

afterEach(() => {
  fetchMock.mockReset();
});

function okResponse(body: unknown = {}) {
  return {
    ok: true,
    json: () => Promise.resolve(body),
  };
}

function malformedId(): string {
  // Deliberately inject path segments / query params to probe traversal.
  return "coupon-1/../../admin/users?x=1";
}

test("update rejects a non-alphanumeric couponId without fetching", async () => {
  await expect(
    adminCouponsApi.update(malformedId(), { name: "X" }),
  ).rejects.toThrow("Invalid coupon id");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("toggleStatus rejects a non-alphanumeric couponId without fetching", async () => {
  await expect(adminCouponsApi.toggleStatus(malformedId())).rejects.toThrow(
    "Invalid coupon id",
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

test("delete rejects a non-alphanumeric couponId without fetching", async () => {
  await expect(adminCouponsApi.delete(malformedId())).rejects.toThrow(
    "Invalid coupon id",
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

test("listRedemptions rejects a non-alphanumeric couponId without fetching", async () => {
  await expect(adminCouponsApi.listRedemptions(malformedId())).rejects.toThrow(
    "Invalid coupon id",
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

test("unredeem rejects a non-alphanumeric couponId or redemptionId", async () => {
  await expect(
    adminCouponsApi.unredeem(malformedId(), "validredemptionid"),
  ).rejects.toThrow("Invalid coupon id");
  await expect(
    adminCouponsApi.unredeem("validcouponid", malformedId()),
  ).rejects.toThrow("Invalid redemption id");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("unredeem forwards a valid alphanumeric coupon and redemption id", async () => {
  fetchMock.mockResolvedValueOnce(okResponse({ unredeemed: true }));

  const result = await adminCouponsApi.unredeem("coupon1A", "redemption1B");

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url] = fetchMock.mock.calls[0];
  expect(url).toContain("/coupons/coupon1A/redemptions/redemption1B/unredeem");
  expect(result).toEqual({ unredeemed: true });
});

test("list forwards a valid alphanumeric coupon id", async () => {
  fetchMock.mockResolvedValueOnce(okResponse([]));

  const result = await adminCouponsApi.list();

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url] = fetchMock.mock.calls[0];
  expect(url).toContain("/api/admin/coupons");
  expect(result).toEqual([]);
});
