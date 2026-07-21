-- AlterTable
-- Backfill existing rows with 'PEN' via a temporary default, then drop the
-- default since the app always sets currency explicitly going forward (no
-- @default in schema.prisma for Order/OrderItem.currency).
ALTER TABLE "Order" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'PEN';
ALTER TABLE "Order" ALTER COLUMN "currency" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'PEN';
ALTER TABLE "OrderItem" ALTER COLUMN "currency" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'PEN';

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "defaultCurrency" TEXT NOT NULL DEFAULT 'PEN';
