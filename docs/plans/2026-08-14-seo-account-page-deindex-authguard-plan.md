# De-index authenticated pages + add client-side auth guard

**Status:** Draft, under review.

**Source:** User report — `site:biasmarket.com` shows `/en/account` (and its
`/es/` translation) indexed by Google despite it being a signed-in-only
dashboard page. Clicking the indexed result from Google as a logged-out visitor
loads the full page shell (title, "Signed in as" card, change-password form)
instead of redirecting to login, with the store-list panel showing a "Network
error" message — screenshot attached to the report shows 4× `401` on
`api.biasmarket.com/api/me/stores` in devtools.

## Context

Two independent bugs, one shared symptom (bad experience on `/account` for a
logged-out visitor arriving from Google):

### Bug 1 — SEO: `/account` is crawlable and indexed

`apps/web/app/robots.ts` disallows:

```
/*/login
/*/onboarding
/*/onboarding/*
/*/dashboard
/*/dashboard/*
/*/admin
/*/admin/*
/*/store/*/cart
/*/store/*/checkout
```

`/*/account` (the route at `apps/web/app/[locale]/(dashboard)/account/page.tsx`)
is not in this list, and was never added — the route lives in the `(dashboard)`
route group (same group as `/dashboard`, which _is_ disallowed) but Next.js
route groups are stripped from the URL, so `disallow: "/*/dashboard"` never
matched `/en/account` in the first place. `apps/web/app/sitemap.ts`'s
`STATIC_PATHS` (`""`, `/blog`, `/founder`, `/enterprise`) doesn't include it
either, so it wasn't _submitted_ for indexing — Google found and indexed it by
crawling the site's internal links (it's linked from the header/nav for
signed-in users) or the historical sitemap, not because we asked it to.

This is why the SERP screenshot shows real, human-written meta descriptions for
`/account` (`Mi cuenta`, `My account`) — `generateMetadata` in
`account/page.tsx` and `account/confirm/page.tsx` (storefront variant) both
produce real per-locale titles, nothing accidental in the metadata itself, just
missing `disallow` coverage.

**Other pages with the same gap**, checked against the current route tree
(`apps/web/app/[locale]/*`):

| Route (URL, group stripped)              | In `robots.ts` disallow? | Should be?                                                                                                                                                                                         |
| ---------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/account`                               | No                       | Yes — signed-in only                                                                                                                                                                               |
| `/store/[slug]/account`                  | No                       | **No** — storefront login/register landing, buyer-facing, fine to index like any storefront page                                                                                                   |
| `/store/[slug]/account/login`            | No                       | Yes — auth form, no unique content                                                                                                                                                                 |
| `/store/[slug]/account/forgot-password`  | No                       | Yes — auth form                                                                                                                                                                                    |
| `/store/[slug]/account/confirm`          | No                       | Yes — email-confirmation landing, token-bearing, no evergreen content                                                                                                                              |
| `/store/[slug]/account/orders/[orderId]` | No                       | Yes — buyer's private order detail                                                                                                                                                                 |
| `/dashboard/[slug]/*`                    | Yes (`/*/dashboard/*`)   | Already covered                                                                                                                                                                                    |
| `/admin/*`                               | Yes (`/*/admin/*`)       | Already covered                                                                                                                                                                                    |
| `/onboarding/*`                          | Yes (`/*/onboarding/*`)  | Already covered                                                                                                                                                                                    |
| `/verify-email`                          | No                       | Yes — token-bearing, no evergreen content                                                                                                                                                          |
| `/search`                                | No                       | Confirm intentional — likely fine to leave indexable (public product search), but double check it doesn't leak query-string-driven duplicate-content pages; not a blocker for this plan, note only |

**Fix:**

```diff
 disallow: [
   "/*/login",
   "/*/onboarding",
   "/*/onboarding/*",
   "/*/dashboard",
   "/*/dashboard/*",
   "/*/admin",
   "/*/admin/*",
   "/*/store/*/cart",
   "/*/store/*/checkout",
+  "/*/account",
+  "/*/store/*/account/login",
+  "/*/store/*/account/forgot-password",
+  "/*/store/*/account/confirm",
+  "/*/store/*/account/orders",
+  "/*/store/*/account/orders/*",
+  "/*/verify-email",
 ],
```

Also add a `noindex` `robots` meta tag directly in `generateMetadata` for
`/account` (and the other now-disallowed pages that currently export
`generateMetadata`) as defense in depth — `robots.txt` only stops crawling of
_new_ links, it doesn't retroactively deindex a URL Google already has, and a
`noindex` meta tag is the mechanism that actually removes an indexed URL once
Google recrawls it. Both are needed; neither alone is sufficient (see rollout
step below).

### Bug 2 — no auth guard on `(dashboard)` routes

`apps/web/app/[locale]/(dashboard)/layout.tsx` renders `children` directly, no
session check:

```tsx
export default function DashboardLayout(
  { children }: { children: React.ReactNode },
) {
  return (
    <>
      <ImpersonationBanner />
      {children}
    </>
  );
}
```

Neither this layout nor `account/page.tsx` nor `dashboard/[slug]/layout.tsx`
checks `authClient.useSession()` before rendering. `account-page-client.tsx`
calls `authClient.useSession()` and `useMyStores()` directly in the component
body and renders the full page shell regardless of auth state — when logged out,
`session` is `undefined` (rendered blank, not a redirect) and `useMyStores()`'s
underlying `GET /api/me/stores` 401s, which `ErrorState` renders as a generic
"Network error" (the screenshot's behavior, exactly).

The codebase already has the correct pattern one route over, unused here:
`apps/web/app/[locale]/(dashboard)/admin/layout.tsx`:

```tsx
const { data: session, isPending } = authClient.useSession();
const isAdmin = session?.user.role === "admin";
useEffect(() => {
  if (!isPending && !isAdmin && !impersonatedBy) {
    router.push("/dashboard");
  }
}, [isPending, isAdmin, impersonatedBy, router]);
if (isPending || (!isAdmin && !impersonatedBy)) return null;
```

**Fix:** move an equivalent guard up to `(dashboard)/layout.tsx` so it covers
`/account`, `/dashboard/[slug]/*`, and `/admin/*` (admin's own layout keeps its
extra `isAdmin` check on top) in one place instead of duplicating a `useEffect`
per page:

```tsx
"use client";
import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "@/i18n/navigation";
import { ImpersonationBanner } from "@/components/dashboard/impersonation-banner";

export default function DashboardLayout(
  { children }: { children: React.ReactNode },
) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/login");
    }
  }, [isPending, session, router]);

  if (isPending || !session) return null;

  return (
    <>
      <ImpersonationBanner />
      {children}
    </>
  );
}
```

Confirm the redirect target — `/login` is at
`apps/web/app/[locale]/(onboarding)/login/page.tsx`, check it accepts a
`?redirect=` or `?from=` param already (grep before assuming); if not, decide
whether to add one so a signed-in-after-redirect visitor lands back on
`/account` rather than the login page's default destination. This is a UX
nicety, not a blocker — ship without it if it's not already there and the param
plumbing turns out to be non-trivial.

**Note on defense-in-depth:** this is a client-side guard only (matches the
existing `admin/layout.tsx` pattern) — it stops the broken-page UX but is not a
substitute for server-side authorization. The actual data protection is already
correctly enforced API-side (`GET /api/me/stores` 401s without a valid session,
per this repo's `assertOwnership` convention) — this fix is purely about not
rendering a blank/broken shell before the client-side redirect kicks in, and
about closing off the perception (from the screenshot) that the page "loads with
no data" rather than clearly bouncing to login.

## Open questions for reviewers

1. Should `/store/[slug]/account` (the storefront buyer landing, not the
   dashboard one) also get a `noindex`, or is it fine to stay indexable as
   buyer-facing storefront content? Current lean: leave indexable, it's not the
   page from the bug report and has real per-store content.
2. Does `/login` (`(onboarding)/login`) already support a post-login redirect
   target? If yes, wire the new guard to use it; if no, is it in scope here or a
   follow-up?
3. Any other `(dashboard)` pages beyond `/account` currently reachable and
   rendering a broken shell for logged-out users that this plan should enumerate
   explicitly (e.g. does `/dashboard/[slug]` itself have the exact same
   blank-shell behavior today, or does something else already save it)?
4. Should the fix request de-indexing directly via Search Console (Removals
   tool) for `/account`, `/enterprise`... wait, `/enterprise`'s fine — for
   `/en/account` and `/es/account` specifically, rather than waiting for Google
   to recrawl and honor the new `noindex`? Recrawl can take days–weeks; Search
   Console removal is near-immediate but temporary (~6 months) and still
   requires the underlying `noindex`/`robots.txt` fix to be permanent.

## Rollout order (robots.txt + noindex interact; get this right)

1. Ship the `noindex` meta tag on `/account` **and keep it out of `robots.txt`'s
   disallow list initially** — a page that's both `robots.txt`-disallowed and
   `noindex`'d can't be deindexed, because Googlebot won't crawl it to see the
   `noindex` tag in the first place. This is the classic robots.txt/noindex
   ordering mistake; sequence matters here.
2. Wait for Google to recrawl and drop `/account` from the index (verify via
   Search Console coverage report, or a follow-up `site:biasmarket.com` search),
   or force it immediately via Search Console's Removals tool per open
   question 4.
3. Once confirmed deindexed, add `/*/account` to `robots.txt`'s `disallow` to
   stop future crawl attempts.
4. For the other pages in the table with no meaningful risk of already being
   indexed (`/store/[slug]/account/login`, `/forgot-password`, `/confirm`,
   `/verify-email`, order-detail pages) — these can go straight into
   `robots.txt`'s disallow list without the noindex-first dance, since (per the
   `site:biasmarket.com` results in the report) only `/account` appears to
   actually be indexed today. Confirm none of the others show up in
   `site:biasmarket.com` before skipping their noindex step.

## Testing

- `pnpm --filter web build` then inspect emitted `robots.txt` output (or
  `curl
  localhost:3001/robots.txt` against `pnpm --filter web dev`) for the
  new disallow rules.
- Manually hit `/en/account` in an incognito window (no session cookie) before
  and after the layout fix — confirm redirect to `/en/login`, no flash of the
  authenticated shell, no console 401s.
- Confirm `/en/dashboard/<slug>` and `/en/admin` also redirect correctly for a
  logged-out visitor post-fix (shared layout change affects all three).
- Confirm a logged-in seller can still reach `/account`, `/dashboard/[slug]`,
  and (if admin) `/admin` normally — the guard must not regress the happy path.
- No automated test coverage exists for either bug currently (`apps/web` test
  suite; check `features/account` and dashboard route tests before assuming);
  consider whether this plan should add a vitest/RTL test for the new layout
  guard (`session === undefined` → `router.push` called) rather than relying on
  manual verification alone.
