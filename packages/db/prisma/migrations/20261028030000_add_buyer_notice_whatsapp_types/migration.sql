/* tsqllint-disable set-quoted-identifier: this migration runs on PostgreSQL, not SQL Server. */
-- AlterEnum
-- Only statements in this migration, and nothing here uses the new values: a
-- new enum value cannot be used in the transaction that adds it.
ALTER TYPE "WhatsAppMessageType" ADD VALUE 'ASSISTED_PAYMENT_VALIDATED';
ALTER TYPE "WhatsAppMessageType" ADD VALUE 'ASSISTED_IN_TRANSIT';
ALTER TYPE "WhatsAppMessageType" ADD VALUE 'ASSISTED_READY';
ALTER TYPE "WhatsAppMessageType" ADD VALUE 'ASSISTED_DELIVERED';
