# GSC "Page indexing" report audit + organic growth plan

**Status:** Draft, not yet implemented. Written as a spike/audit first — see
"Business framing" for why most of the reported GSC categories are not bugs.

**Source:** User pasted seven Google Search Console "Page indexing" report
categories (`Excluded by noindex tag`, `Not found (404)`,
`Duplicate without user-selected canonical`, `Blocked by robots.txt`,
`Page with redirect`, `Duplicate, Google chose different canonical than user`,
`Crawled - currently not indexed`), each first-detected between 8/14/26 and
9/4/26, with 1-2 affected pages per category. Ask: stop Google from flagging the
non-bugs as "errors", fix the real gaps, and use this as the trigger to finally
scope the organic-growth work that
`docs/plans/2026-08-20-seo-strategy-review-plan.md`'s Phase 5 explicitly
deferred ("not started, per plan's own framing... flagged back to whoever
prioritizes growth work").

## Business framing (read this before the phases)

**None of these seven categories are indexing failures.** GSC's "Page indexing"
report groups every reason a URL _isn't_ in the index under one "aren't indexed
or served on Google" umbrella, including reasons that are working exactly as
designed: a `noindex` tag we put there on purpose, a `robots.txt` disallow we
put there on purpose, a redirect that correctly sends `http://` to `https://` +
locale, and a genuine 404 for a URL that never existed on this site. GSC's UI
has no visual distinction between "we told Google not to index this" and "Google
refuses to index this despite us wanting it indexed" — both render as a red-ish
"not indexed" row. Five of the seven rows below are the former. Reading them as
"errors" and trying to make every row disappear would mean _undoing_ deliberate
SEO decisions from the 2026-08-14 and 2026-08-20 plans.

Two rows are real, if minor: a per-page hreflang gap that plausibly contributes
to Google folding `/es/founder` into a different canonical than the one we
declared, and residual defense-in-depth for the account/dashboard noindex
transition. Both are cheap. Everything else in the seven rows is "confirm it's
intentional, click Validate Fix in GSC (or wait for the next crawl), move on" —
not an engineering project.

The higher-leverage ask in the user's message — "improve the SEO + organic
discoverability" — is a separate, much bigger body of work than closing GSC
rows: it's Phase 5 from the prior plan, never scoped. This document scopes it
(Phase D below) rather than deferring again, per the user's explicit "generate
upgrade so don't limit yourself" instruction. Recommendation once this lands:
treat Phase A/B/C as a single small PR (cheap, closes the actual gaps), and
treat Phase D as a backlog of independently-shippable growth work, not a single
follow-up plan — most items don't block each other.

## Audit: GSC category root-cause table

| # | GSC category                                          | Example URL(s)                                                                  | Root cause                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Classification                                                                                                                                                                                   |
| - | ----------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 | Excluded by noindex tag                               | `/en/search?category=Concert`, `/es/search?category=Magazine`                   | `apps/web/app/[locale]/search/page.tsx:19` sets `robots: { index: false, follow: true }` deliberately — shipped in the 2026-08-20 plan's Phase 1 specifically so query-string-driven facet pages don't become duplicate-content spam. `follow: true` is why Google still crawled through to find products.                                                                                                                                                                                                                                                                                                                                                                                                                                               | **Working as intended.** Not a bug.                                                                                                                                                              |
| 2 | Not found (404)                                       | `https://api.biasmarket.com/`, `https://biasmarket.com/ayo-habiskan-makananmu/` | `api.biasmarket.com/` genuinely 404s under Nest's global `api` prefix (`infra/vps/Caddyfile:18-21` already serves a `Disallow: /` robots.txt for that host, shipped 2026-08-20 Phase 3, precisely so this host stops getting crawled). `/ayo-habiskan-makananmu/` (Indonesian, "come on finish your food") does not and has never existed anywhere in this repo's routes, content, or git history (confirmed via full-repo grep + `git log --all`) — it is a phantom URL Google discovered via an external link/referrer somewhere, not a site defect, and the correct response (404) is exactly what's happening.                                                                                                                                       | **Working as intended** for both. The second one merits a manual GSC "Links" report check (see Phase C) purely to see if there's a spammy referring domain worth knowing about — not a code fix. |
| 3 | Duplicate without user-selected canonical             | `/es/enterprise`, `/es/account`                                                 | Both pages already export `alternates.canonical` (`enterprise/page.tsx:20`) or `robots: { index: false, follow: false }` (`account/page.tsx:13`) — both landed in the 2026-08-20 plan (first-detected date 8/14/26 predates that plan's Phase 1/1-follow-through). This category is very plausibly Google's report catching the _transition state_ between "was indexed as a duplicate" and "now excluded" — it can take multiple recrawl cycles to reclassify, and the pasted trend graphs show affected-page counts declining toward 0 by 8/24, i.e. already resolving.                                                                                                                                                                                | **Likely already fixed, pending recrawl.** Verify via GSC "Validate Fix", don't re-engineer.                                                                                                     |
| 4 | Blocked by robots.txt                                 | `/es/dashboard/demo-kpop-corner/customers`                                      | `apps/web/app/robots.ts`'s `/*/dashboard/*` disallow rule is intentional (shipped pre-2026-08-14, reaffirmed in every subsequent SEO plan) — dashboard pages are sensitive, signed-in-only seller UI with no evergreen public content.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | **Working as intended.** Not a bug.                                                                                                                                                              |
| 5 | Page with redirect                                    | `http://biasmarket.com/`                                                        | Documented and verified live in the 2026-08-20 plan's Phase 2: `http://biasmarket.com/` → `https://biasmarket.com/` (308) → `https://biasmarket.com/es` (307), exactly two hops, both necessary (HTTP→HTTPS upgrade, then default-locale routing). Google is correctly reporting that the bare `http://` URL isn't itself indexable (its redirect target is), which is the desired behavior — we want the canonical `https://.../es` URL indexed, not the `http://` one.                                                                                                                                                                                                                                                                                 | **Working as intended.** Not a bug.                                                                                                                                                              |
| 6 | Duplicate, Google chose different canonical than user | `/es/founder`                                                                   | `founder/page.tsx:20` sets a correct self-referential `alternates.canonical`. But **no page in the repo sets `alternates.languages` (HTML `<link rel="alternate" hreflang>`)** — hreflang signals only exist in `apps/web/lib/sitemap/urls.ts`'s `alternates()` helper, consumed by the sitemap XML, not by any page's `<head>`. Google explicitly documents that duplicate near-identical translated pages need _either_ HTML hreflang tags _or_ sitemap hreflang _or_ both — sitemap-only is valid but weaker signal for a page whose canonical Google is already second-guessing, since the per-page signal is what the crawler sees first, before it ever fetches the sitemap. This is the one row in the table with a concrete, plausible code gap. | **Real, minor gap.** See Phase B.                                                                                                                                                                |
| 7 | Crawled - currently not indexed                       | `/favicon.ico?favicon.2folp56w0mbp6.ico`                                        | `apps/web/app/favicon.ico` is a static file route; nothing in this repo generates a query-string-suffixed favicon URL. The `?favicon.<random>.ico` pattern is a known artifact of browser extensions / bookmark-sync tooling appending a cache-busting query to a favicon fetch they perform independently of any link on the page — not a URL this site ever links to or references. Google crawled it once (probably from a referring signal external to the site, same class of event as row 2's phantom URL) and correctly chose not to index a resource that isn't an HTML page.                                                                                                                                                                    | **Working as intended / external noise.** Not a bug, nothing to fix — a plain `.ico` binary was never going to be "indexed" as a page regardless.                                                |

## Phase A — GSC console actions (no code, do first)

Zero-risk, do immediately, unblocks reading the real signal in future reports:

1. Click "Validate Fix" on rows 1, 3, 4, 5, 7 in GSC — they're all
   intentional/expected, confirming this stops them from re-surfacing as fresh
   "first detected" rows on every crawl.
2. Row 2 (`/ayo-habiskan-makananmu/`): open GSC's **Links** report, filter for
   pages linking to that path. If there's an identifiable spammy referring
   domain, note it (optionally: Disavow Links tool) — otherwise just Validate
   Fix and move on. This is a GSC-console-only action; there is nothing in this
   repo to change.
3. Re-check this report in ~2-3 weeks after Phase B ships and its own
   verification step (below) confirms the hreflang tags render — watch
   specifically for row 6 (`/es/founder`)'s canonical switching to match ours.

## Phase B — Real code gap: per-page hreflang

**Problem:** `alternates.languages` is never set in any `generateMetadata`, only
in the sitemap. Add it everywhere `alternates.canonical` already exists, reusing
the existing sitemap helper rather than inventing a second hreflang
implementation.

**Approach:** `apps/web/lib/sitemap/urls.ts`'s `alternates(path)` already
computes the exact `{ [locale]: url, "x-default": url }` shape Next's
`Metadata.alternates.languages` expects — same shape, different consumer. Add a
small wrapper in `apps/web/lib/site-config.ts` (next to `canonicalUrl`, which
every page's `generateMetadata` already imports) rather than importing from
`lib/sitemap/*` into every marketing/storefront page — `lib/sitemap` is
sitemap-route-internal, importing it broadly would blur that boundary:

```ts
// lib/site-config.ts
import { routing } from "@/i18n/routing";

export function localeAlternates(path: string): Record<string, string> {
  return {
    ...Object.fromEntries(
      routing.locales.map((locale) => [locale, canonicalUrl(locale, path)]),
    ),
    "x-default": canonicalUrl(routing.defaultLocale, path),
  };
}
```

Then every page currently doing:

```ts
alternates: { canonical: canonicalUrl(locale, "/founder") },
```

becomes:

```ts
alternates: {
  canonical: canonicalUrl(locale, "/founder"),
  languages: localeAlternates("/founder"),
},
```

Apply to every page listed in the earlier grep (home, `/founder`, `/enterprise`,
`/contact`, `/for-sellers`, `/stores`, `/blog`, `/blog/[slug]`, `/store/[slug]`,
`/store/[slug]/product/[productId]`, `/store/[slug]/account`,
`/store/[slug]/account/login`). Do **not** add it to `/search` (noindexed —
hreflang on a noindexed page is meaningless) or `/account` (same). Extend
`apps/web/__tests__/canonical-regression.test.ts` in the same PR: for every page
that has `alternates.canonical`, also assert it has `alternates.languages` —
same "guard the exact class of bug this repo shipped once already" pattern the
file already documents, applied to the new gap class (canonical present,
hreflang absent) instead of writing a second freestanding test file.

**Verify `apps/web/lib/sitemap/urls.ts`'s `alternates()` isn't now duplicated
logic worth consolidating**: it's route-parameterized differently (takes a bare
`path`, no locale — computes all locales at once for a sitemap entry) vs. the
new `localeAlternates` (same signature, different consumer). They can share the
same computation if `urls.ts`'s `alternates()` is rewritten to call the new
`lib/site-config.ts` helper instead of recomputing — do that in this PR too, so
there is exactly one hreflang-set computation in the codebase, not two:

```ts
// lib/sitemap/urls.ts
import { localeAlternates } from "@/lib/site-config";

export function alternates(path: string) {
  return { languages: localeAlternates(path) };
}
```

**Verification step (do this once, here — not duplicated elsewhere in this
doc):** after deploy, confirm the rendered `<head>` on `/es/founder` and
`/en/founder` actually carries reciprocal
`<link rel="alternate"
hreflang="...">` tags pointing at each other
(`curl -s
https://biasmarket.com/es/founder | grep hreflang`, or GSC's URL
Inspection tool). This is a five-minute check, not a growth-engineering task —
do it as part of shipping Phase B, don't defer it to the Phase D backlog.

## Phase C — Optional hardening (flag to user, don't ship silently)

The 2026-08-20 plan made an explicit, tested product decision:
`canonical-regression.test.ts` **exempts** any page covered by a `robots.ts`
disallow rule from needing its own `noindex` meta, on the reasoning "once a page
is disallowed, canonical/noindex on it is moot." The 2026-08-14 account plan
separately documented the failure mode this sidesteps: if a disallowed URL is
somehow indexed _before_ the disallow rule existed or took effect, `robots.txt`
then blocks Google from ever recrawling it to see a `noindex` tag — it becomes
stuck, "uncrawlable and therefore un-deindexable," until manually removed via
GSC's URL Removal tool.

Row 4 in the audit table (`/es/dashboard/.../customers`, "Blocked by
robots.txt") is exactly the scenario this tradeoff accepted, currently playing
out as intended — it's blocked and correctly unindexed, no `noindex` meta needed
because it was never indexed in the first place. Nothing to fix _today_. The
residual risk is only forward-looking: any new route added under `(dashboard)`,
`(onboarding)`, or `(dashboard)/admin` in the future is exposed to the same
ordering bug the moment it's built (e.g. a share link gets posted somewhere and
Google indexes it) before anyone remembers to check `robots.ts`.

**Do not silently add `robots: { index: false }` meta to every dashboard/
admin/onboarding page in this PR** — that's a deliberate reversal of a tested,
documented decision two prior plans made, not a bug fix, and belongs in front of
the user as a choice:

- **Option 1 (status quo):** keep relying on `robots.txt` alone for these route
  groups; accept the ordering-bug risk as already-accepted.
- **Option 2 (belt-and-suspenders) — more invasive than it first looks, verify
  before scoping as cheap:** the naive version of this ("add
  `export const
  metadata = { robots: { index: false } }` to each route group's
  `layout.tsx`") **does not compile as stated.** There are actually four layouts
  in this tree, not three: `(dashboard)/layout.tsx`,
  `(dashboard)/admin/layout.tsx` (nested _inside_ `(dashboard)`, not a sibling),
  `(dashboard)/dashboard/[slug]/layout.tsx`, and `(onboarding)/layout.tsx`. Two
  of the four — `(dashboard)/layout.tsx` and `(dashboard)/admin/layout.tsx` —
  start with `"use client"`; Next.js hard-errors on exporting `metadata`/
  `generateMetadata` from a Client Component. The other two,
  `(dashboard)/dashboard/[slug]/layout.tsx` and `(onboarding)/layout.tsx`, are
  already Server Components and could take a plain `export const
  metadata`
  directly, no wrapper needed. Making Option 2 actually work means one of: (a)
  splitting the two client layouts into a thin server-component wrapper that
  exports `metadata` and renders the existing client layout as a child (extra
  file per layout, a real if mechanical refactor across those 2 files, not a
  one-line addition), or (b) adding `export const metadata` to every individual
  `page.tsx` under those two trees instead of centralizing at the layout level
  (more files touched, no centralization benefit) — the other two layouts can
  just take the metadata export as-is either way. Given this, Option 2 is not a
  same-PR addition — if the user wants it, it needs its own short follow-up plan
  doc sized around whichever of (a)/(b) is chosen for the two client layouts,
  not a bullet in this one.

This document does not recommend Option 1 vs. Option 2 — surface the tradeoff
(and the real cost of Option 2, now that it's known) to the user before either
is implemented.

**Also cheap, low-risk, do alongside Phase B regardless of the Option 1/2
choice:** `apps/web/app/[locale]/not-found.tsx` has no `metadata` export at all.
Next's 404 status code is the authoritative signal (Google does not index
404-status pages regardless of meta tags), so this is not fixing a bug — but an
explicit `export const metadata: Metadata = { robots: { index:
false } }` costs
nothing and matches the belt-and-suspenders posture of Option 2 above.

## Phase D — Organic growth / discoverability (the actual "improve SEO"

ask, scoped)

This is the deferred Phase 5 from
`docs/plans/2026-08-20-seo-strategy-review-plan.md` — that plan's own Phase 5
framing named alt-text convention, backlink/off-page strategy, and a
mobile-first UX audit as real, deferred scope. This document carries all three
forward explicitly below rather than silently dropping them (an earlier draft
did drop them — caught in review).

Items are tiered by what they actually need next, not treated uniformly:

### Tier 1 — small enough to just do, no follow-up plan needed

- **Social sharing image gap on product pages.** Verified live:
  `/store/[slug]/page.tsx:86` overrides `openGraph` with the store's own image,
  but `/store/[slug]/product/[productId]/page.tsx`'s `generateMetadata` (checked
  directly — lines 34-45) sets only `title` and `alternates.canonical`, no
  `openGraph` at all — it falls back to the root layout's generic
  `og-image.png`. For a fandom-commerce product, a shared product link (Discord,
  Twitter/X, Instagram bio) showing the actual product photo instead of a
  generic site graphic is a real, cheap, high-relevance fix: add
  `openGraph: { images: [{ url: product.images[0] }] }` (same image
  `buildProductJsonLd` already uses) to that page's `generateMetadata`. Note
  social sharing generally, not just this one gap, is plausibly a bigger
  discovery channel than Google organic for this audience — worth weighing
  against the Google-crawl-centric items below when prioritizing.
- **Recurring monitoring cadence.** No current process re-checks the GSC Page
  Indexing report on a schedule — this whole audit exists because GSC
  accumulated 7 rows across 3 weeks unnoticed. Set a monthly reminder (or a
  scheduled Claude Code routine via the `schedule` skill) to re-pull the report
  and diff against this document's table, rather than this becoming another
  one-off audit.

### Tier 2 — needs a stakeholder decision more than engineering

- **Blog content/internal-linking audit.** `lib/sitemap/blog-source.ts` exists
  and is wired into the sitemap, but this plan hasn't verified publishing
  cadence or keyword targeting. Internal linking specifically: verified
  `/founder` is linked from `components/marketing/navbar.tsx`'s top nav, but
  **`/enterprise` is not in navbar.tsx at all** — its only in-repo link is
  `features/for-sellers/components/footer.tsx:32` (a footer link on one
  marketing page, not top-nav). That's a plausible real contributor to weak
  Google confidence in `/enterprise` specifically (and, via the same
  thin-linking mechanism, `/founder`'s row-6 duplicate-canonical issue) — worth
  a product decision on whether `/enterprise` deserves top-nav placement, not
  just an SEO tweak.
- **Backlink / off-page strategy.** Named in the 2026-08-20 plan's own deferred
  Phase 5, not touched since. Nothing in this repo can fix this — it's
  outreach/partnerships work (K-pop fan communities, seller testimonials,
  press), a business decision on where to invest, not a code change.

### Tier 3 — real scope, needs its own follow-up plan doc before implementation

1. **Thin-content / doorway-page risk on new stores — highest-leverage item in
   this whole document, do this one first.** Bias Market is a UGC-marketplace:
   any seller can create a store with 1-2 products and no description, and every
   public store currently gets a sitemap entry (`storeEntry()` in
   `lib/sitemap/urls.ts`, called unconditionally per public store — confirmed no
   content-completeness gate in `lib/sitemap/stores-source.ts`). Google's
   site-quality evaluation is domain-level, not purely per-URL — indexing many
   near-empty store pages at scale is a well-documented way to drag down how
   Google treats the _entire_ domain's other pages, not just the thin ones. This
   is cheap to fix now (few stores exist) and expensive to retrofit once many
   thin pages are already indexed. Scope: define a minimum-content bar (e.g., N
   products with non-placeholder descriptions) before a store is
   sitemap-eligible/indexable; needs its own plan since it touches sitemap
   generation policy and probably a `Store` completeness signal, not just
   metadata.
2. **Structured data beyond what already exists.** Correction to an earlier
   draft of this document: `Product`/`Offer` JSON-LD (price, currency,
   availability, image) is **already implemented** — `lib/product-json-ld.ts`'s
   `buildProductJsonLd`, wired into both `/store/[slug]/page.tsx` and
   `/store/[slug]/product/[productId]/page.tsx`. Verified genuinely missing:
   - `BreadcrumbList` on store/product pages.
   - `Organization` JSON-LD's `sameAs` array (social profile URLs) — currently
     absent from `app/[locale]/layout.tsx`'s `buildOrganizationJsonLd`.
   - `ItemList` structured data for category/collection pages — the schema
     already has `Category`/`Collection`/`StoreSection` models; audit whether
     these have indexable landing pages at all today, and if so whether they
     carry structured data (this is a long-tail-keyword surface classic to
     commerce sites, not currently addressed by any SEO plan in this repo).
   - **Explicitly out of scope, confirmed, not just unmentioned:** review/
     rating markup (`packages/db/prisma/schema.prisma` has no `Review` or rating
     model — no feature exists to mark up) and shipping/return-policy structured
     data (Google's guidance here targets traditional checkout flows; this
     repo's manual-payment/proof-of-payment model doesn't fit the schema cleanly
     — revisit only if that changes).
3. **Canonical/redirect strategy for store lifecycle events.** Not addressed by
   Phase B (which only fixes the _locale_ duplicate problem) or any prior plan:
   slug changes, store deactivation/deletion, and near-duplicate seller
   boilerplate (e.g. many stores using similar "official [artist] merch" copy)
   are a marketplace-specific duplicate/thin-content risk distinct from the
   founder/enterprise locale issue. Needs its own audit of what currently
   happens to a store's URL and sitemap entry across those lifecycle events.
4. **Alt-text convention for product images.** Carried forward from the
   2026-08-20 plan's Phase 5 (previously dropped from an earlier draft of this
   doc, restored here). No current repo-wide convention enforcing descriptive
   `alt` text on product/store images — affects image search discoverability and
   accessibility both. **Closed** by D8 of
   `docs/plans/2026-09-07-store-rich-content-and-thin-content-indexing-plan.md`:
   the convention is written up in `docs/core/product.md` §5.2.1 and enforced by
   the store-content forms + markdown renderer shipped in D2/D3.
5. **Mobile-first UX audit.** Carried forward from the 2026-08-20 plan's Phase 5
   (same restoration note as above). Google indexes mobile-first; this repo has
   no dedicated mobile UX audit on record.
6. **Core Web Vitals pass.** Not audited in this document — run the repo's
   `web-perf` skill against the storefront home, a store page, and `/search`
   (LCP/INP/CLS + render-blocking resources); a direct ranking factor with no
   prior coverage.
7. **Sitemap freshness signals.** `staticEntry()`/`storeEntry()`/ `blogEntry()`
   in `lib/sitemap/urls.ts` — confirm `storeEntry` reflects a real `updatedAt`
   (currently no `lastModified` field is set for stores, only blog entries take
   one). Stale/absent `lastModified` makes Google recrawl on its own schedule
   rather than being nudged by real change signals.

Prioritize Tier 3 item 1 (thin-content gating) first if only one Phase D item
ships soon — it's the one item on this list that gets structurally more
expensive the longer it's deferred, unlike the others.

## What NOT to do

- Don't remove or weaken any existing `noindex`/`robots.txt` rule to make a GSC
  row disappear — five of the seven rows are supposed to look like this.
- Don't build a second hreflang implementation alongside the sitemap's — Phase B
  consolidates onto one shared helper specifically to avoid this.
- Don't silently ship Phase C's Option 2 — it's a real reversal-adjacent
  decision (even though additive, not a reversal) that deserves the same
  explicit sign-off the 2026-08-14/2026-08-20 plans got before touching
  robots/indexing behavior, and it's more invasive than it first looks (see
  Phase C — two of the four layouts involved are Client Components and can't
  take a plain `metadata` export).
- Don't add both a `noindex` and a `robots.txt` disallow for the same page in
  one deploy if that page might currently be indexed — this is the general form
  of the ordering bug the 2026-08-14 account plan documented
  (disallow-before-noindex-is-seen makes a page permanently stuck until manually
  removed via GSC). Sequence it the way that plan did: confirm de-indexing
  progress first, add the `robots.txt` disallow only after.
- Don't reach for GSC's Disavow Links tool over one stray phantom 404 (Phase A,
  row 2) — Google's own guidance treats Disavow as a last resort for suspected
  negative-SEO/manual-action risk, not a routine response to a single unfamiliar
  referring URL.
- Don't scope Phase D's items as one PR — most have no shared dependency and
  mixing them raises review risk for no benefit. If Tier 3 item 1 (thin-content
  gating) ships, don't blanket-index every store regardless of content
  completeness in the meantime — that's the exact risk it exists to close.

## Review findings

Reviewed by two independent subagents (technical-accuracy pass +
strategy/completeness pass), same convention as the 2026-08-20 plan. Findings
folded into the phases above; raw classified list below for record-keeping.

**Round 1 — technical accuracy:** every file:line citation, grep claim, and
proposed code snippet checked against the live repo. Nearly all held up exactly
as written (the 12-page Phase B list, the `robots.ts`/Caddyfile/
canonical-regression.test.ts citations, the phantom-URL grep, the
`localeAlternates` type-soundness and no-circular-import check, the
`moduleResolution: "bundler"` scoping of the `.js`-extension rule to `apps/api`
only). Two real problems found and fixed above: (1) `/enterprise` is not in
`navbar.tsx` — only linked from a footer, corrected in Phase D Tier 2; (2) Phase
C's Option 2 as originally drafted doesn't compile — two of the three named
layouts are Client Components, corrected in Phase C.

**Round 2 — strategy/completeness:** bug/non-bug classification confirmed
defensible for all 7 rows. Phase D found too narrow given the "don't limit
yourself" instruction: missing thin-content/UGC indexing risk (the single
highest-leverage marketplace-specific item, now Tier 3 item 1), silently dropped
three items the 2026-08-20 plan's own Phase 5 had named (alt-text convention,
backlink strategy, mobile-first audit — restored), and missing social-sharing
metadata, category/collection structured data, review/rating markup scoping, and
store-lifecycle canonical strategy (all added). Also flagged the Phase D item 1
structured-data claim needed reconciling against what the 2026-08-20 plan said
already existed — checked directly: `Product`/`Offer` JSON-LD was already
implemented (`lib/product-json-ld.ts`), the original draft's claim it was
missing was wrong, corrected in Phase D Tier 3 item 2. Phasing notes applied:
consolidated the duplicated hreflang verification step into Phase B only, and
re-tiered Phase D (do-now vs. stakeholder-decision vs. needs-a-plan-doc) instead
of listing six items uniformly.

**Round 3 — verification of the revision itself:** checked every new claim added
while folding in rounds 1-2 (the OG-image gap, the `/enterprise` linking claim,
the thin-content sitemap-gating claim, the `sameAs`/ review-model absence) — all
confirmed accurate against the live repo. Caught one new error introduced by the
round-1/2 fix itself: Phase C's rewrite mis-stated 3 of 4 layouts as Client
Components when only 2 are (`(dashboard)/dashboard/[slug]/layout.tsx` is
actually already a Server Component) — this also meant Phase C contradicted
"What NOT to do"'s own (accidentally correct) "two of three" phrasing. Fixed:
Phase C now correctly scopes Option 2(a)'s refactor to the 2 actual Client
Component layouts, and "What NOT to do" now says "two of the four layouts."

No further findings after three rounds — the doc is clean.
