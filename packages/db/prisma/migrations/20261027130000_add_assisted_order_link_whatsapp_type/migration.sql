-- AlterEnum
-- Only statement in this migration, and nothing here uses the new value: a new
-- enum value cannot be used in the transaction that adds it.
ALTER TYPE "WhatsAppMessageType" ADD VALUE 'ASSISTED_ORDER_LINK';
