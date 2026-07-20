-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "customerPhone" TEXT NOT NULL,
ALTER COLUMN "customerEmail" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "whatsappNumber" TEXT;

