-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- Data step: hide the hand-created test/demo stores currently leaking into
-- the public homepage / directory / search. The audit query that produces
-- the id list, plus the parameterised UPDATE, live in the reviewed file
-- packages/db/scripts/2026-08-31-hide-test-stores.sql — run that against the
-- target database (with the ids the store owner confirms as test/demo)
-- immediately after this migration. It is intentionally not inlined here:
-- the ids are environment-specific and must be eyeballed against the audit
-- output before the write.
