# Readable product URLs (`Product.slug`)

Status: proposed. Audit: `audit.md` (same folder). Handoff: `handoff-prompt.md`
(same folder). Scope includes the SEO work in §8 (sitemap, metadata, noindex
parity, breadcrumbs), not just the URL change.

## Why

Public product URLs end in the raw cuid
(`/store/korealexa/product/cmvftk21w001e01ny8qh3zc3q`). Products are already
scoped to a store, so a name-derived slug is unique enough and far better for
sharing (WhatsApp/Instagram) and SEO: `/store/korealexa/product/get-up-album`.

## Goals

- Product URLs are `/store/:storeSlug/product/:productSlug`, slug derived from
  the product name, unique per store.
- Every existing cuid URL keeps working and 308-redirects to the slug URL.
- Product pages are discoverable and well represented in search and social: in
  the sitemap (only when their store is indexable), with a description, Open
  Graph/Twitter image, breadcrumbs, and noindex parity with the store page (§8).
- Any name (Latin, accented, Hangul, kana, emoji-only) yields a valid slug.
- No downtime or failed writes during the blue/green rollout.

## Non-goals

- Seller-editable slugs (schema allows it; UI is a follow-up). `slug` must NOT
  be added to `CreateProductDto`/`UpdateProductDto` (`forbidNonWhitelisted`
  keeps it unwritable; `ProductsService.create/update` spread the DTO into
  Prisma, so adding it there would silently make it writable).
- Dashboard routes, cart, orders, restock: stay id-based.
- Changing `slugify` in `@biasmarket/utils/strings` (stores/collections depend
  on its exact output).

## Decisions

### 1. Column

`Product.slug String?` in Release 1, `String` (NOT NULL) in Release 2.
`@@unique([storeId, slug])` (same shape as `Collection`; its leftmost prefix
makes the existing `@@index([storeId])` redundant, leave that index alone).
Soft-deleted products keep their slug reserved: the allocator never filters
`deletedAt`. Consequence: a deleted product's slug is burned until a hard purge.
A soft-deleted product's slug URL and its cuid URL both 404 (no redirect).

### 2. Generator

New `productSlug(name, maxLen = 60)` in `packages/utils/src/strings`, exported
via the existing `@biasmarket/utils/strings` entry (api, backfill and seed
import it from there; never copy it; web does not need it). Separate from
`slugify`. Slugs never contain `.` (step 4 turns it into `-`); do not loosen the
character class, because `apps/web/proxy.ts` (next-intl) skips paths with a dot.

Pipeline:

1. `normalize("NFKD")`, strip **only** Latin combining diacritics
   (`/[\u0300-\u036f]/g`, `é → e`), then `normalize("NFC")` so Hangul syllables
   and kana voiced marks recompose. Do not strip all `\p{M}`: that turns
   `がっこう` into `かっこう` and breaks Thai/Devanagari vowel signs.
2. Lowercase (`toLowerCase()`; `ẞ → ß`).
3. Map letters with no decomposition (after lowercasing, so `Ørsted`, `ÆON`,
   `Łódź` work): `ß→ss ø→o æ→ae œ→oe đ→d ł→l þ→th ð→d`.
4. Replace every run of chars that is not `\p{L}`, `\p{N}` or `\p{M}` (flag `u`;
   `\p{M}` is kept so Thai/Devanagari vowel signs survive, Latin marks are
   already gone after step 1) with `-`. Emoji, symbols, variation selectors and
   punctuation become separators. Hangul, kana, Han, Cyrillic etc. are **kept**:
   `뉴진스 앨범` → `뉴진스-앨범`. Browsers show it decoded; it is
   percent-encoded on the wire. Trim hyphens.
5. Truncate by code points (`Array.from`) to `maxLen`, preferring the last
   hyphen boundary if one exists past half of `maxLen`, otherwise hard-cut;
   re-trim trailing hyphen.
6. Empty result, or a result with no `\p{L}`/`\p{N}` at all (emoji-only,
   symbols-only, a lone combining mark) → `item`.
7. If the result matches the cuid shape `^c[a-z0-9]{24}$`, append `-product`
   (shared `isCuidShaped` helper; applied after truncation).

Suffix room: compute `full = productSlug(name, 60)`. Candidate `k ≥ 2` is
`trim(full, 60 - len("-k")) + "-k"` (re-trim a trailing hyphen; each candidate
computes its own trim since the suffix length changes at 10 and 100). Final
slugs are ≤ 60 code points. The cuid guard applies only to the bare base;
suffixed candidates can never be cuid-shaped. Generated slugs are therefore
never cuid-shaped and never empty, so the Release 2 CHECK constraint cannot
reject a service write (tested).

### 3. Allocator and race handling

`allocateProductSlug(client, storeId, name, taken?: Set<string>)`,
**framework-free, in `packages/utils`** as `@biasmarket/utils/product-slug`
(`packages/utils/src/product-slug/index.ts`, importing the generator via
`../strings/index.js`; `productSlug` and `isCuidShaped` live in the existing
`src/strings/index.ts`), taking a structural `{ product: { findMany } }` client.
`ProductsService`, the seed and the backfill all import it from there. It cannot
live in the Nest products module: scripts in `apps/api/scripts` run under plain
`node script.ts` and cannot load `src/*.module.ts` or `.js`-specifier source
imports (see the generate-openapi script comment). `packages/utils` exports
`./dist/*`, so build it before running scripts.

- Compute `base`. Probe candidates `base, base-2, … base-N` (N = 10 at a time)
  with
  `findMany({ where: { storeId, slug: { in: candidates } }, select: { slug: true } })`
  (no `startsWith`, so `item` never matches `items`/`item-shirt`); pick the
  first free. A name like "Album 2" colliding with the suffix of "Album" is
  handled the same way (the candidate is just taken, move on).
- Allocation does **not** filter `deletedAt`.
- Optional `taken` set: candidates in it are skipped in addition to the DB
  probe, and the chosen slug is added to it. The backfill (loads a store's slugs
  once) and the catalog import (slugs allocated earlier in the batch) pass it;
  request-path creates omit it.

Retry: Postgres aborts a transaction after a unique violation, so a retry inside
the same `$transaction` is invalid. The retry loop wraps the **whole**
`$transaction` in `ProductsService.create` (max 5 attempts, re-running the
allocator each time) and only retries `Prisma.PrismaClientKnownRequestError`
`P2002` that concerns the slug constraint. Under Prisma 7 `adapter-pg` the error
is `PrismaClientKnownRequestError` with `code === "P2002"` and **no
`meta.target`**; the detail is
`meta.driverAdapterError.cause = { kind:
"UniqueConstraintViolation", constraint: { fields: [...] } | { index:
"Product_storeId_slug_key" }, table }`.
Match `code === "P2002"` and `cause.kind === "UniqueConstraintViolation"` and
(`constraint.fields` includes `"slug"` or the index name contains
`storeId_slug`), with `meta.target` as a fallback. The e2e race test pins the
exact form.

### 4. Slug stability

`slug` is assigned once at creation and never changed by the system. Renaming
does not change it (including drafts: there is no reliable "never published"
signal). The slug may drift from the name; accepted. If seller-editable slugs
ship later, changing a slug must record the old one in a redirect table. A
catalog import of an existing product never touches its slug; only new rows get
one.

### 5. Resolver and route

Rename the web segment to `[productSlug]` (folder
`app/[locale]/(storefront)/store/[slug]/product/`; move
`product-detail-view.tsx` and its test with it). API
`GET /api/stores/:slug/products/:productRef/public`:

- Normalize the ref first. Nest/Express already percent-decodes the path param,
  so the API only applies `.normalize("NFC")` (no second `decodeURIComponent`: a
  literal `%` would throw); the web layer decodes Next's possibly-encoded param
  and sends `encodeURIComponent(decoded)`. Browsers/chat apps may send NFD
  Hangul. Use the lowercased ref for the slug lookup only and the NFC (not
  lowercased) ref for the id lookup (seed ids may contain uppercase).
- Resolve the store, then
  `findUnique({ where: { storeId_slug: { storeId, slug:
  ref } } })`; on a
  miss, fall back to `findFirst({ where: { id: ref, storeId } })`. A generated
  slug can never equal a real id (cuid guard; seed ids like
  `seed:batch:product:x` contain `:`), so there is no shadowing and no regex
  dependency in the lookup.
- `storeId` is in the `where` clause in both lookups (not a post-check), then
  the existing `PUBLISHED / deletedAt === null / !discontinued` checks apply.
- Response `product` includes `slug`.
- Renaming the Nest param `:productId → :productRef` changes the path parameter
  name in the committed `openapi.json`/SDK; HTTP URLs are unchanged.

Web page (`product/[productSlug]/page.tsx`):

- Wrap the fetch in React `cache()` so `generateMetadata` and the page share one
  request.
- Missing/unavailable product → call `notFound()` (HTTP 404, today it renders a
  "not found" paragraph with 200). `generateMetadata` returns `robots: noindex`.
- Params: Next may pass the percent-encoded segment. `safeDecode` it
  (`decodeURIComponent`, `URIError` → `notFound()`), `.normalize("NFC")`, and
  call the API with `encodeURIComponent(decodedRef)` (the current page
  interpolates the raw value). Compare the decoded/NFC ref to `product.slug`.
- If `product.slug` is non-null and the ref differs from it (legacy id, case
  difference, NFD form) → 308 to the canonical URL. Never redirect when
  `product.slug` is null (Release 1 window). Redirect-loop guard test: a Hangul
  slug arriving percent-encoded must not redirect.
- Redirect mechanics: `permanentRedirect` from `next/navigation` (308). The
  next-intl `redirect` in `@/i18n/navigation` is a 307 and has no permanent
  variant. `i18n/routing.ts` has no `pathnames`, so `getPathname.href` is a
  string or `{ pathname, query }`: build
  `getPathname({ href: { pathname:`/store/${storeSlug}/product/${encodeURIComponent(slug)}`, query }, locale })`
  yourself (encode the slug, pass `searchParams` as `query`; `searchParams` is a
  Promise in Next 16, await it). The redirect must run in the page before any
  streaming/`loading.tsx` boundary, otherwise Next falls back to a meta-refresh
  with a 200; verify with `curl -I`.
- Canonical, `localeAlternates`, `og:url`/metadata and JSON-LD all use
  `product.slug`, with the segment percent-encoded (`encodeURIComponent`). Three
  occurrences in the product page (lines ~45, 46, 77) plus the store page
  JSON-LD (`store/[slug]/page.tsx:203`).
- `product-detail-view.tsx` (same folder) keeps using `product.id` for
  cart/restock.

### 6. Expose slug (exact DTOs)

- `ProductResponseDto` (`products/dto/product-response.dto.ts:64`; mapper
  `toProductDto`, `products.controller.ts:79`).
- `PublicProductWithVariantsResponseDto`
  (`stores/dto/store-response.dto.ts:223`, mapper `toPublicProductDto` in
  `stores.controller.ts`). This also feeds `SectionCollectionProductResponseDto`
  (nested `product`), the store page and `hydrate-sections`; no separate section
  field is needed.
- `ProductSearchResultResponseDto`
  (`products/dto/product-search-response.dto.ts`) and `PRODUCT_SELECT` in
  `product-search.service.ts`.
- `OrderProductResponseDto` (`orders/dto/order-response.dto.ts`; mapper
  `toOrderProductDto` in `orders/infrastructure/order.controller.ts` spreads the
  row): decide explicitly; default is to expose it too for consistency so the
  SDK does not drift silently.
- Seller `ProductInCollectionResponseDto` (collections): no change.
- Every Prisma `select` that feeds these must include `slug`; a missing select
  silently yields `undefined` and the UI would fall back to ids unnoticed. A
  test asserts no public link contains a cuid once slugs exist.
- Regenerate:
  `pnpm --filter api generate:openapi && pnpm --filter
  @biasmarket/types generate`,
  commit `apps/api/openapi.json`, `apps/api/src/metadata.ts` (if changed) and
  `packages/types/generated/**`. Verify with `git diff --exit-code` after
  regenerating. Regenerate again in Release 2 (nullable → non-null).

### 7. Web link helper

`productPath(storeSlug, product)` in `apps/web/lib` returns
`/store/${storeSlug}/product/${product.slug ?? product.id}` (the `?? id` is
removed in Release 2). Used by: `components/storefront/product-card.tsx`,
`features/landing/components/product-grid-card.tsx` (also reached by
`trends-section` and `discover-section`), `search-page-client.tsx`, and the
store-page JSON-LD. It must not import the generator or anything from
`packages/db`.

### 8. SEO: sitemap, metadata, indexability

Today product URLs are in no sitemap and the product page has only `title` +
`alternates` (no description, no Open Graph/Twitter image, no breadcrumb, no
noindex handling). See the GSC plan
(`.artifacts/2026/09/20260907--gsc-indexing-audit-organic-growth/plan.md`: Tier
1 social-image gap, Tier 3 breadcrumb gap).

**Sitemap source `products`**

- API (stores module, same guards and pagination as the store sitemap:
  `SitemapInternalTokenGuard`, `ThrottlerGuard`, `parseSitemapPagination`):
  `GET /api/stores/internal/sitemap/products/count` → `{ total }` and
  `GET /api/stores/internal/sitemap/products?limit&offset` →
  `{ items: [{ storeSlug, slug, lastModified }], total }`. New DTOs next to
  `SitemapStoreItemDto`; mirror exactly how the store sitemap routes are
  documented/excluded in OpenAPI, then regenerate OpenAPI/SDK.
- Eligibility, one shared `where` used by count and page so they cannot drift:
  `status = PUBLISHED`, `deletedAt = null`, `discontinued = false`,
  `slug IS NOT NULL`, and `store` matching `PUBLIC_STORE_VISIBILITY` +
  `SITEMAP_INDEXABLE_STORE_WHERE` (import `PUBLIC_STORE_VISIBILITY` from
  `common/public-store-visibility.ts` and `SITEMAP_INDEXABLE_STORE_WHERE` from
  `common/store-indexability.ts`; no copied predicate). Sold-out products stay
  listed (the page stays valid and is the restock-interest entry point).
- Order `[createdAt asc, id asc]` for stable offset pagination; `lastModified` =
  `Product.updatedAt` (new column, see Rollout). Bump rules: `@updatedAt`
  already fires on every `product.update` (publish, update, soft-delete,
  `addImage`/`removeImage`/`reorderImages`/`clearImages`). The seller variant
  mutations `addVariant`, `updateVariant`, `deleteVariant` and `addVariantImage`
  are plain non-transactional `productVariant.*` calls that change page-visible
  price/name/image/stock, so wrap each in `$transaction` (only the
  `productVariant.*` write plus the `product.update` pair; in `updateVariant`
  the `notifications.syncStockAlerts` call and the follow-up `store.findUnique`
  stay outside it) and also run
  `tx.product.update({ where: { id }, data: { updatedAt: new
  Date() } })` (the
  fake `PrismaService` in `products.service.spec.ts` needs a `$transaction` mock
  for these). Order stock reservations (`reserved`) must NOT bump it (order
  churn is not a recrawl hint). Compose the `where` as
  `store: { ...PUBLIC_STORE_VISIBILITY, ...SITEMAP_INDEXABLE_STORE_WHERE }` on
  the Product query (the constants nest fine). The store gate is loose
  (denormalized `publishedProductCount`, loose prose check), so a product can be
  listed while its page is noindex for one cycle, same as stores. The query
  joins `store`; add an index only if EXPLAIN shows a problem
  (`@@index([storeId, status])` exists).
- Web: `lib/sitemap/products-source.ts` modelled on `stores-source.ts` (token
  header, `revalidate: 3600` with its own cache tag `sitemap:products` (do not
  copy the hardcoded `sitemap:stores`), envelope validation, stale-chunk error,
  `chunkEntityRange` with `localeCount`), registered in
  `lib/sitemap/registry.ts`; `productEntry(locale, path, lastModified)` in
  `lib/sitemap/urls.ts` taking the already-encoded path from `productPath`
  (unlike `storeEntry`, which takes a raw slug), `changeFrequency: "weekly"`,
  priority `0.7`; rewrite
  `/sitemap-products-:id.xml →
  /sitemap/products/:id.xml` in `next.config.ts`.
  The sitemap index already emits `sitemap-<id>-<n>.xml` for every registered
  source.
- URL encoding: `<loc>`, hreflang alternates, canonical tag and JSON-LD URL must
  be byte-identical. Build the path once in `productPath` (`encodeURIComponent`
  on the slug) and pass that already-encoded path to `canonicalUrl` /
  `localeAlternates` (neither encodes). `escapeXml` covers the XML layer.
- Routes sit next to the existing `internal/sitemap` routes, before any
  `:slug/…` param route, with `@Public()`, `@Throttle` (60/min), `@ApiHeader`,
  `@ApiQuery`, `@ApiOkResponse` exactly like the store ones (they are documented
  in `openapi.json`, not excluded).
- An empty source emits no index entries (0 chunks), so nothing requests chunk
  0; a stale/out-of-range chunk keeps the existing 503 + Retry-After behaviour
  (intended). A failing source fails the whole index (`Promise.all`); acceptable
  because blue/green pairs `web-<color>` with `api-<color>`.
- Listing is safe before the backfill finishes (`slug IS NOT NULL`) and never
  lists a cuid URL, so it never lists a URL that redirects.

**Product page metadata** (`generateMetadata`)

- `description`: product description, whitespace-collapsed, ≤ 160 code points at
  a word boundary; fallback `"<name> — <store name>"`.
- `openGraph` (`title`, `description`, `url` = canonical,
  `images: [product.images[0]]` when present) and `twitter`
  (`summary_large_image` when an image exists); otherwise the site default.
- `robots: store.indexable === false ? { index: false } : undefined`
  (`=== false`, not `!indexable`, so a stale API during rollout does not noindex
  everything; same rule as the store page: crawlable, no robots.txt disallow).
  Not-found state: `robots: { index: false, follow: false }`. Needs
  `indexable: boolean` on `PublicProductStoreResponseDto`. Implement a private
  `computeStoreIndexable(store, ownerBanned)` in `StoresService` and make both
  `findPublicBySlug` and `findPublicProduct` use it (parity test):
  `findPublicProduct` adds `include: { owner: { select: { banned: true } } }`
  (strip `owner` from the response) and, only when
  `publishedProductCount >=
  MIN_INDEXABLE_PRODUCTS` and bio/aboutMarkdown are
  blank, runs
  `storeSection.findMany({ where: { storeId, hidden: false, type: 'TEXT_BLOCK' },
  select: { content: true } })`
  and applies `textBlockBody`. `findPublicProduct` does not check
  `isPublic`/`isDemo` today (private/demo store products return 200);
  `isStoreIndexable` makes them noindex. Keep that behaviour (no 404 change in
  this work).
- `generateMetadata` stays inline in the page file:
  `apps/web/__tests__/canonical-regression.test.ts` regex-checks `page.tsx` for
  `generateMetadata`, `alternates.canonical` and `languages` (the languages
  check is skipped when `index: false` appears in the file, so keep a separate
  assertion in the metadata test). Do not add a robots.txt disallow.
- JSON-LD: add `BreadcrumbList` (Home → Stores → store → product, same helpers
  as the store page) next to the existing `Product`/`Offer`.
- No invented merchant fields (`brand`, `sku`, ratings) without a real source.

**Store-level gate only:** the store thin-content gate (D5–D7) already decides
whether a store's pages are index-worthy; products inherit it. A product-level
quality bar is a follow-up.

**After shipping:** confirm the index lists `sitemap-products-*.xml`, then watch
GSC Page Indexing for two weeks ("Discovered – currently not indexed",
"Duplicate, Google chose different canonical" on `/product/` URLs) and confirm
no `/product/<cuid>` URL shows as a canonical.

## Rollout (expand → backfill → contract)

Verified in `infra/vps/deploy.sh` (migration phase runs before the candidate
color starts; the old color stays live) and `docs/core/blue-green-migrations.md`
(NOT NULL without default breaks the old color). The destructive gate in
`infra/vps/lib/migrate.sh` (`DROP TABLE|COLUMN|TYPE`, `ALTER COLUMN … TYPE`)
does not catch `SET NOT NULL`, so nothing mechanical protects Release 2: it
needs its own guard.

**Release 1 (expand)**

1. Migration `YYYYMMDDHHMMSS_add_product_slug` (match existing naming): add
   `updatedAt timestamp NOT NULL DEFAULT now()`, followed in the same migration
   by `UPDATE "Product" SET "updatedAt" = "createdAt"` (rewrites every row while
   the old color is live, inside `lock_timeout`; fine at current scale;
   otherwise every existing product gets the migration time as a fake lastmod).
   Schema: `updatedAt DateTime @default(now()) @updatedAt` (the default is
   required so the old color's `product.create` still satisfies NOT NULL; unlike
   other models here that use bare `@updatedAt`; `Store.contentStaleAt`
   deliberately avoids `@updatedAt`, Product differs because it needs a
   Prisma-managed timestamp that also covers every `product.update` path). Feeds
   the sitemap `<lastmod>`; old-color `product.update` leaves it stale during
   the overlap, which is harmless. Add nullable `slug`, `CREATE UNIQUE INDEX` on
   `(storeId, slug)` (NULLs allowed; short write lock on `Product`, fine at
   current scale).
2. API: write slug on create, resolver, DTOs (nullable), seed.
3. Backfill: `apps/api/scripts/backfill-product-slugs.ts` (NOT `packages/db`: it
   has no TS runner and cannot import utils). Pattern follows
   `apps/api/scripts/migrate-buyer-accounts.ts`, with a `package.json` script,
   building `new PrismaClient({ adapter: new PrismaPg(...) })` directly as
   `migrate-buyer-accounts.ts` does (a client without the adapter throws),
   importing the allocator from `@biasmarket/utils/product-slug` (the package
   has no bare `"."` export; only `"./*"` → `dist/*/index.js`). Script entry:
   `"backfill:product-slugs": "node scripts/backfill-product-slugs.ts"`.
   Behaviour: per store, ordered by `createdAt, id` (oldest gets the bare slug),
   **including soft-deleted rows**, load the store's existing slugs once, update
   per row with `updateMany({ where: { id, slug: null }, data })` and skip when
   `count === 0` (a plain `update` with `slug: null` in `where` throws P2025 if
   a concurrent writer already set it) (autocommit or small batches; no giant
   transaction), handle `P2002` by re-allocating, set `updatedAt` explicitly to
   the row's existing value (Prisma's `@updatedAt` would otherwise stamp `now()`
   on every backfilled row and undo the migration's `updatedAt = createdAt` fix;
   test it), dry-run by default with `--apply` (same convention and
   production-sign-off warning as `migrate-buyer-accounts.ts`), log counts.
   Idempotent and resumable. Not run inside a Prisma migration (it would execute
   with `lock_timeout` while the old color is live). Add the run step to
   `docs/core/deploy.md`.
4. Web: route rename, redirect, `productPath`, `notFound()`, §8 metadata, and
   the `products` sitemap source (API endpoints included in this release).
5. **Ordering:** run the backfill after the switch **and** after the old color
   is drained, then re-run once, then verify
   `SELECT count(*) FROM "Product" WHERE slug IS NULL` = 0. Old-color writes
   between the migration and the drain create NULL-slug rows, so a single early
   run is not enough.

**Release 2 (contract)** — separate deploy, only after the check above passes:
migration starts with a guard
`DO $$ BEGIN IF EXISTS (SELECT 1 FROM "Product" WHERE slug IS NULL) THEN RAISE EXCEPTION 'product slugs not backfilled'; END IF; END $$;`
then `SET NOT NULL`, plus `CHECK (slug <> '' AND slug !~ '^c[a-z0-9]{24}$')`.
DTOs become non-nullable, SDK regenerated, `?? id` removed. Rollback target is
Release 1 code, which writes slugs, so it is safe.

The id fallback in the resolver stays indefinitely (external links).

## Other writers

- `apps/api/scripts/seed/helpers.ts:315` `ensureProduct` does
  `prisma.product.upsert` (called from `seed/apply.ts:128`; `pnpm seed:base` /
  `seed:append`). It must use the shared allocator but stay idempotent: read the
  existing row first; if it already has a slug keep it and leave `slug` out of
  `update`, otherwise allocate and set it (an `upsert` rerun would otherwise see
  its own slug taken and produce `-2`). Grep pattern for other writers:
  `product\.(create|upsert|createMany)` across `apps packages` (not only
  `test`).
- Catalog JSON import
  (`.artifacts/2026/10/20261020--catalog-json-export-import/audit.md`) must use
  the same allocator with a batch-aware in-memory set; export includes `slug` as
  informational only; import never trusts it and never changes an existing
  product's slug.
- No product URLs exist in emails, WhatsApp templates, notifications, workers,
  the mobile app or OG images (checked).

## Tests

- `packages/utils/src/strings/index.test.ts`: `productSlug` — kana (`がっこう`,
  `ガ`, `ぱ` unchanged), property: no output is ever empty or cuid-shaped,
  60-char base colliding up to `-12` stays ≤ 60, accents, `Søren`, `Ørsted`,
  `ÆON`, `Łódź`, Thai and Devanagari keep their vowel signs (assert the exact
  output: NFKD compat-decomposes Thai sara am `ำ` to `ํา`, which NFC does not
  recompose; accepted, since app-generated slugs are always served in that form
  and the resolver 404s only on hand-typed input), lone combining mark → `item`,
  `ß`, mixed Latin/Hangul, Hangul-only kept, emoji-only → `item`, cuid-shaped →
  `-product` (also after truncation), single 80-char token hard-cut, code-point
  truncation, suffix room (`base-12` ≤ 60), empty string.
- API unit (`products.service.spec.ts`; fake `PrismaService`): existing
  `toHaveBeenCalledWith({ data })` create assertions updated for `slug`;
  collision → `-2`, `-3`; deleted rows still count; retry wraps the whole
  `$transaction` (mock `create` rejecting with a P2002-shaped error, assert a
  fresh transaction + re-allocation); rename keeps slug; ownership still
  enforced; `slug` rejected by the DTO whitelist.
- Sitemap: API unit/e2e (extend `stores-sitemap.e2e-spec.ts`): count and page
  agree, excludes draft/deleted/discontinued/NULL-slug products, banned-owner,
  non-indexable, private and demo stores; stable order across pages; token guard
  enforced; pagination bounds. Web: `products-source` unit test (envelope
  validation, chunk math for 2 locales, stale chunk), `urls` test (Hangul slug
  encodes identically in `<loc>`, alternates and the page canonical), registry
  test, `route.test.ts` for `/sitemap/products/0.xml`, index lists the products
  chunks.
- Backfill leaves `updatedAt` unchanged.
- `lastModified`: `addVariant`/`updateVariant`/`deleteVariant`/`addVariantImage`
  bump `Product.updatedAt`; an order stock reservation does not; migration sets
  existing rows' `updatedAt = createdAt`.
- `computeStoreIndexable` parity between `findPublicBySlug` and
  `findPublicProduct`, including the TEXT_BLOCK-only-prose store and
  `hidden: true` sections.
- Update `app/sitemap.xml/route.test.ts` (fixed fake sources: add `products`,
  cover one failing source → 503) and keep the sitemap `[source]/[id]`
  `route.test.ts` in step with the registry.
- Metadata: description truncation, OG image present/absent, noindex when
  `store.indexable === false`, BreadcrumbList content, canonical equals the
  sitemap `<loc>`.
- API unit (`stores.service`): `findPublicProduct` by slug (case-insensitive),
  by legacy id (including a NULL-slug product fetched by id, and seed-style
  non-cuid ids), NFD Hangul ref at the API layer (percent-decoding is exercised
  in the web page test), other store's id/slug → 404, unpublished / deleted /
  discontinued → 404.
- API e2e (`stores.e2e-spec.ts`, `products.e2e-spec.ts`,
  `product-search.e2e-spec.ts`; `schema-assert.ts` checked for the new
  column/index): same-name products in one store and across stores; **a
  concurrent same-name create race** (pattern: `coupon-redeem-race.e2e-spec.ts`,
  `buyer-proof-submit-race.e2e-spec.ts`) — the only place the real unique
  constraint and `P2002` shape are covered; search returns `slug`; public fetch
  by slug and id; soft-delete then re-create same name gives `-2`.
- Backfill: idempotency, collisions, soft-deleted rows, multi-store, concurrent
  writer (`slug IS NULL` guard), dry-run.
- Web (vitest/jsdom, mock `next/navigation`): `productPath`; page 308s id → slug
  with locale and query string preserved; no redirect when `slug` null;
  `notFound()` on missing; canonical/JSON-LD use the slug; update
  `product-json-ld.test.ts` (hard-codes `/product/product-1`),
  `cart-link.test.tsx`, product-card and `hydrate-sections.test.ts` fixtures.
  Optional Playwright smoke (`e2e/smoke.spec.ts`) for the redirect.
- Gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm --filter api
  test:e2e`, regenerate OpenAPI + SDK then
  `git diff --exit-code
  apps/api/openapi.json packages/types/generated`.
  Branch from clean `main`. CI path filters: the `web` job does not rerun on
  `packages/utils`-only changes, so the web changes and `packages/types` must be
  in the same PR.
- No i18n strings are added.

## Docs to update when implementing

PR 1: `docs/core/deploy.md` (backfill step), `docs/core/architecture.md`
(product slug / URL scheme, product sitemap source), optionally
`docs/core/blue-green-migrations.md` (worked example). PR 2: architecture.md
touch-up (non-null slug) and flip this plan's `Status:` to `implemented`.

## Risks and mitigations

| Risk                                | Mitigation                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Slug/id ambiguity                   | Generated slugs are never cuid-shaped or contain `:`; lookup is slug first, id fallback, both `storeId`-scoped. |
| Concurrent same-name creates        | DB unique + retry around the whole transaction; e2e race test.                                                  |
| Link rot on rename                  | Slugs are immutable in v1.                                                                                      |
| Duplicate content / lost SEO        | 308 to canonical, canonical tag, internal links on slugs, `notFound()` 404s.                                    |
| Deploy-window NULL slugs            | Nullable column, backfill after drain + re-run, guarded Release 2.                                              |
| Long percent-encoded Hangul URLs    | 60 code-point cap; browsers display decoded. Revisit if chat apps look bad.                                     |
| Slug burned by soft-deleted product | Accepted; hard purge frees it.                                                                                  |

## Follow-ups

- Seller-editable product slug (+ old-slug redirect table).
- Product-level quality gate for sitemap/indexing (min description or image) if
  GSC reports thin-product problems.
- `AggregateRating`/richer merchant fields once real data exists.
- Optional romanization of Hangul/kana if percent-encoded URLs prove ugly.
