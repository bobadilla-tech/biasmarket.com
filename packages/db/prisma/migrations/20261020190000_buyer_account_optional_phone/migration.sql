-- Buyers can now sign up with Google, which proves an email but not a phone
-- number, so a BuyerAccount may exist without a phone until the buyer adds one.
--
-- Expand step only: relaxing NOT NULL is safe while the previous release is
-- still serving traffic (it only ever inserts non-null phones). The existing
-- unique index stays as-is; Postgres allows any number of NULLs under it.

-- AlterTable
ALTER TABLE "BuyerAccount" ALTER COLUMN "phone" DROP NOT NULL;
