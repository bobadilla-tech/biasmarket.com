-- better-auth 1.7.3 reverted the `account.issuer` requirement from 1.7.0-1.7.2:
-- accounts are matched on (providerId, accountId) again and `issuer` is never
-- written, so the NOT NULL column made every sign-up insert fail (500). See
-- https://www.better-auth.com/docs/guides/1-7-upgrade-guide
--
-- Expand step only: relax the constraint and drop the unique index, but keep
-- the column (and its existing values) so a still-running 1.7.2 container in
-- the blue/green window keeps working. Drop the column in a later migration.

-- DropIndex
DROP INDEX "account_issuer_accountId_key";

-- AlterTable
ALTER TABLE "account" ALTER COLUMN "issuer" DROP NOT NULL;
