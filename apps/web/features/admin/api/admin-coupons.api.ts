import { apiClient } from "@/lib/api-client";
import type { CreateCouponDto, UpdateCouponDto } from "@biasmarket/types";

/**
 * IDs are Prisma CUIDs (alphanumeric). Reject anything else before it is
 * interpolated into a URL path segment, so a malicious value can't inject
 * path segments or query parameters (path manipulation / SSRF guard rail).
 */
function assertSafeId(id: string, label: string): void {
  if (typeof id !== "string" || !/^[A-Za-z0-9]+$/.test(id)) {
    throw new Error(`Invalid ${label}`);
  }
}

export const adminCouponsApi = {
  list(fallbackErrorMessage?: string) {
    return apiClient.coupons.listCoupons({ fallbackErrorMessage });
  },

  create(values: CreateCouponDto, fallbackErrorMessage?: string) {
    return apiClient.coupons.createCoupon(values, { fallbackErrorMessage });
  },

  async update(
    couponId: string,
    values: UpdateCouponDto,
    fallbackErrorMessage?: string,
  ) {
    assertSafeId(couponId, "coupon id");
    return apiClient.coupons.updateCoupon(couponId, values, {
      fallbackErrorMessage,
    });
  },

  async toggleStatus(couponId: string, fallbackErrorMessage?: string) {
    assertSafeId(couponId, "coupon id");
    return apiClient.coupons.toggleCouponStatus(couponId, {
      fallbackErrorMessage,
    });
  },

  async delete(couponId: string, fallbackErrorMessage?: string) {
    assertSafeId(couponId, "coupon id");
    return apiClient.coupons.deleteCoupon(couponId, { fallbackErrorMessage });
  },

  async listRedemptions(couponId: string, fallbackErrorMessage?: string) {
    assertSafeId(couponId, "coupon id");
    return apiClient.coupons.getRedemptions(couponId, {
      fallbackErrorMessage,
    });
  },

  async unredeem(
    couponId: string,
    redemptionId: string,
    fallbackErrorMessage?: string,
  ) {
    assertSafeId(couponId, "coupon id");
    assertSafeId(redemptionId, "redemption id");
    return apiClient.coupons.unredeemCoupon(couponId, redemptionId, {
      fallbackErrorMessage,
    });
  },
};
