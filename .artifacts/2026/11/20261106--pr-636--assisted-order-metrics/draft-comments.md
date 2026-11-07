# Draft comments: PR #636

Head SHA: `4863c3c58c23a6063dd980b53d719cbf48fda99f`
Posting plan: one review on #636, event **COMMENT** (the authenticated account
`crydafan` is the PR author, so GitHub rejects `APPROVE` / `REQUEST_CHANGES`
with 422). No stack-level comment: single PR.

## #636: feat(stats): implement assisted-order pilot metrics and admin view (#466)

**Review body (COMMENT):**

> I ran this against a throwaway Postgres as well as the new tests. What held up:
>
> - All 8 #466 metrics are computed server-side with explicit denominators, and
>   `countsTowardPaid` is the single paid predicate for the validated claim
>   rate, revenue, time-to-payment and payment sources (G1/G3 use the documented
>   "total assisted orders" denominator).
> - The cohort and pagination rewrite in `df404d5a` is correct. I applied all
>   migrations to a disposable Postgres, seeded 521 assisted + 3 marketplace
>   orders, 526 payments and 941 events (both queries cross the 500-row cursor
>   page), and the response matched hand-computed expectations: the cancelled
>   order stayed in volume, revenue split per currency, the funnel counted an
>   order shown at two moments once in the totals, and the `from`/`storeId`
>   filters worked. The 30% boundary (29% / 30% / 31%) is covered by the new unit
>   tests.
> - The endpoint is admin-only: the installed `AuthGuard` reads `ROLES` with
>   `getAllAndOverride(handler, class)`, so the class-level `@Roles(["admin"])`
>   is enforced.
> - Generated files match the source: regenerating `openapi.json` (with a
>   throwaway Redis) and the Orval SDK produces no diff. `es`/`en` key parity,
>   typecheck, prettier and eslint on the changed files pass, and CI is green on
>   `4863c3c`.
>
> Two fixes: repeat buyers only exist per week (636-1), and the validated-claim
> KPI card still shows a green 0.0% when there is no validated payment while the
> callout says "no data" (636-2). The rest are nits.
>
> The PR description is stale: it lists funnel moments (`post_proof`,
> `confirmed`, `ready_or_shipped`, `delivered`) and payment sources
> (`SELLER`/`BUYER`) that are not in the code. The code uses
> `pago_validado`/`entrega`/`banner`/`adelanto_linea_de_tiempo` and
> `SELLER_RECORDED`/`BUYER_SUBMITTED`.
>
> Verified by running: `vitest run src/modules/stats` (77 pass), web
> `features/admin` (18 pass), i18n (10 pass), `tsc --noEmit` for api/web,
> OpenAPI + Orval regeneration, and the real-DB probe above. Not verified: real
> HTTP with seller/admin sessions (there is no e2e for this route) or the mobile
> layout on a device.

### 636-1 · should fix · `apps/api/src/modules/stats/admin-assisted-order-metrics.helper.ts:450`

> Repeat buyers are counted inside each `(week, store)` bucket, so a buyer who
> returns in a later week is counted as a new distinct buyer every week and
> never as a repeat buyer. #278 defines this as "mismo número, más de un pedido
> en la tienda", and the implementation plan says "group repeat buyers per
> store"; neither has a week qualifier.
>
> Evidence: calling the helper with two assisted orders for `+51999111222` at
> the same store, one on 2026-11-02 and one on 2026-11-09, returns two rows with
> `distinctBuyers: 1, repeatBuyers: 0` each. The same happens through
> `StatsService` on a real Postgres. The only spec test for this
> (`admin-assisted-order-metrics.spec.ts:631`) uses two orders in the same week.
>
> Suggested fix: fold a second `buyerCounts` map keyed by `storeId` for the
> whole selected window and expose a period-level repeat-buyer count/rate per
> store (summary field or store-level array), keeping the weekly rows as a
> breakdown. Add a cross-week regression test. If the weekly window is intended,
> the column header/UI should say so ("compradores recurrentes en la semana"),
> since the docs' "within that week" is the only place that narrows it.

### 636-2 · should fix · `apps/web/features/admin/components/metrics/metrics-summary-cards.tsx:55`

> When `ordersWithValidatedPaymentCount` is 0 the callout correctly shows "Sin
> datos" and "—", but this card still renders `formatPercent(0)` = "0.0%" with
> the emerald icon (because `belowTargetClaimRate` is false) and "Meta: 30%".
> Rendering the view with `ordersWithValidatedPaymentCount: 0` produces
> `Reclamo con pago validado0.0%Meta: 30%0 / 0` with
> `text-emerald-600 bg-emerald-50`, so one screen says both "no data" and "0% /
> on target".
>
> Suggested fix: when the denominator is 0, render "—"/`cards.notAvailable` and
> the neutral icon colour here (and in the other rate cards, if you want
> consistency). Extend the no-data test at `metrics-view.test.tsx:188`, which
> currently only asserts the callout.

### 636-3 · question · `apps/api/src/modules/stats/admin-assisted-order-metrics.helper.ts:292`

> `linkFirstOpenedAt` is stamped by any read of the public order endpoint that
> carries the token (`public-order.service.ts:104-121`, and the `LINK_OPENED`
> actor is hardcoded to `BUYER`), so a seller who opens the private link to
> check it counts as a buyer open. The docs added in this PR describe the metric
> as "opened by the buyer's browser" and only exclude crawlers/link previews.
>
> Is "the link was opened by someone holding the token" the intended pilot
> definition? If so, soften the doc wording; if the metric is supposed to mean
> the buyer opened it, that needs a way to tell the seller's own read apart,
> which this PR does not add.

### 636-4 · nit · `apps/api/src/modules/stats/admin-assisted-order-metrics.spec.ts:935`

> This test asserts the `ROLES` metadata that the file's own mocked `Roles`
> decorator just wrote (the whole `@thallesp/nestjs-better-auth` module is
> mocked at the top), so it cannot catch a regression in the real guard wiring.
> At minimum, assert the real decorators' metadata; better, since this endpoint
> returns cross-store aggregates, add one supertest spec modelled on
> `users.e2e-spec.ts:114`: unauthenticated → 401, seller → 403, admin → 200,
> and the body checked with `assertMatchesSchema` against
> `openapi.components.schemas.AdminAssistedOrderMetricsResponseDto` like
> `stats.e2e-spec.ts:164` does for the store stats.

### 636-5 · nit · `packages/i18n/es/admin.json:116`

> The Spanish catalog says "apertura de links" here and "Apertura de link" in
> `metrics.cards.linkOpenedRate`, while the rest of the Spanish UI and #466 use
> "enlace" for the private order link (e.g. `es/storefront.json:500-514`).
> Because #466 requires Spanish copy for the view, consider "apertura de
> enlaces" / "Apertura de enlace"; English stays "Link opened rate".

### 636-6 · nit · `.artifacts/2026/11/20261102--pr-569--storefront-infinite-scroll/review-notes.md:1`

> These three PR-569 review artifacts belong to a different PR and were added by
> unrelated commit `17482e7c`; they are not needed for #466. Please drop them
> from this branch (or move that commit to the PR-569 branch) so this PR only
> carries #466 work. `plan-issue-466.md` is correctly scoped.

### 636-7 · nit · `apps/web/app/[locale]/(dashboard)/admin/metrics/metrics-page-client.tsx:121`

> `apps/web/AGENTS.md` says new features should use
> `components/shared/{loading-state,error-state,empty-state}.tsx` instead of ad
> hoc async-state markup, and the loading and error blocks here do their own
> spinner and error markup. The shared `LoadingState`/`ErrorState` also add
> `role="status"` / `role="alert"`, which the current markup lacks, so a screen
> reader is not told that the dashboard is loading or that the fetch failed. The
> weekly table's empty message (`weekly-store-breakdown-table.tsx:50`) is the
> third ad hoc state. The swap is small; `ErrorState` already takes a `retry`
> callback and `EmptyState` takes a message.

### 636-8 · nit · `apps/web/features/admin/components/metrics/metrics-summary-cards.tsx:84`

> The card's main number is the assisted **median** (`assistedMedianMinutes`)
> and has no label. The subtitle shows the assisted **average**, then the
> marketplace **median** under the hardcoded English "Mkt:". That mixes
> statistics, and the Spanish UI gains an English abbreviation. The API returns
> all four values, and `cards.medianMinutes` exists in both dictionaries but is
> never used. Suggest labelling the main value with `cards.medianMinutes` and
> using a translated marketplace label (or show the marketplace average for an
> apples-to-apples comparison).
