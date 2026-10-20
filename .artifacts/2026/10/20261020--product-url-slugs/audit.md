# Product URL slug audit

Date: 2026-10-20. Scope: why public product URLs look like
`/en/store/korealexa/product/cmvftk21w001e01ny8qh3zc3q`, and what it takes to
make them readable. Companion plan: `plan.md` (same folder).

## Summary

The trailing segment is not a slug. It is `Product.id`, a raw cuid. `Product`
has no `slug` column, so every public surface uses the primary key as the URL
identifier. Stores (`Store.slug`) and collections (`Collection.slug`,
`@@unique([storeId, slug])`) already have real slugs; products are the outlier.

Products are already store-scoped (`/store/:slug/product/...`), so uniqueness
only has to hold within a store, same as `Collection`.

## Current state (verified against the code)

| Area                               | Where                                                                                                                                                                                                               | Behaviour                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Schema                             | `packages/db/prisma/schema.prisma` `model Product`                                                                                                                                                                  | No `slug`. Indexes: `[storeId]`, `[storeId, status]`.                                                                                            |
| Route                              | `apps/web/app/[locale]/(storefront)/store/[slug]/product/[productId]/page.tsx`                                                                                                                                      | Param is `productId`; canonical URL and `localeAlternates` built from it.                                                                        |
| Public fetch                       | same page → `GET /api/stores/:slug/products/:productId/public`                                                                                                                                                      | `StoresService.findPublicProduct` does `product.findUnique({ where: { id } })`, then checks `storeId`, `PUBLISHED`, `deletedAt`, `discontinued`. |
| Link builders                      | `components/storefront/product-card.tsx:105`, `features/landing/components/product-grid-card.tsx:23`, `app/[locale]/search/search-page-client.tsx:187`                                                              | `/store/${slug}/product/${product.id}`.                                                                                                          |
| JSON-LD                            | `store/[slug]/page.tsx:203`                                                                                                                                                                                         | `${pageUrl}/product/${encodeURIComponent(product.id)}`.                                                                                          |
| Search API                         | `ProductSearchService` `PRODUCT_SELECT`                                                                                                                                                                             | Returns `id, name, price, currency, images, store{name,slug}`; no slug.                                                                          |
| Public DTOs                        | `stores/dto/store-response.dto.ts` `PublicProductWithVariantsResponseDto` (also nested in `SectionCollectionProductResponseDto`), `ProductResponseDto`, `ProductSearchResultResponseDto`, `OrderProductResponseDto` | Expose `id`, no slug. Generated SDK in `packages/types/generated/**` mirrors them.                                                               |
| Not-found                          | product `page.tsx`                                                                                                                                                                                                  | Renders a "not found" paragraph with HTTP 200 (soft 404); never calls `notFound()`.                                                              |
| Locale redirects                   | `i18n/navigation.ts`                                                                                                                                                                                                | next-intl `redirect` is 307; a 308 needs `permanentRedirect` + `getPathname`.                                                                    |
| Creation                           | `ProductsService.create` (`products.service.ts:95`); seed `apps/api/scripts/seed/helpers.ts:315` `ensureProduct` (`product.upsert`, called from `seed/apply.ts:128`)                                                | `...data` spread, no slug logic. E2E specs create via the HTTP API.                                                                              |
| Cart / checkout / orders / restock | `lib/cart.ts`, `CreateOrderDto`, `RestockRequest`                                                                                                                                                                   | Key on `productId` (id). Must stay id-based; not URLs.                                                                                           |
| Dashboard                          | `dashboard/[slug]/products/[productId]`                                                                                                                                                                             | Private, id-based. Out of scope, leave as is.                                                                                                    |
| Sitemap                            | `apps/web/lib/sitemap/*`                                                                                                                                                                                            | Lists stores only, no product URLs. Products are discoverable only via store page JSON-LD, search and external links.                            |
| Existing slug helper               | `packages/utils/src/strings` `slugify`                                                                                                                                                                              | `/[^a-z0-9]+/g → "-"`. Used by stores and collections.                                                                                           |

## Findings

1. **ID-as-URL.** 25-char opaque cuid in a user-visible, shareable URL. Hurts
   shareability (WhatsApp/Instagram links, the primary sales channel here) and
   gives search engines no keyword signal.
2. **Existing `slugify` is unfit for product names.** It drops every non-ASCII
   character: `slugify("Café Örnek") === "caf-rnek"`, and a Korean/Japanese name
   such as `뉴진스 앨범` becomes `""`. The target niche is K-pop merch, so
   non-Latin and mixed names are common. The new generator must keep Unicode
   letters/numbers instead of dropping them. It also must not be changed in
   place: store and collection slugs depend on its current output.
3. **No uniqueness story.** Names repeat inside a store (variants of the same
   album, restocks, "Photocard set"). A name-only slug needs a deterministic
   collision suffix and a race-safe write (`@@unique([storeId, slug])` plus
   retry on `P2002`).
4. **Links already in the wild.** Existing cuid URLs have been shared and
   indexed (canonical tags, JSON-LD). Any new scheme must keep them working and
   redirect to the canonical slug URL (308), or they 404 / duplicate content.
5. **Slug vs cuid ambiguity.** If one route accepts both, a product whose slug
   happens to look like a cuid (`c` + 24 lowercase alphanumerics) could be
   confused with an id. Generated slugs must never be cuid-shaped, and the
   resolver tries slug first, then id, both scoped by `storeId`.
6. **Rename policy.** Regenerate-on-rename breaks every shared link unless old
   slugs redirect; there is no reliable "never published" signal to allow a
   draft exception. Decision: slug set at creation, never changed by the system.
7. **Blue/green deploy constraint.** `deploy.sh` runs migrations in the
   candidate phase while the old API is still live (see
   `docs/core/blue-green-migrations.md`; the destructive gate does not catch
   `SET NOT NULL`), and old code does not write `slug`. A NOT NULL column added
   in one step would break product creation during the window. Needs
   expand/backfill/contract.
8. **Soft delete.** Deleted products keep their row. Whether their slug stays
   reserved affects collision behaviour and restoring.
9. **Other writers.** The planned catalog JSON import
   (`.artifacts/2026/10/20261020--catalog-json-export-import/audit.md`) will
   create products in bulk; it must go through the same slug allocator, and the
   slug is informational in the export format and never overrides an existing
   product's slug on import.
10. **Codegen churn.** Response DTO changes require regenerating the committed
    `apps/api/openapi.json` and `packages/types/generated/**`.
11. **No SEO surface for products.** Product URLs are in no sitemap, and the
    product page sets only `title` and `alternates` (no description, Open
    Graph/Twitter image, `BreadcrumbList`, or noindex for non-indexable stores,
    unlike the store page). A readable URL alone gives little organic gain
    without these; they are in scope (plan §8).

## Options considered

| Option                                                      | URL example                      | Verdict                                                                                           |
| ----------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| A. Name slug only, unique per store, id fallback for legacy | `/product/get-up-album`          | **Chosen.** Cleanest; store scoping makes collisions rare and a suffix handles them.              |
| B. `slug-<shortid>` (Shopify/Medium style)                  | `/product/get-up-album-8qh3zc`   | Collision-free and rename-proof, but less pretty than asked. Rejected; collisions get `-2`, `-3`. |
| C. Seller-editable slug from day one                        | any                              | Valuable, but adds UI/validation. Deferred; schema supports it.                                   |
| D. Keep ids, just prettify with a decorative prefix         | `/product/get-up-album/cmvft...` | Still ugly and still long. Rejected.                                                              |

## Recommendation

Add a persisted, per-store-unique `Product.slug` generated from the name, with a
Unicode-aware generator (diacritics folded, Hangul/kana kept, `item` fallback),
deterministic collision suffixes, and a legacy id fallback that 308-redirects to
the canonical slug URL. The slug is set at creation and never changed by the
system. Details, rollout and tests are in the plan.
