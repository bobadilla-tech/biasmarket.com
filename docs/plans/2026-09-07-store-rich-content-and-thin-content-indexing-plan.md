# Store rich content + thin-content indexing gate

**Status:** Draft, not yet implemented. Not yet reviewed (the two-subagent
technical-accuracy + strategy/completeness pass the recent SEO plans ran has
**not** been done on this doc — do that before implementation starts).

**Parent:** `docs/plans/2026-09-07-gsc-indexing-audit-organic-growth-plan.md`
Phase D Tier 3 item 1 ("thin-content / doorway-page risk on new stores") flagged
this as the highest-leverage growth item and said it needs its own plan doc
because it touches sitemap-generation policy and a `Store` completeness signal,
not just metadata. This is that doc. It also absorbs Tier 3 items 4 (alt-text
convention) and 7 (sitemap `lastModified` for stores), and Tier 3 item 2's
`BreadcrumbList` / `OnlineStore` `description` gaps, because they are the same
edit surface — a store page is only worth gating on content quality if there is
a way for a seller to add that quality, and the structured-data/OG work is how
that content actually earns ranking once it exists.

**Ask it answers:** the user wants stores to be able to add their own rich media
— an "about" paragraph, a bio, images placed through the page — so that
individual store pages can position in Google/organic results on their own, not
just ride the platform domain. Paired with that: stop near-empty stores from
being indexed at all, because at UGC-marketplace scale a pile of thin store
pages drags down domain-level quality for every other page.

---

## Business framing (read before the phases)

Two problems, one edit surface, and they only make sense shipped together:

1. **No way for a seller to add indexable prose to their store.** Today a public
   store page's entire crawlable text is: the store name (`<h1 class="sr-only">`,
   `app/[locale]/(storefront)/store/[slug]/page.tsx:171`), product card names/
   prices, and an optional `TEXT_BLOCK` section that renders as a single
   unstyled `<p>` (`components/storefront/section-renderer.tsx:99-103`). There is
   **no `Store.description` / bio / about field anywhere** — confirmed against
   `packages/db/prisma/schema.prisma`'s `Store` model and
   `features/store-settings/components/profile-section.tsx` (name, WhatsApp,
   payment instructions, currency, locale, 4 social URLs, logo — no "about"). The
   store's `<meta name="description">` is auto-generated boilerplate: `Shop
   ${store.name} — ${n} product(s) available.`
   (`store/[slug]/page.tsx:78-80`). Two near-identical stores selling similar
   "official [artist] merch" are, to a crawler, near-identical thin pages.

2. **Every public store is sitemap-submitted regardless of content.**
   `stores-source.ts` → `storesSource.getChunk` calls `storeEntry(locale, slug)`
   for every row `findPublicSitemapPage` returns, and that service method filters
   on `PUBLIC_STORE_VISIBILITY` only (`isPublic: true, isDemo: false`).
   `apps/api/src/common/public-store-visibility.ts:14-17` is explicit that the
   stronger `PUBLIC_STORE_HAS_LISTABLE_PRODUCT` predicate is **deliberately not
   applied to the sitemap reads** — "which list every public store regardless of
   catalog state." That was a defensible call when the store count was tiny; it
   is the exact doorway-page exposure the parent doc flagged.

**Why now:** cheap while few stores exist, structurally expensive to retrofit
once Google has already indexed hundreds of thin pages and formed a
domain-quality opinion. Same "do it before the debt compounds" logic the parent
doc used to rank this #1.

**Why it's not just "add a textarea":** the moment stores carry real per-seller
content, three things follow that needed deciding, not just coding — the minimum
bar for "indexable", what happens to a store that drops below the bar after
being indexed (the robots/noindex ordering trap from
`docs/plans/2026-08-14-seo-account-page-deindex-authguard-plan.md`), and the
authoring/safety model for rich content on a multi-tenant storefront. All three
are now decided — see **Part 2**. The rich-content model is a **markdown
subset** rendered through a server-side allowlist (not seller HTML, not a
block-type expansion of `StoreSection`).

---

## Part 1 — Audit: current state

| Area | Today | Gap |
| - | - | - |
| Store "about" content | none — no `Store.description`/`bio`/`about` column | sellers cannot write anything the crawler reads as store-level prose |
| Section model | `StoreSection` with `type ∈ {COLLECTION, BANNER, TEXT_BLOCK}`, `content Json @default("{}")`, `position`, `hidden` (`schema.prisma`) | `TEXT_BLOCK` is plain-text `body` only; `BANNER` is an image **URL paste** (`imageUrl`/`linkUrl`/`alt`), no upload; no heading/rich-text/gallery block |
| Section seller UI | `features/sections/components/section-form.tsx` — a `<Select>` of the 3 types, a `<textarea>` for `TEXT_BLOCK` body, two `<input>`s for `BANNER` URLs | no image upload, no alt-text field in the form (renderer reads `content.alt` but the form never sets it), no preview of prose |
| Section render | `StoreSectionRenderer` (`components/storefront/section-renderer.tsx`) — `TEXT_BLOCK` → `<section class="prose"><p>{body}</p></section>`; `BANNER` → `<img>` with `alt={content.alt ?? ""}` | `<p>` collapses newlines/paragraphs; no `<h2>`; empty `alt` default |
| Store `<meta description>` | boilerplate `Shop X — N products available.` (`store/[slug]/page.tsx:78`) | not seller-authored, near-duplicate across stores |
| Store `og:image` | `store.logoUrl ?? SITE_URL/og-image.png` (`store/[slug]/page.tsx:88-91`) | logo, not a content image |
| Store JSON-LD | `OnlineStore` with `name`, `url`, `logo`/`image` only (`store/[slug]/page.tsx:96-115` `buildJsonLd`) | no `description`, no `sameAs` (the 4 social URLs already on `Store`), no `BreadcrumbList` |
| Sitemap store entry | `storeEntry(locale, slug)` → `url` + `changeFrequency: "daily"` + `priority: 0.8` + `alternates` (`lib/sitemap/urls.ts:34-45`) | **no `lastModified`** (only `blogEntry` sets one); Google recrawls on its own cadence with no change signal |
| Sitemap store selection | `findPublicSitemapPage` → `PUBLIC_STORE_VISIBILITY` only (`stores.service.ts:153-167`) | no content-completeness gate; `public-store-visibility.ts:14-17` documents this as intentional-for-now |
| Store page indexability | always indexable if reachable — `store/[slug]/page.tsx` exports `alternates.canonical` (+ `languages` after PR #194) and only sets `robots:{index:false}` when the store 404s (`:75`) | a thin but real store is fully indexable |
| Image upload plumbing | `StorageService.uploadImage` (public `bucket`, `products/` prefix) and `uploadLogo` (`logos/`) exist; `apps/api` multipart pattern documented in `apps/web/AGENTS.md` (products' image uploads, the raw-`FormData` carve-out) | no section/store-content image endpoint |
| Alt-text convention | none anywhere (parent doc Tier 3 item 4; also `docs/plans/2026-08-20-seo-strategy-review-plan.md` Phase 5) | image-search discoverability + a11y both unaddressed |

**Ordering-bug prior art that constrains the rollout:**
`docs/plans/2026-08-14-seo-account-page-deindex-authguard-plan.md` "Rollout
order" — a page that is *both* `robots.txt`-disallowed *and* `noindex`'d can
never be de-indexed, because Googlebot won't crawl it to see the `noindex`. The
thin-content gate must de-index via `noindex` **only** (keep thin store URLs
crawlable), never via a `robots.txt` disallow. See Part 7.

---

## Part 2 — Decisions locked (2026-09-07)

Answered by the product owner; the rest of this doc is written to them.

| # | Decision | Value |
| - | - | - |
| Bar | Minimum content for an indexable store page | **`publishedProductCount >= 2` AND (non-empty `bio` OR non-empty `aboutMarkdown` OR ≥1 `TEXT_BLOCK` section with a real body)** |
| Fields | Store content model | **Two fields** — `bio` (short, plain, ≤280) + `aboutMarkdown` (longer, constrained markdown, ≤4000). Not one field. |
| Rich text | Authoring model for the longer content | **Markdown subset**, rendered server-side through an allowlist (no raw HTML, no WYSIWYG). Images via an uploaded-to-CDN URL referenced with `![alt](url)`. |
| Locale | Which locale URLs of a store to index | **Both `/es` and `/en`, same seller-written text**, relying on the reciprocal hreflang shipped in PR #194. Revisit only if Google folds them. |

Everything below follows from these. The old "constrained block model
(`HEADING`/`IMAGE`/`GALLERY` section types)" option is **dropped** — rich prose
and inline images now live in `aboutMarkdown`, not new `StoreSection` types.
`StoreSectionType` is unchanged.

---

## Part 3 — Design overview

Three shippable tracks. Each is independently valuable; the gate (Track C) is
worth much less without Track A/B giving sellers a way to climb above the bar.

- **Track A — Store content model + editor.** `Store.bio` (one-liner / tagline,
  plain text) and `Store.aboutMarkdown` (the rich "about the store" content:
  paragraphs, sub-headings, inline images), plus an authenticated image-upload
  endpoint so inline images live on the platform CDN, not hotlinked. Editor in
  the existing settings surface.
- **Track B — Storefront SEO surfacing.** Make that content earn ranking:
  `bio` → primary `<meta description>` / `og:description`; `aboutMarkdown`
  rendered into a real `<section class="prose">` above the product sections;
  first inline image → `og:image`; `sameAs` from the existing social URL
  columns; `BreadcrumbList` JSON-LD; `OnlineStore.description`; the store `<h1>`
  promoted from `sr-only` to visible when `bio` is set.
- **Track C — Thin-content indexing gate.** One `isStoreIndexable(...)`
  predicate in `apps/api`, reused by the sitemap query and the public store
  DTO. Below the bar: excluded from the sitemap **and** the page emits
  `robots: { index: false }` (noindex only — never a `robots.txt` disallow, per
  the ordering bug). At/above the bar: indexed, and `storeEntry` carries a real
  `lastModified`.

---

## Part 4 — Data model (`packages/db/prisma/schema.prisma`)

```prisma
model Store {
  // ...existing fields...
  bio                    String?   // one-liner / tagline, PLAIN text, app-cap 280
  aboutMarkdown          String?   // rich "about" content, MARKDOWN SUBSET, app-cap 4000
  publishedProductCount  Int       @default(0) // denormalised — # of PUBLISHED,
                                   // non-discontinued, non-deleted products.
                                   // Bumped by the products service on every
                                   // status transition (Part 5.4). Backfilled once.
  contentStaleAt         DateTime? // renamed from the draft's contentUpdatedAt for
                                   // clarity: timestamp of the last storefront-
                                   // VISIBLE content change (bio, aboutMarkdown,
                                   // sections, product publish state). Feeds
                                   // sitemap lastModified. NOT a Prisma @updatedAt
                                   // — a payment-config edit must not bump it.
}
```

- `bio`: `String?`, plain text, **app-layer `@MaxLength(280)`**. Feeds the
  `<meta description>` first in the fallback chain (Part 6).
- `aboutMarkdown`: `String?`, **app-layer `@MaxLength(4000)`**, validated as a
  markdown *string* at the DTO layer; the allowlist is enforced at **render**
  time (Part 6.1), and additionally linted server-side on write to reject
  obviously-disallowed constructs early (raw `<script>`, `<iframe>`, `<style>`,
  `on*=` attributes, `javascript:` URLs) so a bad value never reaches storage.
- `publishedProductCount`: `Int @default(0)`. Denormalised (Q4 decided —
  counting a `products: { some }` relation inside a sitemap `where` isn't
  expressible; a post-fetch count is N+1 at sitemap scale). Kept in sync by the
  products service (Part 5.4) and set once by a backfill in the D4 migration.
- `contentStaleAt`: set by the service layer on any storefront-visible mutation
  (Part 5). Nullable; code falls back to `createdAt` when null (Q6 decided — no
  data backfill).
- **`StoreSection` / `StoreSectionType`: unchanged.** No new enum values, no new
  columns. Existing `TEXT_BLOCK`/`BANNER`/`COLLECTION` behaviour is only
  *improved* at render time (Part 6.3), not restructured.

Migration is additive (three nullable/`@default` columns). The `D4` migration
also runs a one-time `UPDATE` to populate `publishedProductCount` from the
current `Product` rows.

---

## Part 5 — API (`apps/api`)

### 5.1 Store `bio` + `aboutMarkdown`

- `UpdateStoreDto` (the settings save path — trace
  `features/store-settings/mutations/use-save-profile.ts` → `apiClient.stores.*`
  → `StoresController`) gains:
  - `bio?: string` — `@IsOptional() @IsString() @MaxLength(280)`
  - `aboutMarkdown?: string` — `@IsOptional() @IsString() @MaxLength(4000)` plus
    a custom `@IsSafeMarkdown()` validator (rejects raw `<script>`/`<iframe>`/
    `<style>`/`on*=`/`javascript:` — the render-time allowlist is the real
    guarantee, this is fail-fast).
- The store update service sets `contentStaleAt = new Date()` when `bio`,
  `aboutMarkdown`, or any other storefront-visible field actually changes value
  (compare before/after, don't bump on a no-op save).
- `StorePublicDetailResponseDto` (`GET /stores/:slug/public`,
  `stores.service.ts` `findPublicBySlug`) gains `bio: string | null` and
  `aboutMarkdown: string | null`. **Regenerate + commit the OpenAPI client**
  after this DTO change: `pnpm --filter api generate:openapi && pnpm --filter
  @biasmarket/types generate` (per `apps/web/AGENTS.md` — the committed
  `openapi.json` + `packages/types/generated/**` must not drift).

### 5.2 Content-image upload

- New authenticated multipart endpoint, e.g.
  `POST /stores/:storeId/content-images` — mirrors the products image-upload
  carve-out (`apps/web/AGENTS.md`: "the only remaining raw `fetch`/`FormData`
  call sites are the documented multipart carve-outs").
  - `assertOwnership(storeId, userId)` first — same as every tenant mutation.
  - `StorageService.uploadStoreContentImage(buffer, mime)` — new method, same
    shape as `uploadImage`, public `bucket`, new `store-content/` key prefix.
    Returns the `cdn.biasmarket.com/...` URL.
  - Same mime allowlist + size cap as product images (reuse whatever
    `products` upload validates with — don't invent a second limit).
  - Response: `{ url: string }`.
- The seller pastes/inserts that URL into `aboutMarkdown` as `![alt](url)`.
  The editor (Part 5-web) does the insert; the seller writes the alt.

### 5.3 Indexability predicate (Track C core)

New shared helper `apps/api/src/common/store-indexability.ts`:

```ts
export const MIN_INDEXABLE_PRODUCTS = 2;

// Deliberate REVERSAL of public-store-visibility.ts:14-17 ("sitemap lists every
// public store regardless of catalog state") — see that comment + the parent
// GSC audit doc Tier 3 item 1. The gate is content quality, not just "public".
export interface StoreIndexabilityInput {
  isPublic: boolean;
  isDemo: boolean;
  ownerBanned: boolean;
  publishedProductCount: number;
  bio: string | null;
  aboutMarkdown: string | null;
  hasRealTextBlockSection: boolean; // >=1 TEXT_BLOCK whose content.body is non-empty
}

export function isStoreIndexable(s: StoreIndexabilityInput): boolean {
  if (!s.isPublic || s.isDemo || s.ownerBanned) return false;
  const hasProse =
    !!s.bio?.trim() || !!s.aboutMarkdown?.trim() || s.hasRealTextBlockSection;
  return s.publishedProductCount >= MIN_INDEXABLE_PRODUCTS && hasProse;
}
```

- Reused in exactly two places (no third copy):
  1. `stores.service.ts` `findPublicSitemapCount` / `findPublicSitemapPage` —
     `where` becomes `{ ...PUBLIC_STORE_VISIBILITY, owner: { banned: { not:
     true } }, publishedProductCount: { gte: MIN_INDEXABLE_PRODUCTS }, OR: [
     { bio: { not: null } }, { aboutMarkdown: { not: null } }, { sections: {
     some: { type: 'TEXT_BLOCK' } } } ] }`. The `bio`/`aboutMarkdown`
     `not: null` is a loose pre-filter (empty-string edge cases are rare and
     the page-level check in step 2 is authoritative); the `TEXT_BLOCK
     non-empty body` refinement that the Prisma `where` can't express is
     applied post-fetch if it matters — decide during D7 whether the loose
     filter is close enough.
  2. `GET /stores/:slug/public` — `StorePublicDetailResponseDto` gains
     `indexable: boolean`, computed with the full predicate (this one *can*
     check `TEXT_BLOCK` body content because it already loads sections). This
     is the authoritative signal the web page uses for `robots`.
- Do **not** apply the gate to `findFeatured` / `findDirectory` — they have
  their own `PUBLIC_STORE_HAS_LISTABLE_PRODUCT` predicate and are a different
  concern ("what we surface" ≠ "what Google indexes"), the separation
  `public-store-visibility.ts` already draws.

### 5.4 `publishedProductCount` maintenance

- Grep `apps/api/src/modules/products/products.service.ts` for every mutation
  that changes whether a product counts as PUBLISHED / non-discontinued /
  non-deleted: create-as-published, publish, unpublish/back-to-draft,
  discontinue, un-discontinue, soft-delete, hard-delete, and any bulk variant.
  Each recomputes or `{ increment/decrement: 1 }`s `store.publishedProductCount`
  and sets `store.contentStaleAt`.
- Prefer a single private `recountPublishedProducts(storeId)` helper called from
  each site over scattered `increment` math — one place to be correct, and the
  D4 backfill can call the same helper.
- Add a service-level test asserting the count stays correct across a
  publish → discontinue → delete sequence.

### 5.5 Sitemap `lastModified` (Tier 3 item 7)

- `findPublicSitemapPage` selects `contentStaleAt` + `createdAt`, emits
  `lastModified: (contentStaleAt ?? createdAt).toISOString()`.
- `SitemapStorePageDto.items[]` gains `lastModified: string`.
- `stores-source.ts` passes it through; `urls.ts` `storeEntry` gains an optional
  `lastModified` param and sets it — mirror `blogEntry`'s existing shape
  (`urls.ts:47-60`) exactly.

---

## Part 5-web — Dashboard editor (`apps/web`, feature-sliced)

- `features/store-settings` — new **Store content** section card (own
  `schema` / `mutation` / component under `features/store-settings/`, following
  the one-card-per-settings-concern pattern the feature already uses), OR extend
  `profile-section.tsx` if the owner prefers it co-located. Fields:
  - `bio`: single-line `<Input>` (or 2-row `<Textarea>`), live char counter
    against 280, helper "Shown under your store name and in Google results."
  - `aboutMarkdown`: `<Textarea>` (min ~10 rows), live char counter against
    4000, a short "Markdown supported: **bold**, headings, lists, links,
    images" hint, and an **image button**: file picker → `POST
    .../content-images` (raw `FormData`, the carve-out) → inserts
    `![description](returnedUrl)` at the cursor, with the caret left inside
    `[description]` so the seller replaces it with real alt text. A live
    preview pane rendering through the **same** allowlist renderer as the
    storefront (Part 6.1) — import it, don't reimplement.
  - Wire through a `useSaveStoreContent` mutation + the existing
    `updateStoreCache` / `useUpdateDashboardStoreCache` optimistic path (same
    as `settings/page.tsx`'s other saves — no new cache plumbing).
- Existing `features/sections` `SectionForm` gets two **small** fixes in the
  same area (not new block types): (a) add the missing `alt` input for `BANNER`
  (the renderer already reads `content.alt` but the form never sets it), (b) no
  schema change needed for `TEXT_BLOCK` — the paragraph-rendering fix is
  render-side only (Part 6.3).

---

## Part 6 — Storefront rendering + SEO (`apps/web`)

### 6.1 Markdown renderer (new, shared)

`apps/web/lib/store-markdown.tsx` (or `.ts` returning a React tree):

- **Recommended lib:** `react-markdown` + `rehype-sanitize` with a custom
  schema (SSR-friendly, already a React app, no `dangerouslySetInnerHTML`).
  Alternative: `marked` + `sanitize-html`. Either way the **allowlist is the
  contract**, not the lib:
  - Allowed elements: `p`, `h2`, `h3`, `h4`, `ul`, `ol`, `li`, `strong`, `em`,
    `blockquote`, `a`, `img`, `code`, `pre`, `hr`, `br`.
  - **No `h1`** — the page owns the single `<h1>`. Downgrade `#` to `h2`.
  - **No raw HTML** passthrough. No `table` in v1 (add later if asked).
  - `a`: force `rel="nofollow ugc noopener"` + `target="_blank"`; allow only
    `http:`/`https:`/`mailto:` schemes. (Stops sellers passing the platform's
    ranking authority to arbitrary outbound links, and blocks `javascript:`.)
  - `img`: `src` **must** be on an allowlisted host (`cdn.biasmarket.com` / the
    S3 public URL host from `NEXT_PUBLIC_*` config) — reject arbitrary remote
    images (tracking pixels, hotlinking, mixed-content). Require a non-empty
    `alt`; drop the image (or render its alt as text) if `alt` is empty.
    `loading="lazy"`, `decoding="async"`.
- Export a `renderStoreMarkdown(md: string): ReactNode` and a
  `storeMarkdownToPlainText(md: string, max?: number): string` (for the meta
  description + JSON-LD).
- Unit-test the allowlist directly (script tag stripped, `javascript:` href
  dropped, off-host img dropped, `#` → `h2`, `rel` forced) — same
  "guard the exact risk" spirit as `canonical-regression.test.ts`.

### 6.2 `generateMetadata` (`store/[slug]/page.tsx`)

```ts
const metaDescription =
  store.bio?.trim() ||
  storeMarkdownToPlainText(store.aboutMarkdown ?? "", 155) ||
  `Shop ${store.name} — ${products.length} product${products.length === 1 ? "" : "s"} available.`;

const ogImage =
  firstMarkdownImageUrl(store.aboutMarkdown) ??   // parse first ![](url)
  firstBannerImageUrl(store.sections) ??
  store.logoUrl ??
  `${SITE_URL}/og-image.png`;

return {
  title: store.name,
  description: metaDescription,
  robots: store.indexable ? undefined : { index: false },  // Track C, noindex-only
  alternates: {
    canonical: canonicalUrl(locale, `/store/${slug}`),
    languages: localeAlternates(`/store/${slug}`),          // PR #194
  },
  openGraph: {
    title: store.name,
    description: metaDescription,
    images: [ogImage],
  },
};
```

`canonical-regression.test.ts` stays green either branch (canonical present in
the indexable case, `index: false` in the gated case).

### 6.3 Page body (`store/[slug]/page.tsx` + `section-renderer.tsx`)

- Render `aboutMarkdown` (when non-empty) via `renderStoreMarkdown` into a
  `<section class="prose max-w-none">` placed **above** `<StoreSectionRenderer>`
  in the main column.
- Promote `<h1 class="sr-only">{store.name}</h1>` to a visible heading when
  `store.bio` is set, with `bio` as a `<p>` sub-line under it. Keep `sr-only`
  when there's no `bio` (bare store, nothing to show).
- `section-renderer.tsx` `TEXT_BLOCK` branch: split `content.body` on blank
  lines into multiple `<p>` inside the existing `.prose` wrapper (currently one
  flat `<p>` that eats newlines). `BANNER` branch: already reads `content.alt` —
  no change beyond the form now supplying it.
- `buildJsonLd`: add to the `OnlineStore` node —
  `description: store.bio?.trim() || storeMarkdownToPlainText(store.aboutMarkdown, 300) || undefined`,
  and `sameAs: [instagramUrl, facebookUrl, tiktokUrl, twitterUrl].filter(Boolean)`
  (columns exist on `Store`, just not in the DTO/JSON-LD yet — add to the DTO in
  5.1). Add a `BreadcrumbList` node to the `@graph` (`Home → Stores → store
  name`). Closes parent doc Tier 3 item 2's store `BreadcrumbList` + `sameAs`.

---

## Part 7 — Thin-content gate rollout (ordering-bug-safe)

Mirrors `docs/plans/2026-08-14-...`'s "Rollout order" discipline:

1. **Ship Tracks A + B (D1–D3), gate OFF.** Sellers can now write `bio` /
   `aboutMarkdown`; nothing is de-indexed. Let real stores fill content in.
2. **Ship the gate report-only (D5).** Compute `isStoreIndexable`, expose
   `indexable` on the public DTO, log a one-off count of how many current
   public stores fail the bar. Confirm the predicate isn't excluding legit
   stores. No `noindex`, sitemap still lists everyone.
3. **Turn on page `noindex` for sub-bar stores (D6).** `robots: { index:false }`
   in `generateMetadata`. Keep the URLs **crawlable** (no `robots.txt` change) so
   Googlebot can see the `noindex` and drop them. This is the step that actually
   de-indexes thin pages.
4. **Only after GSC confirms** sub-bar stores dropping out of the index, **stop
   listing them in the sitemap (D7).** Doing this before step 3 has propagated
   would just slow discovery of the `noindex`.
5. A store that later crosses the bar: `noindex` clears on next render; it
   re-enters the sitemap on the next revalidate (`stores-source.ts`
   `revalidate: 3600` + `tags: ["sitemap:stores"]`); its `contentStaleAt` bump
   gives Google a fresh `lastModified`.

**Never** `robots.txt`-disallow thin store URLs. Full hiding is the existing
`isPublic: false` toggle (direct-link-only by design — `schema.prisma`
`Store.isPublic` comment).

---

## Part 8 — Phasing (independently shippable PRs)

| PR | Scope | Depends on | Indexing risk |
| - | - | - | - |
| **D1** | `Store.bio` + `Store.aboutMarkdown` columns + additive migration; `UpdateStoreDto` fields (+ `@MaxLength`, `@IsSafeMarkdown`); `StorePublicDetailResponseDto` gains `bio`/`aboutMarkdown`; regen + commit OpenAPI client. No rendering yet. | — | none |
| **D2** | `lib/store-markdown` renderer + allowlist + tests; render `aboutMarkdown` in a prose section; visible `<h1>` + `bio` sub-line; meta-description chain; `og:image` from content; `sameAs` + `BreadcrumbList` + `OnlineStore.description` JSON-LD (add social cols to DTO here). | D1 | none |
| **D3** | `POST /stores/:storeId/content-images` + `StorageService.uploadStoreContentImage`; dashboard **Store content** editor card (bio + aboutMarkdown + image-insert + live preview); `SectionForm` `BANNER` alt field; `section-renderer` `TEXT_BLOCK` paragraph split. | D1 (fields), D2 (shared renderer for preview) | none |
| **D4** | `Store.publishedProductCount` + `Store.contentStaleAt` columns + migration incl. one-time backfill; `recountPublishedProducts` helper wired into every products-service status transition + tests; `storeEntry` `lastModified`; `SitemapStorePageDto.items[].lastModified`. | D1 | none |
| **D5** | `common/store-indexability.ts` `isStoreIndexable`; `indexable: boolean` on `StorePublicDetailResponseDto` (regen client); one-off measurement script/log of sub-bar public store count. Gate still inert. | D1, D4 | none |
| **D6** | `generateMetadata` emits `robots: { index: false }` when `!store.indexable`. | D5 + a GSC baseline read | **de-indexes** sub-bar stores — time-gated |
| **D7** | `findPublicSitemapPage` / `findPublicSitemapCount` apply the bar to the `where`; decide loose-`where` vs post-fetch `TEXT_BLOCK`-body refinement. | D6 + GSC confirmation stores are dropping | sitemap shrinks — time-gated |
| **D8** | `docs/core/product.md` §5.2 — seller-content convention: markdown allowlist summary, `rel="nofollow ugc"` on outbound links, images must be CDN-hosted, **every** seller image (product, `BANNER`, inline `aboutMarkdown`) needs non-empty human-written `alt`. | D3 | none |

D1–D5 ship on normal cadence. D6/D7 are gated on GSC observation windows
(days–weeks), exactly like `2026-08-14` step 3 — split them as separate PRs
weeks apart, and leave a tracking reminder when D5 ships (there's no automated
"Google has recrawled" signal).

---

## Part 9 — Remaining open questions (smaller; don't block D1)

1. **Store content editor placement** — its own new settings card under
   `features/store-settings`, or folded into the existing `profile-section.tsx`?
   Lean: own card (`profile-section.tsx` is already dense). D3 decision.
2. **`TEXT_BLOCK`-body refinement in the sitemap `where` (D7).** The Prisma
   `where` can cheaply check `sections: { some: { type: 'TEXT_BLOCK' } }` but
   not "…with a non-empty `content.body`". Is the loose filter (any `TEXT_BLOCK`
   row counts) acceptable for sitemap inclusion, given the page-level
   `indexable` check is stricter and authoritative? Lean: yes, loose is fine —
   worst case a near-empty store stays in the sitemap one crawl longer.
3. **`bio` / `aboutMarkdown` per-locale, later?** v1 is one string each, indexed
   under both locales (Q-locale decided). If duplicate-content folding shows up
   in GSC for store pages, revisit with per-locale content columns. Ties to
   `2026-08-20` plan Open question 5 (EN investment level).
4. **Markdown `table` support** — excluded from the v1 allowlist. Add only if a
   seller use-case actually needs it (size/return tables), with its own
   sanitize rules.
5. **Editor UX depth in D3** — plain `<textarea>` + preview pane (this doc's
   assumption) vs. a lightweight markdown toolbar. Lean: textarea + preview for
   v1; toolbar is a follow-up polish PR, not a blocker.

---

## Part 10 — What NOT to do

- Don't ship the gate (D6/D7) before D1–D3 give sellers a way to climb above the
  bar — de-indexing stores that have no mechanism to improve is user-hostile.
- Don't de-index thin stores via `robots.txt` — `noindex` only, keep them
  crawlable, or they get stuck per the `2026-08-14` ordering bug.
- Don't apply the indexability gate to `findFeatured`/`findDirectory` — those
  are product-surface decisions with their own predicate
  (`PUBLIC_STORE_HAS_LISTABLE_PRODUCT`); keep "what we show" and "what Google
  indexes" as separate concerns, the way `public-store-visibility.ts` already
  does.
- Don't render `aboutMarkdown` with `dangerouslySetInnerHTML` or any raw-HTML
  path. The allowlist renderer (Part 6.1) is the security boundary — it must
  strip raw HTML, force `rel="nofollow ugc noopener"` on links, and reject
  off-CDN image `src`. Get a security review of that renderer before D2 merges.
- Don't add new `StoreSectionType` enum values (`HEADING`/`IMAGE`/`GALLERY`) —
  that was the rejected design; rich prose + inline images live in
  `aboutMarkdown` now.
- Don't skip the two-subagent review pass on this doc — every recent SEO plan in
  `docs/plans/` had one and it caught real errors each time (a non-compiling
  layout snippet, a wrong "already implemented" claim). This doc has more
  surface area than those and has had none yet.
- Don't bundle D1–D8 into one PR — they have different risk profiles (schema,
  storefront markup + a security-sensitive renderer, indexing behaviour) and
  D6/D7 are time-gated on GSC.

---

## Cross-references

- `docs/plans/2026-09-07-gsc-indexing-audit-organic-growth-plan.md` — parent;
  Phase D Tier 3 items 1, 2 (partial), 4, 7 land here. Phase B (per-page
  hreflang) shipped in PR #194 and this doc assumes `localeAlternates` exists.
- `docs/plans/2026-08-20-seo-strategy-review-plan.md` — Phase 5 named alt-text
  convention + `BreadcrumbList`/`availability` as deferred; this doc picks up
  alt-text and store `BreadcrumbList`.
- `docs/plans/2026-08-14-seo-account-page-deindex-authguard-plan.md` — the
  `robots.txt`/`noindex` ordering bug that dictates Part 7's sequence.
- `docs/plans/2026-08-14-sitemap-source-split-architecture-plan.md` — the
  `SitemapSource` / chunk architecture Track C's sitemap changes plug into.
- `docs/plans/2026-08-08-storefront-section-drag-drop-preview.md` — the
  `StoreSectionRenderer` shared seller-preview/live-storefront contract; the D3
  `TEXT_BLOCK` / `BANNER` render tweaks and the D3 editor's markdown preview
  pane must stay consistent with the live storefront (reuse the Part 6.1
  renderer, don't fork it).
- `apps/web/AGENTS.md` — feature-sliced conventions, generated OpenAPI client
  (regen + commit after every DTO change), the multipart `FormData` carve-out
  that the section image upload follows.
