-- Hide test/demo stores that were hand-created in a live database and are
-- leaking into the public homepage "Descubre tiendas", the /stores directory
-- and /search (GitHub issue #167).
--
-- Runs as the data step of migration 20260831223600_add_store_is_demo, but is
-- kept here (reviewed, committed) rather than inlined into migration.sql
-- because the id list is environment-specific and must be checked against the
-- audit output below before the write.
--
-- Procedure:
--   1. Run the AUDIT query. It lists every currently-public store, its owner
--      and its published-product count, oldest first.
--   2. Decide which rows are test/demo (typically: internal owner email,
--      throwaway name/slug like "Tienda" / "tienditaUnica", 0-1 published
--      products).
--   3. Put those ids in the REMEDIATION UPDATE and run it inside a
--      transaction. Re-run the audit to confirm.
--   4. Record the confirmed ids in
--      docs/plans/2026-08-31-homepage-issues-167-166-165-plan.md.

-- ── AUDIT ────────────────────────────────────────────────────────────────
SELECT s.id,
       s.name,
       s.slug,
       s."isPublic",
       s."isDemo",
       u.email,
       s."createdAt",
       (SELECT count(*)
          FROM "Product" p
         WHERE p."storeId" = s.id
           AND p.status = 'PUBLISHED'
           AND p."deletedAt" IS NULL
           AND p.discontinued = false) AS pub_products
  FROM "Store" s
  JOIN "User" u ON u.id = s."ownerId"
 WHERE s."isPublic" = true
 ORDER BY s."createdAt";

-- ── REMEDIATION ──────────────────────────────────────────────────────────
-- Belt-and-suspenders: set BOTH flags so a single forgotten filter on one of
-- them cannot re-expose a junk row. Replace the id list with the confirmed
-- ids from the audit before running.
BEGIN;

UPDATE "Store"
   SET "isPublic" = false,
       "isDemo"   = true
 WHERE id IN (
   -- '<store-id-1>',
   -- '<store-id-2>'
 );

-- Sanity check: expect the rows you intended, nothing else.
SELECT id, name, slug, "isPublic", "isDemo" FROM "Store" WHERE "isDemo" = true;

COMMIT;
