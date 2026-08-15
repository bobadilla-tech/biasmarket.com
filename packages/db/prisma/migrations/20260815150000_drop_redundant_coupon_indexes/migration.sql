-- Coupon.code is already @unique, which creates its own index — the
-- standalone @@index([code]) was a duplicate.
DROP INDEX "Coupon_code_idx";

-- @@unique([couponId, userId]) already serves as a leftmost-prefix index for
-- couponId-only lookups (e.g. redeemCoupon's count()) — the standalone
-- @@index([couponId]) was a duplicate.
DROP INDEX "CouponRedemption_couponId_idx";
