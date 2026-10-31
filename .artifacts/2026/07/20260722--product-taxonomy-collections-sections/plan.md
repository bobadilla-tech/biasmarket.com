# Product taxonomy, collections, store layout, and sitemap indexing

## Context

Product modeling was flat and partly unwired: `Product.categoryId` existed on
the schema but no API ever set it (grepped zero hits), `Category` had no CRUD
surface at all, `ProductVariant` had no way to express attributes like member/
version/condition, and there was no concept of Collections or a storefront
layout system — the storefront rendered a single flat product grid straight from
`Store.products`. The sitemap (landed in 5cc4509) was a single flat file
covering only store pages, with no 50k-URL index splitting.

Went from that to: a real category tree, many-to-many product↔category
assignment, free-form JSON variant attributes, user-curated Collections, an
ordered Store Section layout system (collection/banner/text-block), a
sections-first public storefront read model, and a sitemap index built on Next's
`generateSitemaps()`.

Scope was approved in full up front (schema + API + storefront + sitemap
together) rather than phased, since the product is pre-launch private beta —
breaking the existing `Category` table and wiping its data was explicitly
authorized, so no additive/backward-compatible migration path was needed.

## Decisions

- **Category becomes a self-relation tree + many-to-many join, breaking the old
  model.** Old `Category` was flat (`@@unique([storeId, name])`) with a single
  `Product.categoryId` FK that no API ever populated. Replaced with
  `Category.parentId` (self-relation) and a `ProductCategory` join table.
  Dropped the old unique constraint (too strict once nested — the same name can
  exist under different parents) in favor of
  `@@unique([storeId, parentId, name])`. Migration is a genuine breaking change
  (drops `Product.categoryId`) — acceptable since there's no meaningful prod
  data yet.
- **Variant attributes are a free-form `Json` field, not a typed schema.**
  Matches the product spec's own instruction ("use JSON, avoid rigid schema").
  `attributes: Json @default("{}")`, e.g.
  `{"member": "Jungkook", "version": "A"}`. Not queried/filtered against yet —
  storage only, filtering is an explicitly deferred future extension.
- **Collections get a `slug` field even though the source spec didn't ask for
  one.** Cheap to add at migration time, expensive to retrofit once URLs exist;
  needed for a future SEO-friendly collection landing route.
- **Store Section `content` is a single `Json` blob instead of a typed variant
  per section type.** Same "don't overbuild a schema" reasoning as attributes —
  `BANNER`/`TEXT_BLOCK` payloads live in `content`, `collectionId` is a plain
  nullable column used only when `type = COLLECTION`, rather than modeling
  subtypes.
- **Reorder endpoints (`collections/:id/products/reorder`, `sections/reorder`)
  take the full ordered ID array and rewrite every `position`** in one
  transaction, rather than fractional-position inserts. Simpler and correct at
  the scale a single seller's storefront needs; no drag-and-drop library in the
  dashboard UI either — up/down buttons only, matching the "no page builder"
  principle from the spec.
- **Public storefront read model is sections-first with an implicit fallback.**
  `findPublicBySlug` now returns `{ store, sections }` (was
  `{ store, products }`) — sections ordered by `position`, each `COLLECTION`
  section resolving its collection's ordered, published-only products. Stores
  with zero configured sections (every pre-existing store, and any new store
  before a seller sets up layout) get one synthesized "all published products"
  section server-side, so nothing renders blank and no backfill migration was
  needed.
- **Collection/category landing pages and product-detail pages are deferred.**
  No `/store/[slug]/collections/[slug]` or `/products/[id]` route exists yet —
  collections render inline via sections on the store homepage. Sitemap entries
  for collections/products are therefore also deferred (an unlinked sitemap
  entry pointing at a nonexistent route is worse than no entry); the backing
  `GET /stores/collections/public` endpoint was still built since it's cheap and
  unblocks that follow-up.
- **Sitemap switched to `generateSitemaps()` + chunked `sitemap.ts`** (Next's
  built-in multi-file API) instead of hand-rolled 50k-URL slicing logic. Checked
  `node_modules/next/dist/docs` first per this repo's Next-16 warning
  (`apps/web/AGENTS.md`) — confirmed the `id` param is a `Promise<string>` in
  this version (changed in v16.0.0, was a plain number in older docs/training
  data).

## What changed

**Schema** (`packages/db/prisma/schema.prisma`, migration
`20260722224013_product_taxonomy_layout`)

- `ProductVariant.attributes Json @default("{}")`.
- `Category.parentId` self-relation (`CategoryTree`), replaces
  `@@unique([storeId, name])` with `@@unique([storeId, parentId, name])`.
- New `ProductCategory` join (replaces `Product.categoryId`).
- New `Collection`, `CollectionProduct` (position-ordered join).
- New `StoreSection` (`type: COLLECTION | BANNER | TEXT_BLOCK`, `collectionId?`,
  `content: Json`, `position`).
- `Store` gains `collections`/`sections` relations.

**API** (`apps/api/src/modules/`)

- New `categories/` — `stores/:storeId/categories` CRUD. Delete blocked (409) if
  the category has children or assigned products.
- New `collections/` — `stores/:storeId/collections` CRUD +
  `POST/DELETE .../products` + `PATCH .../products/reorder`. Slug derived from
  name via the existing `slugify` util, 409 on collision.
- New `store-sections/` — `stores/:storeId/sections` CRUD + `PATCH /reorder`.
  Validates `collectionId` is required and store-scoped when
  `type = COLLECTION`.
- `products/` — `CreateProductDto`/`UpdateProductDto` gained
  `categoryIds?: string[]` (validated against the store, synced via
  `ProductCategory` in a transaction); `CreateVariantDto` gained
  `attributes?: Record<string, string>`.
- `stores/stores.service.ts` — `findPublicBySlug` rewritten to the
  sections-first model described above; added `findCategoriesPublic(slug)` and
  `findCollectionsPublic()`; new public endpoints
  `GET /stores/:slug/categories/public` and `GET /stores/collections/public`.
- `app.module.ts` registers the three new modules.

**Web** (`apps/web/`)

- `app/[locale]/(storefront)/store/[slug]/page.tsx` — renders `store.sections`
  in order (collection grids / banner images / text blocks) instead of a flat
  `store.products` grid; JSON-LD and metadata product counts now flatten
  products across sections.
- New dashboard pages: `dashboard/[slug]/categories`,
  `dashboard/[slug]/collections` (add/remove/reorder products via up/down
  buttons), `dashboard/[slug]/sections` (create by type, reorder, delete);
  shared `dashboard-nav.tsx` cross-links the four dashboard pages (previously no
  nav existed between them at all).
- `dashboard/[slug]/products/page.tsx` — category checkboxes on the create form;
  inline expandable variant management per product row (name/stock/
  price-override/attributes key-value repeater) — there was previously no
  variant UI anywhere in the dashboard despite the API supporting variants.
- `app/sitemap.ts` — `generateSitemaps()` + chunked `sitemap()` (50k URLs/
  file), same static+store entries as before, restructured to slice a shared
  `getAllEntries()` list per chunk.
- `packages/i18n/{en,es}/dashboard.json` — new `nav`, `variants`, `categories`,
  `collections`, `sections` keys.

**Incidental fix**: `product-card.tsx` had `images: []` (an empty-tuple type,
not `string[]`) — a pre-existing bug unrelated to this work, fixed because it
blocked `tsc --noEmit`.

## Verification

- `pnpm turbo run typecheck --filter=api --filter=web` — clean.
- `pnpm --filter api test` — 105 passing, including new
  `categories.service.spec.ts`, `collections.service.spec.ts`,
  `store-sections.service.spec.ts` (ownership checks, reorder-rewrites-
  position, delete-blocked-by-children/products, slug-collision 409,
  COLLECTION-type-requires-collectionId).
- `pnpm --filter web test` — passing.
- `pnpm turbo run build --filter=api --filter=web` — both build clean; confirmed
  `/sitemap/[__metadata_id__]` → `/sitemap/0.xml` in the Next build output.
- Booted the compiled API standalone (dummy S3 env, alt port) and hit the
  new/changed endpoints against the real dev DB: `GET /stores/public`,
  `GET /stores/collections/public`, `GET /stores/:slug/categories/public` (404
  for a nonexistent slug), and — the highest-risk piece —
  `GET /stores/smoke-test-store/public` against an existing store with no
  sections configured, confirming the implicit fallback section correctly nests
  its one published product with a valid `attributes: {}` default from the
  migration.
- Not done: no manual dashboard click-through (create a category tree, build a
  collection, wire up sections, verify drag-free reorder persists) and no visual
  check of the storefront section rendering in a browser — logic was verified
  via the API smoke test above and unit tests, not via the UI.
