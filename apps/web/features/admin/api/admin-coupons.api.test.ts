import { afterEach, expect, test, vi } from "vitest";

const couponsMock = {
  listCoupons: vi.fn(),
  createCoupon: vi.fn(),
  updateCoupon: vi.fn(),
  toggleCouponStatus: vi.fn(),
  deleteCoupon: vi.fn(),
  getRedemptions: vi.fn(),
  unredeemCoupon: vi.fn(),
};

vi.mock("@/lib/api-client", () => ({
  apiClient: { coupons: couponsMock },
}));

const { adminCouponsApi } = await import("./admin-coupons.api");

afterEach(() => {
  vi.clearAllMocks();
});

function malformedId(): string {
  // Deliberately inject path segments / query params to probe traversal.
  return "coupon-1/../../admin/users?x=1";
}

test("update rejects a non-alphanumeric couponId without calling the client", async () => {
  await expect(
    adminCouponsApi.update(malformedId(), { name: "X" }),
  ).rejects.toThrow("Invalid coupon id");
  expect(couponsMock.updateCoupon).not.toHaveBeenCalled();
});

test("toggleStatus rejects a non-alphanumeric couponId without calling the client", async () => {
  await expect(adminCouponsApi.toggleStatus(malformedId())).rejects.toThrow(
    "Invalid coupon id",
  );
  expect(couponsMock.toggleCouponStatus).not.toHaveBeenCalled();
});

test("delete rejects a non-alphanumeric couponId without calling the client", async () => {
  await expect(adminCouponsApi.delete(malformedId())).rejects.toThrow(
    "Invalid coupon id",
  );
  expect(couponsMock.deleteCoupon).not.toHaveBeenCalled();
});

test("listRedemptions rejects a non-alphanumeric couponId without calling the client", async () => {
  await expect(adminCouponsApi.listRedemptions(malformedId())).rejects.toThrow(
    "Invalid coupon id",
  );
  expect(couponsMock.getRedemptions).not.toHaveBeenCalled();
});

test("unredeem rejects a non-alphanumeric couponId or redemptionId", async () => {
  await expect(
    adminCouponsApi.unredeem(malformedId(), "validredemptionid"),
  ).rejects.toThrow("Invalid coupon id");
  await expect(
    adminCouponsApi.unredeem("validcouponid", malformedId()),
  ).rejects.toThrow("Invalid redemption id");
  expect(couponsMock.unredeemCoupon).not.toHaveBeenCalled();
});

test("unredeem forwards a valid alphanumeric coupon and redemption id", async () => {
  couponsMock.unredeemCoupon.mockResolvedValueOnce(undefined);

  await adminCouponsApi.unredeem("coupon1A", "redemption1B");

  expect(couponsMock.unredeemCoupon).toHaveBeenCalledWith(
    "coupon1A",
    "redemption1B",
    { fallbackErrorMessage: undefined },
  );
});

test("list forwards to the generated client", async () => {
  couponsMock.listCoupons.mockResolvedValueOnce([]);

  const result = await adminCouponsApi.list();

  expect(couponsMock.listCoupons).toHaveBeenCalledWith({
    fallbackErrorMessage: undefined,
  });
  expect(result).toEqual([]);
});
