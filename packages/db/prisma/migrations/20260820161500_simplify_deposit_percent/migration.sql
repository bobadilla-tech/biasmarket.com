-- AlterTable: Replace depositPercentPickup + depositPercentCourier with a single
-- depositPercent. Default is 100% (full payment) — a deposit becomes opt-in per
-- method rather than the norm.
--
-- Existing rows keep the higher of their two legacy percentages (GREATEST): no
-- store silently starts asking buyers for less upfront than any of its legacy
-- methods required.

ALTER TABLE "PaymentMethodConfig" ADD COLUMN "depositPercent" INTEGER NOT NULL DEFAULT 100;

UPDATE "PaymentMethodConfig"
SET "depositPercent" = GREATEST("depositPercentPickup", "depositPercentCourier");

ALTER TABLE "PaymentMethodConfig" DROP COLUMN "depositPercentPickup";
ALTER TABLE "PaymentMethodConfig" DROP COLUMN "depositPercentCourier";
