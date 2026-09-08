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
// D5 wired this predicate up REPORT-ONLY. D6 turned it into a page-level
// `robots: { index: false }`. D7 applies it to the sitemap query via
// SITEMAP_INDEXABLE_STORE_WHERE below.

import type { Prisma } from '@biasmarket/db';

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

// D7 — the Prisma `where` the sitemap reads spread on top of
// PUBLIC_STORE_VISIBILITY. It approximates `isStoreIndexable` for a query that
// can't run the predicate per row: same non-banned-owner + product-count bar,
// and a LOOSE prose check.
//
// Loose by design (plan Part 9 q2 — resolved "loose is fine, no post-fetch
// pass"): the `where` can cheaply test `sections: { some: { type: 'TEXT_BLOCK'
// } }` but not "…with a non-empty content.body", and it treats any non-null
// `bio` / `aboutMarkdown` as prose even if it's an empty string. The
// authoritative, strict check is the per-page `indexable` signal from
// findPublicBySlug that D6 turns into `robots: { index: false }`; the worst case
// here is a near-empty store lingering in the sitemap for one extra crawl cycle
// before Googlebot fetches the page and sees its noindex tag. A post-fetch
// TEXT_BLOCK-body refinement would mean loading every candidate store's section
// bodies per sitemap chunk for a one-cycle gain — not worth it.
export const SITEMAP_INDEXABLE_STORE_WHERE = {
  owner: { banned: { not: true } },
  publishedProductCount: { gte: MIN_INDEXABLE_PRODUCTS },
  OR: [
    { bio: { not: null } },
    { aboutMarkdown: { not: null } },
    { sections: { some: { type: 'TEXT_BLOCK' } } },
  ],
} as const satisfies Prisma.StoreWhereInput;
