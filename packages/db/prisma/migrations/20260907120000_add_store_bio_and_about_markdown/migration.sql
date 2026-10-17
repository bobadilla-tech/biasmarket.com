-- Seller-authored store copy for SEO/discovery — Track A / PR D1 of
-- .artifacts/2026/09/20260907--store-rich-content-and-thin/plan.md.
-- Additive, both columns nullable, no backfill.

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "aboutMarkdown" TEXT;
