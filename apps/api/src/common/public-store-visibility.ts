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
// at least one listable product. Used only by findFeatured / findDirectory;
// deliberately NOT applied to the sitemap reads, which list every public
// store regardless of catalog state.
export const PUBLIC_STORE_HAS_LISTABLE_PRODUCT = {
  owner: { banned: { not: true } },
  products: {
    some: { status: 'PUBLISHED', deletedAt: null, discontinued: false },
  },
} as const satisfies Prisma.StoreWhereInput;
