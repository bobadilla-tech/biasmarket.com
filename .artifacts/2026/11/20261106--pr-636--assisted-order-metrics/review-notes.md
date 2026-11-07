# Review notes — PR #636: assisted-order pilot metrics (#466)

## Scope

| PR   | Title                                                                     | Head SHA                                   | Base   | CI                                                                                                        | Existing review                                                                                                 |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| #636 | feat(stats): implement assisted-order pilot metrics and admin view (#466) | `4863c3c58c23a6063dd980b53d719cbf48fda99f` | `main` | all required checks pass (`CI Success`, API, Web, E2E, Types, i18n, Hygiene, Web E2E a11y, codecov/patch) | 1 CodeRabbit review, 7 inline threads, all resolved + `isOutdated`; 1 author reply on the bounded-paging thread |

- Author login: `crydafan` (same account that must post this review → GitHub only
  accepts `COMMENT` on your own PR; `APPROVE`/`REQUEST_CHANGES` return 422).
- Repo rules checked: `storeId` scoping (this is a deliberate cross-tenant admin
  read, matching `users`/`coupons` admin controllers), ESM `.js` relative
  imports in `apps/api`, pnpm-only, generated OpenAPI + Orval artifacts
  committed, `web` never imports `packages/db`.
- Spec: issue #466, referenced criteria in #278, `.artifacts/plan-issue-466.md`,
  `docs/core/assisted-orders.md`.
- Scratch worktree at head: `git worktree add --detach <tmp>/wt 4863c3c5`.

## What ran (and the result)

| Check           | Command                                                                                                                                                                                                 | Result                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Install         | `pnpm install --frozen-lockfile --ignore-scripts`                                                                                                                                                       | ok (45s)                                                                                 |
| API stats tests | `vitest run src/modules/stats` in `apps/api`                                                                                                                                                            | 77 passed (39 in the new spec)                                                           |
| Web admin tests | `vitest run features/admin` in `apps/web`                                                                                                                                                               | 18 passed (7 metrics-view)                                                               |
| i18n            | `vitest run` in `packages/i18n`                                                                                                                                                                         | 10 passed (parity, overlay, voseo, messages)                                             |
| API typecheck   | `tsc --noEmit -p tsconfig.metadata.json`                                                                                                                                                                | ok                                                                                       |
| Web typecheck   | `tsc --noEmit`                                                                                                                                                                                          | ok                                                                                       |
| Prettier        | `prettier --check` over all changed `.ts`/`.tsx`                                                                                                                                                        | ok                                                                                       |
| ESLint          | `eslint` over all changed `.ts`/`.tsx`                                                                                                                                                                  | ok                                                                                       |
| Orval drift     | `pnpm --filter @biasmarket/types generate`                                                                                                                                                              | no diff                                                                                  |
| OpenAPI drift   | `node scripts/generate-openapi-spec.ts` with throwaway Redis (port 56379)                                                                                                                               | no diff in `apps/api/openapi.json`; regenerating also leaves `src/metadata.ts` unchanged |
| Real DB probe   | throwaway Postgres 16 (`55432`) + `prisma migrate deploy` + seeded 521 assisted / 3 marketplace orders, 526 payments, 941 events; called `StatsService.getAdminAssistedOrderMetrics` from built `dist/` | all assertions passed                                                                    |

Real-DB probe details (script was scratch, removed after the run):

- 521 assisted orders (520 in one store + 1 in a second store), one `CANCELLED`;
  3 marketplace orders. The order query and the event query both cross the
  500-row cursor page (521 orders; 941 events).
- Verified: cohort totals, cancelled-order inclusion, `linkFirstOpenedAt`,
  `claimedAt`, `buyerConfirmedReceivedAt`, `countsTowardPaid` (voided seller
  payment excluded; `PENDING_REVIEW` buyer proof excluded from validated
  payment counting), per-currency weekly revenue (PEN + USD), per-moment funnel
  counts and distinct-order totals, `from` and `storeId` filters, `p90`-style
  boundary at exactly 30% (unit test), time-to-payment avg/median.
- Also reproduced the repeat-buyer problem end-to-end: same normalized phone,
  same store, orders on 2026-11-02 and 2026-11-09 → two weekly rows with
  `distinctBuyers: 1` / `repeatBuyers: 0` each.

Auth guard: inspected the installed `@thallesp/nestjs-better-auth@2.8.0`
`AuthGuard`: it reads `ROLES` via
`reflector.getAllAndOverride("ROLES", [handler, class])`, so the class-level
`@Roles(["admin"])` on `AdminStatsController` is honoured. Class-level
`@UseGuards(AuthGuard)` is standard Nest behaviour. The route appears in the
regenerated OpenAPI document.

## Findings

| ID    | Severity   | Area                    | Summary                                                                                                                                                                                                                   |
| ----- | ---------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 636-1 | should fix | API / metric definition | Repeat buyers are counted per `(week, store)` bucket, so a buyer who returns in a later week is never a repeat buyer (and is counted as a new distinct buyer each week). #278 defines the metric per store, not per week. |
| 636-2 | should fix | Web / KPI card          | Validated-claim card renders `0.0%`, "Meta: 30%" and a green icon when `ordersWithValidatedPaymentCount === 0`, while the callout on the same screen says "Sin datos" / "—".                                              |
| 636-3 | question   | API / docs wording      | `linkFirstOpenedAt` is stamped by any token-holder read (`public-order.service.ts:104-121`, actor hardcoded `BUYER`); the new docs say "opened by the buyer's browser". Seller previews count as buyer opens.             |
| 636-4 | nit        | API / test              | The guard test only asserts the `ROLES` metadata written by the file's own mocked `Roles` decorator; it cannot catch a wiring regression. No e2e exercises the new admin route.                                           |
| 636-5 | nit        | i18n (es)               | Spanish copy uses "links"/"link" while the rest of the Spanish UI and #466 use "enlace".                                                                                                                                  |
| 636-6 | nit        | Repo hygiene            | Three PR-569 review artifacts were committed in this branch (`17482e7c`), unrelated to #466.                                                                                                                              |
| 636-7 | nit        | Web standards/a11y      | Metrics page uses ad hoc loading/error/empty markup; `apps/web/AGENTS.md` requires `components/shared/{loading,error,empty}-state`, which also provide `role="status"`/`role="alert"`.                                    |
| 636-8 | nit        | Web presentation        | Time-to-payment card shows the assisted median as the main number but compares it to the assisted average and the marketplace median; "Mkt" is hardcoded and `cards.medianMinutes` is unused.                             |

### 636-1 details

- `foldOrders` (helper line ~320) builds `key = weekStartDate:storeId` and
  increments `buyerCounts` inside that bucket; `finalizeMetrics` (~448-464)
  computes `repeatBuyers` from it per week row.
- `admin-assisted-order-metrics.spec.ts:631` only covers two orders in the same
  week (`2026-11-02` and `2026-11-03`).
- `.artifacts/plan-issue-466.md` §3 row 6 and §4.3 say "Group repeat buyers per
  store"; #278 says "mismo número, más de un pedido en la tienda". The new docs
  were written to say "within that week", i.e. the definition was narrowed to
  match the weekly approximation.
- Suggested fix: fold a second `buyerCounts` map keyed by `storeId` across the
  whole selected window and expose a period-level repeat-buyer aggregate per
  store (summary or a store-level array); keep the weekly rows as a breakdown.
  Add a regression test with the same phone in two different weeks.

### 636-2 details

- Reproduced with `renderWithProviders(<AdminMetricsView data={noData} />, "es")`
  (scratch test, removed): card text is
  `Reclamo con pago validado0.0%Meta: 30%0 / 0`, icon classes
  `text-emerald-600 bg-emerald-50`.
- The callout's last commit (`4863c3c5`) fixed exactly this for the callout, and
  `metrics-view.test.tsx:188` only asserts the callout, not the card.
- Fix: when `ordersWithValidatedPaymentCount === 0`, render `—`/`notAvailable`
  and the neutral icon colour; same treatment for the other rate cards is
  optional but consistent.

## Candidates investigated and dropped

- **Claim metrics drift after identity erasure**: retention only nulls
  `claimedAt` for unclaimed orders; buyer-request erasure keeps `claimedAt`. No
  drift.
- **Funnel `claimed` vs `claimedAt` mismatch**: every claim path
  (`customer-auth.service.ts:346`) writes a `CLAIMED` event; the difference in
  the probe was seeded data, not code.
- **Currency mixing**: fixed in `85fb4359`; verified per-currency sums at
  runtime.
- **Cursor pagination skipping/duplicating rows**: verified with 521 orders and
  941 events; also read `forEachIdPage` (take/cursor/skip:1 logic is correct).
- **Cohort excludes cancelled orders**: current code includes them and
  `docs/core/assisted-orders.md` says so; runtime probe confirms. CodeRabbit's
  earlier comment was addressed.
- **Class-level `@Roles` ignored by guard**: false, inspected library.
- **Tenant `storeId` filtering rule**: deliberate admin cross-tenant read,
  precedent in `users.controller.ts`/`coupons.controller.ts`.
- **`storeId` injection**: Prisma parameterises; DTO requires a string.
- **Generated artifacts out of date**: no drift.
- **i18n key gaps**: all keys used by the new components exist in both `es` and
  `en`; only `filters.dateRange` and `cards.medianMinutes` are unused (not a
  defect).
- **PII in API/UI**: no buyer identifiers in the DTO; the web test greps the DOM;
  no leak found.
- **Doc/code mismatch on payment derivation**: docs and helper agree
  (`paidAt ?? createdAt` / `reviewedAt ?? paidAt ?? createdAt`).
- **Repeat rates on the summary card showing "0.0%" for other zero-denominator
  cards**: same class as 636-2, covered there rather than as separate comments.
- **"Mkt:" label hardcoded in the Spanish card subtitle**: folded into 636-8
  with the average/median mismatch.
- **`targetClaimRateHypothesis` exposed by the API but ignored by the callout
  (hardcoded 30%)**: real but low value; the benchmark is a fixed product
  hypothesis and the copy would need rewriting with it anyway. Dropped after
  the author's-advocate pass.
- **Locale-unaware `toLocaleString()` / dot-decimal percentages**: the new
  feature is the only `toLocaleString()` user in `apps/web`, but the existing
  stats page already renders `toFixed(1)}%`, and these numbers only render
  client-side after React Query resolves, so there is no SSR hydration path.
  Dropped as a nit-level consistency point.
- **Zero-PII DOM test only scans a hand-written fixture**: test-quality point;
  the API test already asserts the serialized response contains no phones, and
  the view renders explicit fields only. Dropped.
- **Sidebar test tautology / test-only `NAV_ITEMS` exports, untested
  `useAdminMetrics` hook, swallowed store-filter error, duplicated helpers,
  missing `<caption>`/`scope`**: real but low-value nits; dropped to keep the
  review focused (the guard-test nit 636-4 already covers the "test that cannot
  fail" class).

## Not verified

- The endpoint over real HTTP with buyer/seller/admin sessions (no e2e for this
  route; guard behaviour verified by reading the library and by metadata).
- Mobile rendering on a device/viewport (only component tests assert the
  `overflow-x-auto` wrappers and touch-target classes).
- Production data volume: `all time` is the default preset and performs a
  full-history fold; bounded per query page, but work grows with history
  (CodeRabbit raised this; the author chose paging, accepted in this review).
- Whether GitHub will render the LaTeX `$...$` in the new docs section as
  mathematics (it does on github.com, not checked in the repo's docs pipeline).
