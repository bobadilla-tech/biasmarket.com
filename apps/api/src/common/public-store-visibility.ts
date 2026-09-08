import type { Prisma } from '@biasmarket/db';

// Single source of truth for "may this store appear on a public surface".
// `isPublic` is a seller-owned toggle (a real seller may legitimately
// un-list their store); `isDemo` is a platform-owned "this is test data"
// marker. A public read must exclude both. Spread this into *every* public
// store read (homepage, directory, sitemap, search, collections) so an
// eighth call site can't silently forget one of the flags.
export const PUBLIC_STORE_VISIBILITY = {
  isPublic: true,
  isDemo: false,
} as const satisfies Prisma.StoreWhereInput;

// The extra "worth showing in a *listing*" predicate — a non-banned owner and
// at least one listable product. Used only by findFeatured / findDirectory.
//
// The sitemap reads used to be deliberately exempt from any catalog/content
// gate ("list every public store regardless of state"). D7 of
// docs/plans/2026-09-07-store-rich-content-and-thin-content-indexing-plan.md
// (parent: 2026-09-07-gsc-indexing-audit-organic-growth-plan.md Tier 3 item 1)
// reversed that: the sitemap now spreads SITEMAP_INDEXABLE_STORE_WHERE (see
// store-indexability.ts) so thin / near-empty stores are neither indexed nor
// sitemap-listed. findFeatured / findDirectory keep their own separate
// predicate below — "what we surface" and "what Google indexes" stay distinct.
export const PUBLIC_STORE_HAS_LISTABLE_PRODUCT = {
  owner: { banned: { not: true } },
  products: {
    some: { status: 'PUBLISHED', deletedAt: null, discontinued: false },
  },
} as const satisfies Prisma.StoreWhereInput;
