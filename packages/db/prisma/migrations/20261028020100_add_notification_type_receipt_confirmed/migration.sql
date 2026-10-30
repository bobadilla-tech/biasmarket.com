-- AlterEnum
-- A new enum value cannot be used in the same transaction that adds it, so
-- this migration contains nothing else.
ALTER TYPE "NotificationType" ADD VALUE 'RECEIPT_CONFIRMED';
