# Homepage issue batch — #167 / #166 / #165

Written **before execution**, at the user's explicit request (deviates from this
directory's usual "record after the work lands" convention — see
`docs/plans/README.md`). Revised after two subagent review rounds (a `file:line`
fact-check against the working tree, plus a senior-review critique).

Every `file:line` below was verified against the working tree on branch
`research/mobile-pre-planning-and-fixes` (tip `127ba37`). That branch is **not
ahead of `main`** (`git log main..HEAD` is empty) — each of the three fixes
below branches off `main` as its own PR; nothing accretes on the research
branch, which the mobile-app plan will also be editing.

## Scope

Three open GitHub issues, all on the public homepage (`/es`,
`apps/web/app/[locale]/(marketing)/page.tsx` → `features/landing`):

| #   | Title                                                         | Surface                          | Type           |
| --- | ------------------------------------------------------------- | -------------------------------- | -------------- |
| 167 | Test/demo stores shown publicly in "Descubre tiendas"         | homepage + `/stores` + `/search` | data + backend |
| 166 | "Biasmarket Blog" carousel has no nav arrows on mobile        | homepage mobile                  | frontend       |
| 165 | Hero "Tu mundo K-Pop" overlaps the "Categorías" heading below | homepage desktop                 | frontend / CSS |

The brief: fix the issues **and** leave each area better than we found it — so
each section has a "Fix" (closes the issue) and a bounded "Quality" pass.

---

## Issue #167 — demo/test stores leak into public listings

The reporter names three public surfaces explicitly: **"Descubre tiendas" en el
homepage, el buscador, y cualquier otro listado público**. The acceptance text
offers either a `is_test`/`is_demo` flag **or** "simplemente cambiarlas a estado
no publicado/oculto".

### Root cause

Two independent gaps, one per surface family.

**(1) Store listings** — homepage "Descubre tiendas" + `/stores` directory.
`fetchFeaturedStores(4)` (`apps/web/features/discovery/server.ts:31-59`) calls
`apiClient.stores.findFeatured` and, because `findFeatured` almost always
returns < 4 (its floor is ≥3 VERIFIED orders in a trailing 30-day window —
`stores.service.ts:172-231`, `MIN_ORDER_COUNT = 3`), **backfills the empty slots
straight from `apiClient.stores.findDirectory`** (`discovery/server.ts:42-52`,
dedup by id, `slice(0, limit)`). Both `findFeatured`'s candidate query
(`stores.service.ts:172-231`) and `findDirectory` (`stores.service.ts:233-255`)
gate only on:

```
isPublic: true
owner: { banned: { not: true } }
products: { some: { status: 'PUBLISHED', deletedAt: null, discontinued: false } }
```

**(2) Product search** — `/search` **and the homepage product rails**
(`fetchProducts(3,"latest")`, `(3,"bestseller")`, `(12,"latest")` in
`discovery/server.ts:61-71`). `ProductSearchService`
(`apps/api/src/modules/products/product-search.service.ts`) gates only on
`store: { owner: { banned: { not: true } } }` — **no `isPublic` filter at all,
today.** So a demo store's one published product shows in `/search` results and
in the homepage "Descubre", "Últimas tendencias" and "Más vendidos" grids
regardless of anything done to the store-listing path. This is also a **latent
pre-existing bug**: an `isPublic: false` store's products are already publicly
searchable.

**Why the junk exists:** `Store.isPublic` **defaults to `true`**
(`packages/db/prisma/schema.prisma:95`); `StoresService.create`
(`stores.service.ts:20-58`) never sets it. Any store a developer made through
the dashboard and gave one published product is indistinguishable from a real
one. The committed seed fixtures already do the right thing — every demo store
is `isPublic: false` (`apps/api/scripts/seed/fixtures.ts:212,637`) — so the
offending `"Tienda"` / `"tienditaUnica"` rows are **hand-created test stores in
the production DB**, not seed data. There is no `isDemo`/`isTest` column on
`Store`.

The real store `KOREALEXA` fails `findFeatured`'s ≥3-order floor, so it only
reaches the homepage via the `findDirectory` backfill — the fix below keeps it
and drops the demo rows.

### Fix

**Step 1 — remediate the production rows (reviewed SQL, not freehand `psql`).**
Put the audit query and the parameterised update in a committed, reviewed file
(`packages/db/scripts/2026-08-31-hide-test-stores.sql`) and run it as the data
step of the Step 2 migration — **not** typed live on the VM.

```sql
-- audit: list every candidate + owner + published-product count
SELECT s.id, s.name, s.slug, s."isPublic", u.email, s."createdAt",
       (SELECT count(*) FROM "Product" p
        WHERE p."storeId" = s.id AND p.status = 'PUBLISHED'
          AND p."deletedAt" IS NULL AND p.discontinued = false) AS pub_products
FROM "Store" s JOIN "User" u ON u.id = s."ownerId"
WHERE s."isPublic" = true
ORDER BY s."createdAt";

-- remediation: only the ids the user confirms as test/demo
UPDATE "Store" SET "isPublic" = false, "isDemo" = true WHERE id IN (...);
```

Set **both** `isPublic = false` **and** `isDemo = true` (belt-and-suspenders — a
single forgotten filter must not re-expose a junk row). Record the confirmed ids
in this doc after the run.

**Step 2 — `Store.isDemo` column + shared `where` fragments.** `isPublic` is a
**seller-owned** setting (a real seller may legitimately un-list their store —
`features/store-settings` → `updateVisibility`, `api/settings.api.ts:20`); it
must not double as "platform-marked junk". Add a distinct platform-owned column:

- `schema.prisma`: `isDemo Boolean @default(false)` on `Store`. Only add an
  index after `EXPLAIN` on a prod-sized copy shows the existing
  `@@index([isPublic, createdAt, id])` (`schema.prisma:115`) isn't enough —
  `isDemo` is low-cardinality and likely filtered post-scan.
- New migration `packages/db/prisma/migrations/<ts>_add_store_is_demo/`, with
  the Step 1 `UPDATE` as its data step.
- **Two fragments in `apps/api/src/common/`** (same home as the cited precedent
  `common/payment-summary.ts` — keeps `products` from source-importing from
  `stores`):
  - `PUBLIC_STORE_VISIBILITY = { isPublic: true, isDemo: false }` — **visibility
    only**, safe to spread into _every_ public read.
  - `PUBLIC_STORE_HAS_LISTABLE_PRODUCT = { products: { some: { status:
    'PUBLISHED', deletedAt: null, discontinued: false } }, owner: { banned: {
    not: true } } }`
    — the "worth showing in a _listing_" predicate,
    `findFeatured`/`findDirectory` **only**.
- Apply `PUBLIC_STORE_VISIBILITY` at **all seven** public read sites so an
  eighth can't silently forget it:
  1. `findFeatured` candidate query — `stores.service.ts:178` (+ the listable-
     product fragment, already there)
  2. `findDirectory` — `stores.service.ts:235` (+ listable-product fragment)
  3. `findAllPublic` — `stores.service.ts:140` (visibility only — do **not** add
     the product/owner predicate here; the sitemap deliberately lists every
     public store)
  4. `findPublicSitemapCount` — `stores.service.ts:146` (visibility only)
  5. `findPublicSitemapPage` — `stores.service.ts:150` (visibility only)
  6. `findCollectionsPublic` — `stores.service.ts:345`
     (`store: { ...PUBLIC_STORE_VISIBILITY }`)
  7. **`ProductSearchService`** — `product-search.service.ts`. There is **one**
     `where` object literal (`:26-41`); it already flows into `count`,
     `findMany`, and `findBestsellers`' `groupBy`
     (`where: { product: where,
     ... }`), so **one** edit covers all three.
     The line already reads `store: { owner: { banned: { not: true } } }` —
     **merge**, don't add a second `store:` key:
     `store: { ...PUBLIC_STORE_VISIBILITY, owner: { banned: { not: true } } }`.
     Closes the `/search` + homepage-rails half of the issue _and_ the latent
     `isPublic:false`-products-searchable bug.
- `findPublicBySlug` (`stores.service.ts:257`) is **deliberately not** filtered
  — a demo store must stay reachable by direct link for QA (same rationale as
  the seed comment at `fixtures.ts:210-211`). The other `:slug`/`:id`-scoped
  public reads — `findCategoriesPublic` (`stores.service.ts:373`),
  `findPublicProduct` (`:382`), and the public config endpoints in
  `payment-config` / `pickup-points` / `couriers` / `delivery-config` — stay
  unfiltered for the same reason (all keyed by a known store, the checkout /
  direct-link surface).
- Seed: switch `fixtures.ts` demo stores to `isDemo: true` (keep
  `isPublic:
  false`) — exercises the new filter in the e2e suite.

**Step 3 (optional — only if the user wants staff control) — admin visibility.**
Not required by any acceptance bullet (bullet 4, "que las tiendas de prueba
nunca lleguen a producción visible", is seed/env hygiene, not a manual toggle).
If wanted, do the **cheap version first**: a read-only "Visibilidad" column in
`admin-stores-table.tsx` (public / unlisted / demo badge). The data is already
there — `StoreWithOwnerResponseDto extends StoreResponseDto`
(`store-response.dto.ts:80`) so it inherits `isPublic` (`:61`); `toStoreDto`
spreads `...row` and `StoreRow` carries `isPublic` (`stores.mapper.ts:24,28`).
Only `isDemo` needs adding to the DTO + mapper. A write toggle (new admin
mutation, `openapi.json` + Orval regen, confirm dialog) is a separate follow-up
— mirror `coupons`' `toggleCouponStatus` endpoint and
`features/admin/mutations/use-toggle-coupon-status.ts` +
`features/admin/api/admin-stores.api.ts` + `adminStoresKeys`. The one existing
admin store endpoint uses `@Roles(['admin'])` (array form,
`stores.controller.ts:185`) — match it. Any new `@Body()` DTO must be a
**value** import, never `import type` (SWC `emitDecoratorMetadata` gotcha — see
`apps/web/AGENTS.md`).

### Quality (adjacent, bounded)

- `discovery/server.ts` — the "featured, then silently backfilled from
  directory" behavior is unnamed and surprising. Rename the export to
  `getDiscoverStores` and finish the half-written doc comment at `:38-41`; don't
  build a server-side `sort=featured` mode in this PR.
- Fold `findFeatured` + `findDirectory`'s now-duplicated
  `PUBLIC_STORE_HAS_LISTABLE_PRODUCT` predicate into the shared fragment
  (Step 2) — visibility and "listable" stay **separate** fragments; do not merge
  them, or the sitemap reads (sites 3–5) start dropping product-less public
  stores.
- `Store.isPublic` default → `false` until first published product: a product
  decision that would turn the "empty store in directory" query guard into an
  invariant. **Flag to the user; do not implement.**
- After demo rows drop out of `findDirectory`, the homepage strip may render 1–2
  stores on a small dataset. Acceptable (the section has an empty state,
  `stores-section.tsx:39,67`) — noted so it isn't re-litigated.

### Tests

- `apps/api/src/modules/stores/stores.service.spec.ts` —
  `describe('findFeatured')` `:481`, `describe('findDirectory')` `:572`. **These
  assert `where` by exact object equality** (`:559-568`, `:616-632`), so adding
  `isDemo` breaks them — update those literals in the same change. Add
  `excludes isDemo stores` cases to both. (`findDirectory`'s `:616` test already
  asserts both `isPublic: true` and `owner.banned` — it is not missing that
  coverage.)
- `apps/api/src/modules/products/product-search.service.spec.ts` (exists, ~218
  lines) — also asserts `where` by exact equality (`:38-48`, `:119-144`); update
  those and add `excludes non-public / isDemo stores` for `search()` and
  `findBestsellers`.
- Snapshot test for `PUBLIC_STORE_VISIBILITY` /
  `PUBLIC_STORE_HAS_LISTABLE_PRODUCT` (pure objects).
- e2e — extend `apps/api/test/stores.e2e-spec.ts` (already hits
  `GET /stores/directory` `:312`, `GET /stores/featured` `:321`,
  `GET /stores/:slug/public` `:222`, admin list `:353`) and
  `apps/api/test/stores-sitemap.e2e-spec.ts`: seed one `isDemo` store, assert
  absent from directory / featured / search / sitemap, present on `:slug`. Each
  new spec signs up its own user (`vitest.config.e2e.ts` runs
  `fileParallelism: false` — better-auth rate limiter).
- `discovery/server.ts` backfill composition is untested
  (`discovery.api.test.ts` only covers the thin wrappers) — add "featured <
  limit → deduped directory backfill, capped at limit" if the rename touches it.

---

## Issue #166 — mobile blog carousel has no navigation arrows

### Root cause

`apps/web/features/landing/components/blog-section.tsx`:

- Mobile block (`:18-36`, `sm:hidden`): a horizontally-scrolling
  `overflow-x-auto` strip of cards, **no arrow controls**. The design spec
  (screenshots on the issue) shows `← →` beneath the strip.
- Desktop block (`:54-66`): renders an `aria-hidden` `CircleArrowLeft` /
  `CircleArrowRight` pair with **no buttons, no handler**, over a static
  `grid grid-cols-4` that shows all 4 hard-coded teasers at once — nothing to
  page.

The **only** real prev/next scroll control on the whole landing page is
`categories-section.tsx:21-89` (`MobileCategoryCarousel`): `useRef` on the
scroller, `scrollByCards(-1|1)` → `scrollBy({ left, behavior: 'smooth' })`,
buttons in a `mt-2 flex justify-end` row. (The trends and stores sections'
arrows are a single decorative `CircleArrowRight` **inside a "Ver más"
`<Link>`**, `trends-section.tsx:72,136`, `stores-section.tsx:63` — not paging
controls. There is no existing desktop scroller pattern to copy.)

### Fix

- **Mobile:** add `scrollerRef` + `scrollByCards` to the `sm:hidden` block and
  render the two-button arrow row beneath the strip, following
  `MobileCategoryCarousel`. Compute the scroll step from
  `scroller.firstElementChild.clientWidth` + the flex `gap` at run time — do
  **not** hard-code a constant (the "reference" hard-codes `240` for a different
  card size; copying that ships a third inconsistent number).
- **Desktop:** **delete** the dead `aria-hidden` `CircleArrow*` block
  (`blog-section.tsx:54-66`) and the now-unused `Image` import (`:3`). Making
  them functional would mean converting the grid to a scroller — a layout change
  the issue doesn't ask for and the mobile-app plan will rework anyway.
- a11y: give the two mobile arrows **distinct** accessible names — add
  `common.carousel.prev` / `common.carousel.next` (`"Anterior"` / `"Siguiente"`)
  to `packages/i18n/{es,en}/common.json` (neither has pagination keys today;
  `storefront.productSearch` has its own `previous`/`next`, deliberately not
  reused cross-namespace). Apply the same keys to the **existing** Categories
  arrows in this PR — `categories-section.tsx:72,80` currently put
  `aria-label={t("title")}` ("Categorías") on _both_ buttons, so a screen reader
  announces "Categorías, button" twice with no direction. That's the whole a11y
  fix; **do not** also extract a shared `<CarouselArrows>` component now (4
  carousels to re-verify for a 15-line fix — leave the extraction to the
  mobile-app refactor that owns these files).
- No disabled-state at scroll extremes and no `aria-live` on scroll — none of
  the existing carousels do this; skip for consistency (stated, not silent). RTL
  is a non-issue (es/en only, both LTR).

### Quality (adjacent)

- Homepage blog cards are **static placeholders** — grey `bg-[#D9D9D9]` boxes,
  titles hard-coded in `packages/i18n/es/landing.json` (`blog.items`). The repo
  has a real Sanity blog: `getBlogPosts()` in `apps/web/features/blog/server.ts`
  — `cache(async (): Promise<BlogPostSummary[]>)`, no args, returns `[]` when
  Sanity is unset or the fetch fails. Wiring the 4 latest real posts (title +
  cover + `/blog/[slug]`) into the section means adding a prop to the currently
  prop-less `"use client"` `BlogSection` and threading `getBlogPosts()` through
  `page.tsx` → `LandingPage` (same shape as `getHomeDiscoveryData()` today).
  **Recommended, but its own PR** — land the arrows first.

### Tests

- `features/landing` has no component tests. Add `blog-section.test.tsx`
  (jsdom): mobile renders two arrow buttons with distinct accessible names;
  clicking "next" calls `scrollBy` with positive `left` (mock
  `HTMLElement.prototype.scrollBy` — jsdom has no layout).
- Add an arrow-accessible-name assertion to a Categories test to lock the a11y
  fix.

---

## Issue #165 — desktop hero overlaps the "Categorías" heading

### Lead hypothesis (confirm in-browser at 1280 / 1366 / 1440 / 1536)

`apps/web/features/landing/components/hero.tsx:43-95` (desktop block,
`hidden … sm:block`):

- Fixed-height box `h-[460px] sm:h-[525px]` with `overflow-hidden` (`:45`).
- Text column `absolute inset-y-0 … flex flex-col … justify-center` with **no
  `z-index`** (`:56`); h1 `whitespace-nowrap` + inline
  `fontSize: clamp(38px, 5.4vw, 78px)` (`:57-65`); subtitle `<p>`
  `clamp(24px, 3.6vw, 52px)` (`:66-74`).
- `h-[99px]` gradient `absolute inset-x-0 bottom-0`, **later in source order**,
  so it paints over the bottom of the text column / CTA (`:90-93`).

Most likely mechanism: the fixed 525px + `overflow-hidden` + `justify-center` +
the un-`z`-ordered 99px gradient clip/cover the subtitle and CTA at the hero's
bottom edge; the reporter reads that as the hero sitting on the heading. The
56px gap to `categories-section` (`px-6 py-8 sm:px-10 sm:py-14`, `:98`) is
likely a **red herring**.

### Fix (expected — verify, then trim to the minimum that holds 1280–1536)

- `min-h-[525px]` instead of `h-[525px]` so tall content grows rather than
  clipping. Keep the decorative `Image` (`:46-54`) clipped via a wrapper, not
  the outer `overflow-hidden`.
- `relative z-10` on the text column + `pb-[calc(99px+1rem)]` so nothing lands
  under the gradient; `-z-0` on the gradient.
- If content still doesn't fit at 1280: drop `whitespace-nowrap` below `xl`
  (`xl:whitespace-nowrap`) or lower the h1 clamp middle term (`~4.6vw`). Then
  re-check the **second title line** `<p>` (`t("title2")` "Todo en un solo
  lugar", `clamp(24px,3.6vw,52px)`, `:66-74`) and the smaller **subtitle** `<p>`
  (`t("subtitle")`, `:75-80`) still fit, plus the EN strings
  (`packages/i18n/en/landing.json` — `title1` "All in one place" is longer than
  the ES).
- Add breathing room regardless: hero wrapper `pb-6` (`:44`) → `pb-10`.

### Quality (adjacent)

- Mobile hero (`:12-41`) has the same fixed-height + `overflow-hidden` shape
  (`h-[342px]`, `:13`) and `-my-1.5` on the h1 (`:15`). Spot-check 320 / 360 /
  414 px while in the file; touch only if actually broken (issue is
  desktop-only).
- `alt=""` on both hero images (mobile `:24`, desktop `:48`) is correct
  (decorative) — leave it.
- The two hero blocks duplicate a lot of class soup — note for the mobile-app
  plan touching these files; not refactoring here.

### Tests

Pure CSS. No unit test buys much and the repo runs no landing-page visual test
(don't stand one up for this). Deliverable: a PR-description checklist of the
four widths verified.

---

## Cross-cutting

### Sequencing

1. **#167 Step 1** (row remediation) folded into **Step 2** (`isDemo` migration
   - `PUBLIC_STORE_VISIBILITY` across all 7 reads) — one backend PR. Highest
     user-visible impact.
2. **#166 arrows** + **#165 hero** — two small independent frontend PRs off
   `main`, parallel with each other and with #1.
3. **#167 Step 3** (admin badge / toggle) — only if the user asks; read-only
   badge first.

### Regen / commit discipline

Any change to a migrated module's response DTOs (Step 3's `isDemo` on
`StoreResponseDto`) requires
`pnpm --filter api generate:openapi && pnpm --filter @biasmarket/types generate`
and committing `apps/api/openapi.json` + `packages/types/generated/**` in the
same PR (`apps/web/AGENTS.md`).

### Validation gate (every PR)

`pnpm lint && pnpm typecheck && pnpm test` from root (Turbo path-filters).
Backend PRs also `pnpm --filter api test:e2e`.

### Risks

- **`PUBLIC_STORE_VISIBILITY` touches the sitemap + search queries** — a wrong
  filter silently drops real stores/products. One test per read site asserting
  the fragment is applied.
- **`ProductSearchService` filter change** alters `/search` and homepage-rail
  output for real — snapshot/assert against a fixture with a mix of
  public/unlisted/demo stores.
- **Index on `Store`** — `EXPLAIN` on a prod-sized dataset before adding;
  existing composite index may suffice.
- **`whitespace-nowrap` removal** could wrap the h1 awkwardly in EN — check both
  locales.
- **Admin write toggle** (Step 3 follow-up) hides a store from every public
  surface — `@Roles(['admin'])` guard + UI confirm step.

### Out of scope / explicitly not doing

- Rebuilding the hero or landing carousels wholesale — the mobile-app MVP plan
  (`docs/plans/2026-08-31-mobile-app-mvp-plan.md`) revisits these files;
  coordinate, don't pre-empt.
- Shared `<CarouselArrows>` extraction (deferred to that refactor).
- Homepage blog → real Sanity posts (recommended; separate PR after #166).
- `Store.isPublic` default change (product decision, flagged not implemented).
- Admin write toggle for `isDemo` (only the read-only badge is in the optional
  Step 3).
