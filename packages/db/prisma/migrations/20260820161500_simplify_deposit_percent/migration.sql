-- AlterTable: Replace depositPercentPickup + depositPercentCourier with single depositPercent
-- Default 20% as specified in issue #120

ALTER TABLE "PaymentMethodConfig" ADD COLUMN "depositPercent" INTEGER NOT NULL DEFAULT 20;

ALTER TABLE "PaymentMethodConfig" DROP COLUMN "depositPercentPickup";
ALTER TABLE "PaymentMethodConfig" DROP COLUMN "depositPercentCourier";
