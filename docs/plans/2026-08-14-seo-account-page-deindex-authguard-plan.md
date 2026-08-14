# De-index authenticated pages + add client-side auth guard

**Status:** Reviewed (4 rounds, multi-agent), ready for implementation. Not yet
implemented.

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

**Fix — corrected after round-1 review caught a wildcard collision bug in the
first draft:** Google's robots.txt `*` matches across `/` with no implicit
end-anchor, so a naive `"/*/account"` line doesn't just match `/en/account` — it
also matches `/en/store/some-slug/account` (the storefront buyer landing, which
the table below says should stay indexable) and anything else ending in
`/account`. Two fixes for this: (1) anchor with a trailing `$` so it only
matches the literal end of path, and (2) since a `$`-anchored `/*/account$`
would _still_ match both routes (the storefront path also ends in exactly
`/account`), enumerate the two locales literally instead of using the site's
usual single-wildcard-per-locale convention — this repo only has `es`/`en`
(`apps/web/i18n/routing.ts`), so this is a two-line exception, not an unbounded
list. Also dropped `/*/store/*/account/login` from the original draft: it's
redundant, already covered by the existing un-anchored `/*/login` rule (same
across-`/` wildcard behavior makes `/*/login` match any path ending in `/login`,
including the nested storefront one) — verified the other new
`/*/store/*/account/*` lines aren't similarly redundant before keeping them.

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
+  "/en/account$",
+  "/es/account$",
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
step below). Because `noindex` lives in `(dashboard)/account/page.tsx`'s own
`generateMetadata`, it is inherently specific to that one route and has none of
the wildcard-collision risk above.

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
per page. Extract it as a shared `useRequireAuth()` hook (it has a second call
site below, in `MyStoresList`) rather than inlining the `useEffect` per call
site — `apps/web/hooks/use-session.ts` already exists as a thin wrapper
returning `{ session, user, isPending, isAuthenticated, error }`; build
`useRequireAuth()` on top of it, not on a second raw `authClient.useSession()`
call, so the two hooks stay composed instead of duplicating the same underlying
call. `admin/layout.tsx`'s existing raw `authClient.useSession()` + inline
`useEffect` is prior art for the _behavior_ this fix wants, not something to
copy verbatim — the whole point of extracting the hook is that neither call site
re-derives this logic by hand.

**Round-3 review caught that the first draft of this section described the hook
in prose but the code samples still called `authClient.useSession()` directly
and never showed the hook's own body** — fixing that here with the actual
implementation, since without it an implementer would have no
`hooks/use-require-auth.ts` to import from in either call site below:

```tsx
// apps/web/hooks/use-require-auth.ts
"use client";
import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useSession } from "./use-session";

export function useRequireAuth() {
  const router = useRouter();
  const { isPending, isAuthenticated } = useSession();

  useEffect(() => {
    if (!isPending && !isAuthenticated) {
      router.push("/login");
    }
  }, [isPending, isAuthenticated, router]);

  // isReady = "safe to render the authenticated content now." Callers must
  // return null (or otherwise not render tenant-data-fetching children) while
  // this is false — the useEffect above only fires the redirect, it doesn't
  // stop the current render from happening first.
  return { isPending, isAuthenticated, isReady: !isPending && isAuthenticated };
}
```

```tsx
// apps/web/app/[locale]/(dashboard)/layout.tsx
"use client";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { ImpersonationBanner } from "@/components/dashboard/impersonation-banner";

export default function DashboardLayout(
  { children }: { children: React.ReactNode },
) {
  const { isReady } = useRequireAuth();

  if (!isReady) return null;

  return (
    <>
      <ImpersonationBanner />
      {children}
    </>
  );
}
```

**Redirect target — resolved by round-1 review, was an open question in the
first draft:** `/login` does **not** support a post-login redirect target today.
`features/auth/components/login-form.tsx`'s `onSubmit` hardcodes the post-login
destination purely by role/store-count, with no query-param read at all — so
wiring the new guard to a `?redirect=` param isn't just
`router.push("/login?redirect=...")` in the guard, `LoginForm.onSubmit` itself
would need new branching to read and prioritize that param over its existing
logic. Decision: **out of scope for this plan.** Ship the guard redirecting to a
plain `/login` with no param; a signed-in-after-redirect visitor lands on
whatever `LoginForm` already sends them to today (same as if they'd navigated to
`/login` directly). Revisit as a follow-up if the resulting UX (landing on the
default destination instead of back on `/account`) turns out to bother users in
practice.

**Note on defense-in-depth:** this is a client-side guard only (matches the
existing `admin/layout.tsx` pattern) — it stops the broken-page UX but is not a
substitute for server-side authorization. The actual data protection is already
correctly enforced API-side (`GET /api/me/stores` 401s without a valid session,
per this repo's `assertOwnership` convention) — this fix is purely about not
rendering a blank/broken shell before the client-side redirect kicks in, and
about closing off the perception (from the screenshot) that the page "loads with
no data" rather than clearly bouncing to login.

**Alternative considered and rejected — server-side redirect in `proxy.ts`:**
round-1 review raised whether a server-side redirect would be strictly better
than a client-side one, since it would also stop Googlebot from ever rendering
the authenticated shell in the first place (closing Bug 1 and Bug 2 with one
fix). This repo is on Next.js 16, which renamed `middleware.ts` to `proxy.ts` —
`apps/web/proxy.ts` already exists, running `next-intl`'s `createMiddleware` on
nearly every route. It was investigated and rejected for this plan: Better
Auth's session cookie is issued by `apps/api` on `api.biasmarket.com`
(`apps/api/src/auth/auth.config.ts` sets no `crossSubDomain` option, so the
cookie is host-only), while `apps/web/proxy.ts` runs on the `biasmarket.com`
origin — it never receives that cookie and has no session signal to check
without a separate, larger change (enabling cross-subdomain cookies, or proxying
`/api/auth/*` through the web origin so the cookie is same-origin). That's real
infra/security surface (cookie scope changes affect every authenticated request,
not just this bug) and out of scope here. Client-side guard stands as the fix
for this plan; a server-side redirect is a legitimate future improvement if/when
the cookie-domain setup changes for other reasons, not before.

**Related but distinct: `(onboarding)/onboarding/create-store` has the identical
Bug 2 symptom — but `(onboarding)/onboarding` itself must NOT be touched.**
Round-1 review found `features/stores/components/my-stores-list.tsx` calls
`useMyStores()` with no session gate, rendered from
`onboarding/create-store/page.tsx` — a logged-out visitor there gets the same
blank-shell/401 experience as `/account` today. No SEO exposure
(`/*/onboarding/*` is already disallowed), but same broken UX.

**Round-2 review caught a serious error in the first draft of this fix**: it
proposed applying the same guard to `onboarding/page.tsx` too. That page renders
`OnboardingPageClient`
(`apps/web/app/[locale]/(onboarding)/onboarding/onboarding-page-client.tsx`),
which **is the signup form** (`authClient.signUp.email(...)`) — the entry point
for brand-new, unauthenticated users, who are logged out by definition. Gating
it on `session` present would have redirected 100% of prospective sellers
straight to `/login` before they could ever sign up, breaking account creation
entirely. **`onboarding/page.tsx` stays untouched — public, no guard.** Only
`onboarding/create-store` gets a fix.

**Round-2 also caught an implementation-boundary problem with the originally
proposed fix** (calling a new `useRequireAuth()` hook directly inside
`create-store/page.tsx`): that file is a **Server Component**
(`export default
function CreateStorePage()`, no `"use client"`, has its own
async `generateMetadata`) rendering two Client Components
(`MyStoresList`/`CreateStoreForm`) inline — a hook can't be called from a Server
Component, and adding `"use client"` to `create-store/page.tsx` would conflict
with its existing `generateMetadata` export (Server-Component-only in the App
Router). Rather than introduce a new `create-store-page-client.tsx` wrapper
(extra file for a one-line guard), **put the guard directly inside
`MyStoresList`** — it's already a Client Component (`"use client"` at the top)
and it's the exact component with the ungated `useMyStores()` call, so this is
the minimal, correctly-scoped fix:

```tsx
// features/stores/components/my-stores-list.tsx
"use client";
import { useRequireAuth } from "@/hooks/use-require-auth";
// ...existing imports unchanged...

export function MyStoresList() {
  const { isReady } = useRequireAuth();
  const t = useTranslations("onboarding.createStore");
  const tCommon = useTranslations("common");
  const router = useRouter();
  // `enabled: isReady` on top of the redirect above — belt and suspenders:
  // stops the query from firing (and 401ing) during the brief isPending
  // window, on top of the guard stopping the component from rendering past
  // that point at all. useMyStores already accepts `{ enabled? }`
  // (`features/stores/queries/use-my-stores.ts:7`), so this is a one-line
  // change, not new plumbing.
  const { data: stores = [], isPending } = useMyStores({ enabled: isReady });
  const deleteStore = useDeleteStore();

  // ...existing handleDelete unchanged...

  if (!isReady) return null;

  return (
    // ...existing JSX unchanged...
  );
}
```

(Verified via grep that `MyStoresList` is imported and rendered from exactly one
place — `onboarding/create-store/page.tsx` — so adding this guard here doesn't
affect any already-authenticated dashboard page.)

`CreateStoreForm` (rendered alongside `MyStoresList` on the same page) is not
separately gated by this fix — it doesn't fetch on mount, so it has no
Bug-2-style broken-shell symptom, but a logged-out visitor could still see and
interact with the empty form before `MyStoresList`'s redirect fires. Acceptable
for this plan (matches the "client-side guard, not the authorization boundary"
note above — submission would still fail against the real API without a valid
session), but worth a one-line callout in the implementation PR description so
it isn't mistaken for an oversight.

Net: `useRequireAuth()` (shared hook, extracted from the `admin/layout.tsx`
pattern) is used in exactly two places — `(dashboard)/layout.tsx` and
`MyStoresList` — not three.

## Open questions for reviewers

1. Should `/store/[slug]/account` (the storefront buyer landing, not the
   dashboard one) also get a `noindex`, or is it fine to stay indexable as
   buyer-facing storefront content? Current lean: leave indexable, it's not the
   page from the bug report and has real per-store content. Round-1 review
   confirmed no Bug-2-style broken-shell issue exists on this route either
   (degrades gracefully logged-out) — this question is purely an SEO/indexing
   call, not a correctness one.
2. ~~Does `/login` already support a post-login redirect target?~~ Resolved —
   see "Redirect target" above. No.
3. Any other `(dashboard)` pages beyond `/account` currently reachable and
   rendering a broken shell for logged-out users that this plan should enumerate
   explicitly? Round-1 review found one outside `(dashboard)` entirely —
   `onboarding`/`onboarding/create-store` — now folded into Bug 2's fix above.
   Still open: confirm `dashboard/[slug]` itself has no _additional_ failure
   mode beyond the shared-layout blank-shell (e.g. a page-level fetch that
   errors differently) before considering Bug 2 fully closed.
4. Should the fix request de-indexing directly via Search Console (Removals
   tool) for `/en/account` and `/es/account` specifically, rather than waiting
   for Google to recrawl and honor the new `noindex`? Recrawl can take
   days–weeks; Search Console removal is near-immediate but temporary (~6
   months) and still requires the underlying `noindex`/`robots.txt` fix to be
   permanent.

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
3. Once confirmed deindexed, add `/en/account$`/`/es/account$` to `robots.txt`'s
   `disallow` to stop future crawl attempts. **This is a separate follow-up
   deploy from step 1, not a same-PR change** — file a tracking issue/reminder
   when shipping step 1 so this doesn't get forgotten; there's no automated
   signal that step 2 (recrawl) has completed, so nothing will prompt someone to
   come back and do step 3 otherwise. (Round-2 review confirmed this repo's CD
   pipeline — `.github/workflows/cd.yml`, `infra/vps/deploy.sh` — is an ordinary
   per-commit blue-green setup with no partial-deploy constraint, so splitting
   this into two ordinary PRs days or weeks apart is mechanically fine; the risk
   is purely "someone forgets," not deploy tooling.)
4. For the other pages in the table with no meaningful risk of already being
   indexed (`/store/[slug]/account/login`, `/forgot-password`, `/confirm`,
   `/verify-email`, order-detail pages) — these can go straight into
   `robots.txt`'s disallow list without the noindex-first dance, since (per the
   `site:biasmarket.com` results in the report) only `/account` appears to
   actually be indexed today. Confirm none of the others show up in
   `site:biasmarket.com` before skipping their noindex step.

**Confirming the fix worked, post-deploy:** re-run `site:biasmarket.com` (or
check Search Console's Coverage/Removals status) for `/account` until it drops
out — this is the direct confirmation the user's original report asked for.
Separately, watch Sentry (already wired — `apps/web/instrumentation-client.ts`)
for a spike in `/login` redirects or client errors right after the
`useRequireAuth()` deploy specifically; the failure mode to catch is a hydration
race where `isPending` resolves `false` before the session cookie is actually
read, which would incorrectly bounce legitimately-logged-in sellers — this would
show up as a burst of unexpected redirects immediately after deploy, not a
gradual trend, so a short focused monitoring window (first hour or so after
shipping) is more useful here than open-ended dashboard watching.

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
- Manually hit `/en/onboarding` and `/en/onboarding/create-store` logged-out —
  confirm the new `useRequireAuth()` call redirects instead of showing the
  blank-shell/401 (this is the `onboarding` fix, not the layout fix — different
  code path, needs its own manual check).
- Confirm `/en/login` itself is still reachable logged-out (sanity check that
  the new `onboarding`-page-level guard didn't get accidentally hoisted to a
  shared layout that would also gate `/login`).
- Note, not a test: once the shared guard lands, `admin/layout.tsx`'s own
  `!isAdmin && !impersonatedBy → router.push("/dashboard")` branch becomes
  unreachable for logged-out visitors (the parent guard already redirects them
  to `/login` first) — still correct for the signed-in-but-not-admin case, no
  code change needed, just don't be surprised the logged-out path never hits it
  in manual testing.
- No automated test coverage exists for either bug currently (`apps/web` test
  suite; check `features/account` and dashboard route tests before assuming);
  consider whether this plan should add a vitest/RTL test for `useRequireAuth()`
  (`session === undefined` → `router.push` called) rather than relying on manual
  verification alone.
