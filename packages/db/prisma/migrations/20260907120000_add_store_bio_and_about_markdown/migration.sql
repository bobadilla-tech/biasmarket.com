-- Seller-authored store copy for SEO/discovery — Track A / PR D1 of
-- docs/plans/2026-09-07-store-rich-content-and-thin-content-indexing-plan.md.
-- Additive, both columns nullable, no backfill.

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "aboutMarkdown" TEXT;
