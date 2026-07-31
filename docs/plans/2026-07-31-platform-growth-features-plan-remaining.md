# Platform growth batch — remaining work + learnings

Companion to
[`2026-07-31-platform-growth-features-plan.md`](2026-07-31-platform-growth-features-plan.md)
(left untouched — that doc's phase numbering/design/open-questions-resolved
section is still the source of truth for scope). This doc exists because
implementation started mid-session, a second concurrent Claude Code session was
independently running the `apps/web` feature-sliced migration
(`2026-07-31-web-feature-sliced-migration.md`) on the same repo at the same
time, and that reshaped the ground under several not-yet-built phases enough to
be worth writing down before continuing. Only what's left + what changed is
below — full phase design for anything already shipped stays in the original
doc, not repeated here.

## Shipped (Phases 4, 1, 2 — done, verified)

- **Phase 4** — `StoreSidebar` collapse: `collapsed` state +
  `localStorage("store-sidebar-collapsed")`, `forceExpanded` prop threaded from
  `MobileSidebar` so the mobile sheet always renders expanded regardless of
  desktop toggle state (the exact contradiction the plan review flagged — fixed
  as designed). `collections`/`sections` given real sidebar `href`s (previously
  orphaned, URL-only). Dead `categories` link dropped from `dashboard-nav.tsx`.
  Automated regression test added
  (`components/dashboard/mobile-sidebar.test.tsx`) and manually verified it
  actually fails without the fix.
- **Phase 1** — real `(marketing)` route group created (`page.tsx`, `contact/`,
  `enterprise/`, `founder/` moved under it via `git mv`), new
  `components/marketing/navbar.tsx` (session-aware: Sign up/Log in vs. My
  Account, via `authClient.useSession()`), mobile sheet menu, `hero.tsx`'s old
  inline nav removed (logo+language-toggle now live in the navbar).
- **Phase 2** — login redirect fixed (in
  `features/auth/components/
  login-form.tsx`, not `login/page.tsx` — see
  below) to branch on `storesApi.listMine()`: 0 stores → `create-store`, 1 →
  straight to that store's dashboard, 2+ → `/account`. Duplicate
  `/stores/me/stores` route deleted from `stores.controller.ts` (dead, unused by
  the frontend).

Verification for all three: `pnpm exec tsc --noEmit` clean in both
`apps/web`/`apps/api`, `pnpm exec vitest run` green (24/24 web, 171/171 api at
time of writing), `pnpm turbo run build --filter=web` succeeds with the expected
route table. **Not done**: live browser/viewport verification — no browser tool
is available in this agent environment. Typecheck+tests+build are real signal
but are not a substitute for an actual mobile pass, especially for Phase 4's
sidebar, which the requester flagged as the one regression that actually
matters.

## What changed under us (read this before touching `features/stores` or auth)

The concurrent feature-sliced-migration session finished more of its own roadmap
than existed when the original plan was written. As of now:

- **`features/auth`** is real: `login/page.tsx` is now a thin wrapper
  (`<LoginForm />`), all form/validation/redirect logic lives in
  `features/auth/components/login-form.tsx` (RHF + `zodResolver` +
  `features/auth/schemas/login.schema.ts`). Phase 2's fix landed here.
- **`features/stores`** is real and already has: `api/stores.api.ts`
  (`listMine`, `create`, `uploadLogo`, `remove` — I only wrote `listMine`
  originally, the other session added the rest while building create-store's
  migration), `queries/use-my-stores.ts` (`useMyStores`),
  `mutations/use-create-store.ts`, `mutations/use-delete-store.ts`,
  `schemas/store.schema.ts` + `schemas/create-store.schema.ts`,
  `components/create-store-form.tsx` (`CreateStoreForm`),
  `components/my-stores-list.tsx` (`MyStoresList`). `create-store/page.tsx` is
  now a 12-line wrapper around these two components.
- **Implication for Phase 3 (personal account page)**: don't rebuild a stores
  list from scratch. Start from `useMyStores()` (already returns parsed, typed
  `Store[]`) and look at `MyStoresList`'s current props/shape before deciding
  whether to reuse it directly or need a stats-augmented variant (it doesn't
  carry per-store revenue/order-count — that's Phase 5's job to add, likely as a
  new `features/stores` query like `useStoreStats(storeId)` sitting next to
  `useMyStores`, not a separate module).
- **Implication for Phase 5 (overview/stats)**: same feature folder is the
  natural home for a `features/stores/queries/use-store-stats.ts` (or a new
  `features/stats` folder if the aggregation genuinely spans more than `Store` —
  decide when you get there, but check `features/stores`'s current contents
  first since it may have grown further by the time this phase starts).
- **General rule for the rest of this batch**: before editing any file under
  `apps/web`, re-check its current state — a second live session can and did
  change files out from under this one mid-task with no conflict markers, just a
  changed file. This was confirmed harmless twice (both times additive, not
  contradictory), but isn't guaranteed to stay that way.

## Conventions confirmed working (apply to every remaining phase)

- `features/<name>/{schemas,api,queries,mutations,components}` +
  `apps/web/test-utils/render-with-providers.tsx` (wraps
  `NextIntlClientProvider` + a fresh `QueryClientProvider` per test) is the
  standing pattern — used it for Phase 2's new tests, works cleanly.
- **Mocking navigation in tests**: mock `next/navigation`'s
  `useRouter`/`usePathname`/`redirect`/`permanentRedirect` — not
  `@/i18n/navigation` directly, since `@/i18n/navigation`'s `createNavigation`
  wraps the former and runs its own (unmocked, real) locale-prefixing logic on
  top. **This means `router.push`/`Link href` calls in a test actually arrive
  locale-prefixed** (e.g. `push("/account")` shows up in the mock as
  `"/es/account"` when the test renders with the `es` locale) — assert on the
  prefixed path, not the bare one, or the assertion will silently never match.
- **`localStorage` in jsdom**: `window.localStorage` is not reliably present in
  this repo's vitest+jsdom setup (a Node experimental-global warning shows up:
  `localStorage is not available because --localstorage-file was not
  provided`).
  Any test that touches `localStorage` needs
  `vi.stubGlobal("localStorage", <small in-memory Storage fake>)` — don't assume
  `window.localStorage.setItem(...)` just works in a test the way it does in the
  browser. Relevant for Phase 4 (done, worked around) and any of Phase 9/11's
  client-only persisted UI state.
- Tailwind arbitrary-value classes (`w-[76px]`, `w-[280px]`) get flagged by this
  repo's editor tooling with a canonical-scale suggestion (`w-19`, `w-70`) — use
  the scale class when one resolves exactly, don't reach for brackets by
  default.
- `authClient.useSession()` returns `isPending` alongside `data` — check it
  (used in the new navbar to avoid a Sign-up/My-Account flash before the session
  resolves) rather than treating `data == null` as "logged out."
- The `forceExpanded`-prop pattern from Phase 4 (same component instance
  rendered in two contexts, one context must override the other's persisted
  local state) is the template if this need recurs elsewhere in the batch.
- No browser/screenshot tool is available in this agent environment this
  session. State that explicitly rather than claiming a mobile check that didn't
  happen — typecheck/vitest/`next build`'s route table are the actual extent of
  automated verification available here.

## Remaining phases (unchanged in scope/design from the original doc)

Full design for each is in the original plan doc — only noting deltas here.

- **Phase 5 — Overview/stats**: as designed. New `stats` module in `apps/api`;
  frontend home is likely `features/stores` (see above) rather than a brand-new
  `features/stats` folder, decide at implementation time based on how far
  `features/stores` has grown by then.
- **Phase 3 — Personal account page**: as designed (single-store primary case,
  multi-store card list, `changePassword` action). Reuse
  `useMyStores`/`MyStoresList` per the note above instead of rebuilding.
- **Phase 6 — Resolve "My Store"**: as designed (confirmed answer: drop the
  placeholder, add a "View store" link — no distinct concept exists).
- **Phase 7 — Shipping tab**: as designed, including the corrected mobile note
  (`orders/page.tsx` is a table, not a card layout — design for that, don't
  assume a freebie) and the required order-list filter param change.
- **Phase 8 — Payments tab**: as designed, **with the resolved interpretation
  baked in**: "request more payment" means seller-facing visibility into the
  outstanding amount so they can manually message the buyer (WhatsApp deep link)
  — not wiring up the dormant `PaymentMethodConfig.depositPercent*`
  automated-deposit columns, which stay out of scope. The `addPayment`
  stock-decrement bug fix and the decline-with-reason schema addition are both
  still in scope and unchanged.
- **Phase 9 — Customers tab**: as designed, including the corrected mobile
  default (card/grid, not `products/page.tsx`'s list-by-default table pattern).
- **Phase 10 — Analytics tab**: as designed. Charting library confirmed:
  **`recharts`**.
- **Phase 11 — Preferences/Suggestions**: as designed (rule-based, no AI).
- **Phase 15 — Admin Users table**: as designed, **use better-auth's `admin`
  plugin client methods** (`authClient.admin.listUsers/banUser/
  unbanUser`)
  rather than hand-rolled endpoints — only the per-user store-count needs a new
  small backend endpoint.
- **Phase 13 — Featured stores + directory**: as designed. Algorithm confirmed:
  minimum order-count floor (≥3 verified orders in the trailing 30-day window) +
  revenue sort, tie-broken by order count.
- **Phase 14 — Cross-store product search**: as designed, including building a
  real product-detail route (none exists today) as part of this phase, not a
  pre-existing target to link to.
- **Phase 12 — Buyer accounts (login + profile)**: **confirmed in scope for this
  batch** (not split into a follow-up doc), sequenced last. Session storage:
  follow the existing pattern — stateless HMAC-signed token/cookie matching the
  current magic-link mechanism, not a new `CustomerSession` DB table.

Recommended remaining order (unchanged): 5, 3, 6, 7, 8, 9, 10, 11, 15, 13,
14, 12.
