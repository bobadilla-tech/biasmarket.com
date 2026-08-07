-- AlterTable
ALTER TABLE "PickupPoint" ADD COLUMN     "closedOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "openDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
