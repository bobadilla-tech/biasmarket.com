# SEO strategy review: GSC issues + full audit + remediation plan

**Status:** Reviewed by two independent subagents (technical-accuracy pass +
strategy/completeness pass). Revised below with their findings folded in — see
"Review findings" at the bottom for the raw classified list.

**Implementation status (2026-08-20):** Phases 0–4 implemented and verified
(build + `pnpm --filter web test` + manual `<head>`/`robots.txt` inspection).
Phase 5 explicitly not started — it needs its own follow-up plan doc, not inline
work here.

- **Phase 0** — confirmed: GSC property is a **Domain property** (user-checked
  in the GSC dashboard). No migration needed.
- **Phase 1** — done. `canonicalUrl(locale, path)` helper added to
  `lib/site-config.ts`; self-referential `alternates.canonical` wired into every
  indexable page's `generateMetadata` (home, `/founder`, `/enterprise`,
  `/contact`, `/for-sellers`, `/stores`, `/blog`, `/blog/[slug]`, `/search`,
  `/store/[slug]`, `/store/[slug]/product/[productId]`, and — found only while
  writing the Phase 4 regression test, not in the original plan's scope —
  `/store/[slug]/account` and `/store/[slug]/account/login`, both missed by the
  plan's own `-maxdepth 4` file search). The two dynamic storefront
  `generateMetadata` functions now type `locale` on `params`. `/search` resolved
  via self-canonical to its query-less base path (kept `noindex` meta, did
  **not** robots.txt-disallow it — disallowing would block Google from ever
  seeing the noindex tag). `x-default` hreflang added in `lib/sitemap/urls.ts`.
  `/account` robots.txt disallow shipped (`/en/account$`/`/es/account$`) — user
  confirmed recrawl via GSC.
- **Phase 2** — audit only, per product decision (`/es` stays canonical root, no
  routing change). Verified live: `http://biasmarket.com/` →
  `https://biasmarket.com/` (308) → `https://biasmarket.com/es` (307) — exactly
  the two documented hops, nothing longer. `www.biasmarket.com` is NXDOMAIN
  (intentionally unregistered, not a hidden second redirect chain).
- **Phase 3** — done. `api.biasmarket.com/robots.txt` now served at the Caddy
  layer (`infra/vps/Caddyfile`, `Disallow: /`) — not via Nest, since the global
  `api` prefix would otherwise put it at `/api/robots.txt`. Link-
  discoverability audit: `api.biasmarket.com` only appears in `apps/web` via
  `NEXT_PUBLIC_API_URL`, necessarily inlined into the client bundle for the
  browser to call the API — expected, not fixable without breaking the app; the
  robots.txt fix is the actual mitigation.
- **Phase 4 (mechanical parts)** — done. `Organization`/`WebSite` JSON-LD added
  to `app/[locale]/layout.tsx`. `NEXT_PUBLIC_SITE_URL` wired as a build ARG
  (`infra/docker/web.Dockerfile`) and through `cd.yml`'s build-args (**needs a
  `NEXT_PUBLIC_SITE_URL` repo/environment Variable added in GitHub settings
  before the next deploy — not done here, no CI/CD credentials in this
  session**); documented in `infra/vps/env/shared.env.example`.
  Canonical-regression test added:
  `apps/web/__tests__/canonical-regression.test.ts` walks every
  `app/[locale]/**/page.tsx`, excludes anything actually disallowed by
  `robots.ts` (derived from `robots.ts` itself, not hand-duplicated), and
  asserts every remaining page exports either `alternates.canonical` or
  `robots: { index: false }`. **This test caught a real, pre-existing bug while
  being written**: `robots.ts`'s `"/*/login"` entry used Google's actual
  wildcard semantics (`*` matches across `/`) and was unintentionally also
  disallowing `/store/[slug]/account/login` — the storefront buyer login page
  the 2026-08-14 plan explicitly wanted indexed. Fixed the same way that plan
  already fixed the identical collision class for `/account`: replaced the
  wildcard with explicit anchored `/en/login$`/`/es/login$` entries.
- **Phase 5** — not started, per plan's own framing. Flagged back to whoever
  prioritizes growth work rather than started inline.

## Business framing (added post-review — was missing from the first draft)

This plan started as root-causing three Search Console issues, all on
low-traffic pages (`/founder`, `/enterprise`, `/account`, `api.biasmarket.com`
root) — none of which are revenue-driving for a pre-revenue creator-commerce
marketplace. Before investing four phases of engineering: the GSC-flagged issues
are real but low-stakes (crawl hygiene, not a ranking or traffic emergency). The
higher-leverage SEO surface this repo already has infrastructure for and this
plan originally ignored — the Sanity-backed blog
(`apps/web/lib/sitemap/blog-source.ts`) and the `/for-sellers` acquisition page
— isn't touched by GSC's report because nothing is currently broken there, but
it's plausibly worth more organic-traffic investment than fixing
duplicate-canonical complaints on `/enterprise`. Recommendation: ship Phase 1
and 3 (cheap, mechanical, directly closes the reported issues) as-is, treat
Phase 2's redirect-hygiene question as a quick decision not a project, and scope
Phase 4/5 explicitly as "foundation for future content-driven SEO work" rather
than urgent — flag this framing to whoever prioritizes the work rather than
assuming engineering effort order equals business priority order.

**Source:** User pasted three Google Search Console "Page indexing" issues,
first detected 2026-08-14:

1. **Duplicate without user-selected canonical** — 3 affected pages, examples
   `https://biasmarket.com/es/enterprise`, `/es/founder`, `/es/account`.
2. **Not found (404)** — 1 affected page, example `https://api.biasmarket.com/`.
3. **Page with redirect** — 1 affected page, example `http://biasmarket.com/`.

This plan roots each of those in the actual code, then widens to a full SEO
audit since two of the three symptoms trace back to structural gaps (no
canonical tags anywhere, no root redirect handling) that will keep producing new
GSC issues as more pages ship, not just the ones currently flagged.

## Prior art — read before touching any of this

Two earlier plans already worked on adjacent ground. Don't duplicate or
contradict them:

- `docs/plans/2026-07-22-seo-discoverability.md` — built the original
  robots.txt/sitemap/metadata/JSON-LD baseline. Its own "Not done yet" section
  explicitly flags **no canonical `<link>` tags** as unstarted follow-up — that
  gap is the direct cause of GSC issue #1 below.
- `docs/plans/2026-08-14-seo-account-page-deindex-authguard-plan.md` — fixes
  `/account` being indexed at all (auth guard + noindex + robots disallow,
  rollout gated on confirming Google has recrawled). Status per that doc: step 1
  (noindex + guard) shipped, step 3 (`robots.txt` disallow lines for
  `/en/account$`/`/es/account$`) **explicitly withheld pending recrawl
  confirmation**. `/es/account` showing up in GSC issue #1 here is consistent
  with that plan's diagnosis — it's the same root cause (route-group
  URL-stripping meant `/*/dashboard*` never matched `/account`), now also
  surfacing as a canonical complaint because Google indexed both worthless
  states of the page. Don't re-litigate that plan's fix; step 3 of it is a
  prerequisite for this plan's `/account` canonical work being moot (once
  disallowed, canonical doesn't matter — see Phase 1 below).

## Root cause per GSC issue

### 1. Duplicate without user-selected canonical (`/es/enterprise`, `/es/founder`, `/es/account`)

No page in `apps/web` ever renders `<link rel="canonical">`. Confirmed by grep:
the only `alternates`/`canonical` hits in the whole app are inside
`apps/web/lib/sitemap/urls.ts` and `lib/sitemap/xml.ts`, which build the
sitemap's own `<xhtml:link rel="alternate" hreflang>` entries — that's a
sitemap-level signal, not a per-page `<head>` tag, and Google treats them as
weaker/insufficient for canonical selection on their own.

`apps/web/i18n/routing.ts` has `localePrefix` unset, which defaults (per
`next-intl`, confirmed in
`node_modules/next-intl/dist/esm/production/routing/config.js`) to
`mode: "always"` — every path is served under `/es/...` or `/en/...` with no
unprefixed canonical form. Combined with no `<link rel="canonical">`, Google has
two (or more, if any query-string variants exist) equally-valid- looking URLs
per logical page and no signal for which one is authoritative — textbook
"duplicate without user-selected canonical."

`/es/account` is a special case layered on top: it's the dashboard account page,
which per the 2026-08-14 plan should not be indexed at all. It's showing up as a
_duplicate_ rather than a clean 404/noindex because the noindex meta shipped but
the robots.txt disallow didn't (by design, per that plan's rollout ordering) —
Google has crawled and indexed both a stale and possibly a fresher crawl of a
page that keeps changing based on auth state at request time (session-dependent
rendering — logged-out vs. mid-redirect states can look like different content
to a crawler).

### 2. Not found — `https://api.biasmarket.com/`

`apps/api/src/main.ts` sets a global route prefix of `'api'`. `AppController`
has a `@Get()` root handler, but under the global prefix that's mounted at
`/api`, not `/`. `GET https://api.biasmarket.com/` therefore has no matching
route → 404. This is expected API behavior, not a bug — the actual problem is
that Google is crawling `api.biasmarket.com` at all. Likely cause: no
`robots.txt` served from the API subdomain, and/or the API subdomain is
discoverable via some external link (docs, DNS enumeration, or Google inferring
it from `api.biasmarket.com` appearing in `Access-Control-Allow-
Origin`/CORS
headers or JS bundle strings) and got crawled anyway.

### 3. Page with redirect — `http://biasmarket.com/`

Two redirects chain on the root URL:

1. `infra/vps/Caddyfile` has no explicit `http://biasmarket.com` block; Caddy's
   automatic HTTPS issues an implicit `http → https` redirect.
2. Once on `https://biasmarket.com/`, `apps/web/proxy.ts` runs `next-intl`'s
   `createMiddleware(routing)`. Because `localePrefix` defaults to `"always"`
   and `defaultLocale` is `"es"` (`apps/web/i18n/routing.ts`), `/` has no
   content of its own — it 307-redirects to `/es`.

So `http://biasmarket.com/` is actually two hops:
`http → https → https://biasmarket.com/es`. GSC flags the page as "has a
redirect" rather than indexing it directly, which is correct behavior for a
scheme redirect but means the _canonical entry point_ people/backlinks use (bare
`http://` or `https://` root) never gets indexed as such — everything accrues to
`/es` instead, which is fine for ranking consolidation as long as that's the
intended canonical target (it should be — see Phase 1).

## Wider audit findings (not yet flagged by GSC, but same class of gap)

- **No `Organization`/`WebSite` JSON-LD anywhere.** Only per-store pages
  (`(storefront)/store/[slug]/page.tsx`) have structured data
  (`OnlineStore`/`Product`/`Offer`). Marketing pages (home, `/founder`,
  `/enterprise`) have none — no brand entity for Google's Knowledge Panel /
  sitelinks search box eligibility.
- **`/enterprise` and `/founder` are indexable and sitemap-submitted with no
  canonical.** Both are static marketing pages, so once canonicals ship
  (Phase 1) this resolves itself — flagged here only so the fix isn't scoped to
  `/account` alone.
- **`robots.txt` has no entry for the `api.biasmarket.com` subdomain at all** —
  Nest doesn't serve one, and nothing else does either. Root cause of GSC issue
  #2's crawl in the first place.
- **No `www.biasmarket.com` handling investigated.** Caddyfile only has a
  `biasmarket.com` block; unclear if `www.biasmarket.com` resolves at all (DNS)
  or 404s/times out if it does — worth a quick check so it isn't a second,
  undiscovered version of GSC issue #3.
- **`NEXT_PUBLIC_SITE_URL` still unset in any env file**, per the 2026-07-22
  plan's own "not done yet" note — `metadataBase` and the sitemap currently work
  only because of the hardcoded `https://biasmarket.com` fallback in
  `lib/site-config.ts`. Fragile: an unnoticed env mismatch (e.g. a staging
  deploy without the var) would silently self-canonicalize onto production URLs.
- **`sitemap.xml`'s hreflang alternates and any future `<link rel="canonical">`
  need to agree with each other.** If canonical tags point `/es/X` at itself and
  hreflang says `/es/X` and `/en/X` are alternates of each other, that's correct
  (self-referential canonical + hreflang siblings) — but worth an explicit test
  case in Phase 1 since it's an easy way to reintroduce "duplicate" complaints
  if canonical is implemented as "always point at default locale" instead of
  self-referential per locale.

## Plan

### Phase 0 — Search Console property check (do this first, cheap)

- Confirm whether the verified GSC property is a **Domain property**
  (auto-aggregates all scheme/subdomain/www variants) or a **URL-prefix
  property** (separate property per exact scheme+host, the classic
  www/non-www/http/https fragmentation trap). This directly targets why
  `http://biasmarket.com/` shows as its own issue rather than being folded into
  the main property's data, and it's a five-minute check in the GSC UI before
  writing any Phase 2 code.
- If URL-prefix: consider migrating to a Domain property so future
  scheme/subdomain variants don't produce phantom "separate page" issues.

### Phase 1 — canonical tags (fixes GSC issue #1, prevents recurrence)

- Add `alternates.canonical` to every page's `generateMetadata`/`metadata`
  export, self-referential per-locale (i.e. `/es/enterprise`'s canonical is
  itself, not `/en/enterprise` or a locale-less URL) — this is the standard
  pattern for locale-prefixed sites and matches the existing sitemap hreflang
  behavior, so the two signals agree.
- Cheapest correct implementation: compute canonical centrally (helper in
  `apps/web/lib/site-config.ts` or similar, taking `locale` + a literal
  `pathname` string passed by the caller — the helper can't derive pathname on
  its own for static marketing routes, each call site still passes its own path,
  e.g. `canonicalUrl(locale, "/enterprise")`) and call it from each page's
  `generateMetadata`.
- **Known exception, not "every page already has locale":** two dynamic
  storefront `generateMetadata` functions don't type `locale` on `params` today
  and need a one-line fix first —
  `apps/web/app/[locale]/(storefront)/store/[slug]/page.tsx:95-99` and
  `.../store/[slug]/product/[productId]/page.tsx:27-30` both type
  `params: Promise<{ slug: string }>` (or `+ productId`) with no `locale`,
  unlike every other `generateMetadata` in the app. Add `locale: Locale` to both
  params types before wiring in the canonical helper — these are also the two
  pages most exposed to duplicate-content risk (public storefront + product
  pages), so don't defer this past Phase 1.
- While touching `lib/sitemap/urls.ts`'s hreflang alternates in this phase, also
  add an `x-default` hreflang entry (currently missing — only `es`/`en` siblings
  exist) — cheap to bundle in since canonical/hreflang agreement is already the
  focus here.
- **Resolve `/search` in the same phase**, not as a follow-up: it's a
  query-string-driven page, in neither `robots.ts`'s disallow list nor the
  sitemap, and was flagged as an open, unresolved item by the 2026-08-14 plan
  already. Crawlable-but-unsubmitted query-string pages are a classic vector for
  exactly the duplicate/thin-content class of issue this plan exists to close —
  decide disallow vs. canonical-to-base-path and ship it here.
- Complete the 2026-08-14 plan's withheld step 3 for `/account` (`robots.txt`
  disallow for `/en/account$`/`/es/account$`) as part of this phase, _if_ Search
  Console confirms recrawl has happened (check `site:biasmarket.com/*/account`
  or the Coverage report before shipping — don't skip that check just because
  this plan bundles it).

### Phase 2 — root redirect hygiene (fixes GSC issue #3)

- Confirm `http → https` is the only hop Caddy adds (no separate www redirect
  chain) and that `https://biasmarket.com/` → `/es` is a single 307, not chained
  further. If it's more than the documented two hops, investigate.
- Decide and document intended canonical root: is `/es` (default locale) meant
  to be the "home" experience for `biasmarket.com/`, or should the bare domain
  itself resolve without a locale-prefix redirect (e.g. content negotiation via
  `Accept-Language`, matching next-intl's non-"always" prefix modes)? This is a
  product decision, not just technical — flag for the plan's implementer to
  confirm with whoever owns locale strategy rather than assuming.
- Check `www.biasmarket.com` DNS/Caddy behavior explicitly; add a redirect or
  confirm it's intentionally unregistered.

### Phase 3 — API subdomain hygiene (fixes GSC issue #2)

- Serve a minimal `robots.txt` from `api.biasmarket.com` disallowing `/`
  entirely — the API has no content Google should ever index.
- Audit where `api.biasmarket.com` might be link-discoverable from public
  HTML/JS (check for it appearing unobfuscated in any `apps/web` client bundle
  beyond fetch calls, canonical `Access-Control-Allow-Origin` responses, or
  `sitemap.xml`/`robots.txt` cross-references) — the goal is reducing future
  crawl attempts, not just returning correct 404s for ones that happen anyway.
- No functional API change needed for the 404 itself — root returning 404 under
  the `'api'` global prefix is correct REST behavior, not a bug to fix.

### Phase 4 — structural improvements (not GSC-flagged, preventive)

- Add `Organization`/`WebSite` JSON-LD to the root marketing layout
  (`apps/web/app/[locale]/layout.tsx` or homepage) — brand entity data, separate
  from the existing per-store `OnlineStore` schema.
- Set `NEXT_PUBLIC_SITE_URL` explicitly in every deploy env (production at
  minimum) instead of relying on the hardcoded fallback — close the "silently
  correct only by accident" gap from the 2026-07-22 plan.
- Add a lightweight regression check (could be a vitest test or a manual
  post-deploy checklist item) that asserts every page under `app/[locale]`
  either exports a canonical or is intentionally `noindex`'d — prevents this
  exact class of bug (new page ships, nobody remembers canonical) from recurring
  as the site grows.
- Flag `:slug.biasmarket.com` per-store subdomain routing (documented as planned
  in `docs/core/roadmap.md`/`docs/core/product.md`'s non-goals, once store count
  justifies it) as tracked future debt against Phase 1's canonical scheme: when
  that ships, every `/store/[slug]` canonical + hreflang pair built in this plan
  needs a 301-redirect migration plan. Not in scope now — just don't let it be a
  surprise later.

### Phase 5 — content/acquisition SEO (foundation, not urgent — see business framing above)

- The Sanity-backed blog (`apps/web/lib/sitemap/blog-source.ts`) and
  `/for-sellers` (seller-acquisition marketing page) are the two highest-
  leverage organic-acquisition surfaces already built in this codebase and
  received zero attention in the original GSC-driven scope of this plan. Neither
  is broken today, so this isn't a bug-fix phase — it's a follow-up scoping
  exercise (separate plan doc) to decide: content cadence/strategy for the blog,
  whether `/for-sellers` needs its own structured data/canonical treatment ahead
  of the generic Phase 1 sweep, and whether `/founder`/`/enterprise` actually
  deserve indexing priority at all given neither matches the search intent of a
  K-pop fan (buyer) or a prospective seller (`/for-sellers`'s actual audience).
- Add `BreadcrumbList` JSON-LD and rich-result-eligibility fields
  (`availability`, `priceValidUntil`) to the existing per-store
  `Product`/`Offer` schema (`(storefront)/store/[slug]/page.tsx`) — cheap
  additions on top of Phase 4's `Organization`/`WebSite` work, aimed at
  sitelinks/rich-result eligibility for the pages that actually drive revenue.
- Document an alt-text convention for product images (`product.md` §5.2 allows
  up to 5 images per product; no alt-text requirement exists anywhere in the
  codebase docs today).
- Note, explicitly deferred rather than silently dropped: performance
  budget/Core Web Vitals tracking, mobile-first UX audit, and backlink/off- page
  strategy are real parts of a full SEO audit that this plan does not cover.
  Given the WhatsApp-driven, mobile-heavy checkout flow (`product.md` §5.6),
  Core Web Vitals plausibly matters more to conversion than the crawl-hygiene
  fixes above — worth its own follow-up audit (PageSpeed Insights / Lighthouse
  pass), not bundled into this plan.

## Open questions

1. Is `es` as `defaultLocale` with `localePrefix: "always"` (no unprefixed `/`
   route) an intentional decision, or should `/` serve content directly for one
   locale? Affects Phase 2's scope significantly.
2. Should Search Console's URL Removal tool be used for `api.biasmarket.com/`
   and any other stray indexed API URLs to speed up deindexing, on top of the
   `robots.txt` fix in Phase 3? (Same tradeoff the 2026-08-14 plan already
   flagged for `/account`: faster but temporary, ~6 months, still needs the
   permanent fix underneath.)
3. Does canonicalizing to self-referential per-locale URLs (Phase 1) risk
   splitting ranking signal between `/es/X` and `/en/X` when they're
   substantially the same content translated? Resolved by review: no —
   self-referential canonical + hreflang siblings is Google's documented correct
   multilingual pattern, not a flaw in this plan's approach. One caveat worth
   keeping in mind operationally: Google's algorithm can still override
   rel=canonical/hreflang hints and collapse near-duplicate _thin_ translated
   pages regardless of the tag (most likely on `/founder`/`/enterprise`, least
   likely on real per-store content) — not a reason to change the approach, just
   don't be surprised if a thin marketing page still gets folded post-fix.
4. Business-impact sizing: how much organic traffic/signal is actually at stake
   on `/founder`/`/enterprise`/`/account` vs. investing the same engineering
   time in Phase 5's blog/`for-sellers` work instead? Not answerable from the
   codebase — needs whoever owns growth/marketing.
5. Given `product.md`'s Yape/Plin payment methods signal a Peru/LatAm-first
   market, is EN-locale indexing worth the same investment as ES, or should EN
   be treated as secondary? Speculative — flag for the same stakeholder as #4,
   not a blocker for shipping Phase 1-3.

## Testing / verification

- `pnpm --filter web build` then inspect rendered `<head>` for a sample of pages
  (home, `/enterprise`, `/founder`, a `/store/[slug]` page) in both locales —
  confirm canonical tags present and self-referential.
- `curl -I http://biasmarket.com/` and trace the full redirect chain end-to-end
  (through Caddy and next-intl) post-Phase-2 fix.
- `curl https://api.biasmarket.com/robots.txt` post-Phase-3 fix — confirm
  `Disallow: /`.
- Re-check Search Console's three flagged issues after next recrawl cycle
  (days–weeks, not immediate) — this is the actual acceptance criterion, not
  something verifiable at deploy time.
- Run Google's **Rich Results Test** against the new Organization/WebSite
  JSON-LD (Phase 4) and a sample store page's existing Product/Offer schema — a
  `<head>` inspection confirms the tag is _present_, not that it's semantically
  valid; Rich Results Test catches syntactically-fine-but- invalid structured
  data that manual inspection won't.
- Run a **Mobile-Friendly/Mobile Usability** check and a PageSpeed Insights/Core
  Web Vitals pass at least once as a baseline, even though performance work
  itself is deferred to a future audit (see Phase 5) — worth knowing the
  starting number now rather than finding out later.
- Confirm the GSC property type per Phase 0 before/after the Phase 2 redirect
  fix — a Domain-property migration (if needed) should be verified separately
  from the code-level redirect check.

## Review findings (from two independent subagent passes)

**Technical-accuracy pass** — verified every citation in this plan against the
actual repo/`node_modules` rather than trusting the draft's own claims. Core
diagnosis of all three GSC issues held up with no high-severity errors. One
medium finding (folded into Phase 1 above): the "every page already has `locale`
available" claim was false for two `generateMetadata` functions in the
storefront/product dynamic routes. Two low findings also folded in above:
pathname must still be passed per call site (helper can't derive it), and
`x-default` hreflang was missing from the sitemap.

**Strategy/completeness pass** — found the plan's phase-by-phase engineering was
technically sound but reactive: it never sized business impact before committing
four (now five) phases of work, never questioned whether
`/founder`/`/enterprise` deserve indexing priority, and ignored the two
acquisition-relevant surfaces (blog, `/for-sellers`) that already have
infrastructure in the repo. High-severity findings folded into the new "Business
framing" section and Phase 5 above. Medium findings (GSC property type,
`/search` resolution, SEO-tool-based testing, Core Web Vitals) folded into Phase
0, Phase 1, and the Testing section above. Low findings (self-referential
canonical caveat, EN-locale investment question) folded into "Open questions"
above.
