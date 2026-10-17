# Fix DYNAMIC_SERVER_USAGE crash in the blog feature

## Status

Landed.

## Context

Production Sentry reported a `DYNAMIC_SERVER_USAGE` digest crash on a Server
Component render shortly after the Sanity-CMS blog feature (PR #105) shipped.

Root cause: `next-intl` v4 needs `setRequestLocale(locale)` called early in any
page/layout meant to render statically. This repo never called it anywhere.
Without it, the request locale falls back to a dynamic `headers()` read in two
places — `NextIntlClientProvider` in the root layout (it was given `locale` but
not `messages`, so next-intl fills `messages` via an internal bare, locale-less
`getMessages()` call), and several bare `getTranslations("namespace")` calls
with no explicit locale.

This was latent everywhere but harmless, because it only throws when Next
actually runs a route through its static/ISR prerender pass — and until the blog
feature, the only `generateStaticParams` in the codebase was the root layout's
own locale-only one, which resolves before any nested route attempts real static
generation. `apps/web/app/[locale]/(marketing)/blog/[slug]/page.tsx`'s
`generateStaticParams` was the first page-level one ever added, making
`/[locale]/blog/[slug]` the first route to enter the prerender pass where the
hidden dynamic read throws.

## What changed

**Crash fix.** `apps/web/app/[locale]/layout.tsx` now calls
`setRequestLocale(locale)` in both `RootLayout` and its `generateMetadata`,
before any translation lookup. The two blog pages
(`app/[locale]/(marketing)/blog/page.tsx`,
`app/[locale]/(marketing)/blog/[slug]/page.tsx`) do the same in their page
components and `generateMetadata`. Three bare `getTranslations("ns")` calls (no
explicit locale) were fixed: `store/[slug]/page.tsx` and
`store/[slug]/product/[productId]/page.tsx` now pass `{ locale, namespace }`
explicitly; `app/[locale]/not-found.tsx` needed no change — Next's
`not-found.js` accepts no props, so it can't take an explicit locale, and it now
correctly inherits the locale next-intl's request-scoped cache holds from the
ancestor root layout's `setRequestLocale` call.

**Unanticipated side effect, caught by verification, contained.** Because the
root layout's hidden `headers()` read was the _only_ thing forcing nearly every
`[locale]` route to render dynamically, fixing it flipped 14 other routes to
static output at build time (`/[locale]/account`, all three `/admin/*` pages,
`/blog`, `/contact`, `/enterprise`, `/for-sellers`, `/founder`, `/login`,
`/onboarding`, `/onboarding/create-store`, `/stores`). Verified each is a pure
client-shell page (data fetched client-side post-hydration, no server-rendered
per-user data) — safe to go static. The home page
(`app/[locale]/(marketing)/page.tsx`) was the one exception: it server-renders
live `latestTrend`/`bestSellers`/`discoverProducts` data via
`getHomeDiscoveryData()` with no revalidate config, so letting it go static
would have frozen "latest"/"bestseller" listings at build time until the next
deploy. Pinned it with `export const dynamic = "force-dynamic"` to preserve its
existing always-fresh behavior. No other page in the diff was touched — the
broader sitewide `setRequestLocale`/revalidation-strategy decision for the
remaining pages stays a separate, deliberate followup, not a side effect of this
fix.

**Error swallowing fixed.** `features/blog/server.ts`'s `getBlogPosts`/
`getBlogPost` had bare `catch { return [] }`/`catch { return null }` — a real
Sanity outage or schema drift degraded silently with zero operator signal. Both
now report via a new shared `apps/web/lib/report-server-error.ts` (dynamic
`@sentry/node` import, matching `instrumentation.ts`'s Edge-safety convention)
before degrading, and rethrow instead of swallowing when the error carries a
`DYNAMIC_SERVER_USAGE` or `NEXT_HTTP_ERROR_FALLBACK` digest — Next's own
control-flow signals, which must never be treated as a real fetch failure. The
identical fix was applied to `features/discovery/server.ts`'s `fetchProducts`
and `app/sitemap.ts`'s `getStoreSlugs`/`getBlogPostSlugs`. Covered by
`features/blog/server.test.ts`.

**Turbo cache blind spot.** `turbo.json`'s `globalEnv` was missing
`NEXT_PUBLIC_SANITY_PROJECT_ID`/`NEXT_PUBLIC_SANITY_DATASET` — the two Sanity
vars that actually affect `apps/web`'s build output (confirmed against the
Docker `ARG`s in `infra/docker/web.Dockerfile` and `.github/workflows/cd.yml`).
Added both, so Turbo's cache fingerprint correctly accounts for them.

**i18n dist staleness — checked, not a real bug.** `packages/i18n/dist/` (a
gitignored `tsc` build artifact) was found locally missing `blog.json`/
`for-sellers.json`, initially raising a concern about `web#build` running before
`packages/i18n#build`. Confirmed via
`pnpm turbo run build --filter=web
--dry=json` that `web#build` already lists
`@biasmarket/i18n#build` as a dependency (Turbo derives this from the
`workspace:*` dependency in `apps/web/package.json`), and `dist/**` is a
cached/restored Turbo output — no ordering gap exists. The missing files were
local checkout staleness, resolved by the next build.

## Verification

`pnpm build --filter=web` (clean, no `MISSING_MESSAGE`/dynamic-route errors),
`pnpm --filter web test` (59 files / 240 tests passing),
`pnpm --filter web
typecheck` (clean) — all run after the fix, confirming the
static/dynamic route split above and no regressions.

## Deferred (not done in this PR)

- Sitewide `setRequestLocale` + explicit revalidation-strategy sweep for the
  remaining `[locale]` pages that could statically render — a deliberate,
  separately-reviewed decision per page group, not a lint-style sweep.
- `PortableText` explicit serializer allow-list in
  `features/blog/components/blog-post-view.tsx` — low risk today, no raw-HTML
  Sanity block type exists.
- `cache()`-wrapping `app/sitemap.ts`'s slug fetchers — wasteful re-fetch per
  sitemap chunk, not a correctness bug at current content volume.
- Rate limiting on `app/api/blog/revalidate/route.ts` — already
  HMAC-signature-verified, low severity.
