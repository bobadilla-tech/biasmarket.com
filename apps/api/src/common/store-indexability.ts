// Track C core of
// docs/plans/2026-09-07-store-rich-content-and-thin-content-indexing-plan.md
// (Part 5.3). Single source of truth for "should Google index this store page".
//
// Deliberate REVERSAL of public-store-visibility.ts's note that the sitemap
// "lists every public store regardless of catalog state" — see that comment and
// the parent GSC audit doc (2026-09-07-gsc-indexing-audit-organic-growth-plan.md)
// Tier 3 item 1. The gate here is content quality, not just "is public": at
// UGC-marketplace scale a pile of thin store pages drags down domain-level
// quality for every other page.
//
// D5 wires this predicate up REPORT-ONLY: it is exposed on the public store DTO
// as `indexable` and measured, but nothing acts on it yet. D6 turns it into a
// page-level `robots: { index: false }`; D7 applies it to the sitemap query.

export const MIN_INDEXABLE_PRODUCTS = 2;

export interface StoreIndexabilityInput {
  isPublic: boolean;
  isDemo: boolean;
  ownerBanned: boolean;
  publishedProductCount: number;
  bio: string | null;
  aboutMarkdown: string | null;
  // >=1 TEXT_BLOCK section whose content.body is a non-empty string. The Prisma
  // `where` used by the sitemap query can't express this refinement, so the
  // authoritative check lives on the read path that already loads sections
  // (findPublicBySlug).
  hasRealTextBlockSection: boolean;
}

export function isStoreIndexable(s: StoreIndexabilityInput): boolean {
  if (!s.isPublic || s.isDemo || s.ownerBanned) return false;
  const hasProse =
    !!s.bio?.trim() || !!s.aboutMarkdown?.trim() || s.hasRealTextBlockSection;
  return s.publishedProductCount >= MIN_INDEXABLE_PRODUCTS && hasProse;
}
