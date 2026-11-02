CREATE TYPE "CheckoutPaymentType" AS ENUM ('FULL', 'PARTIAL');

ALTER TABLE "Order"
ADD COLUMN "paymentType" "CheckoutPaymentType";
