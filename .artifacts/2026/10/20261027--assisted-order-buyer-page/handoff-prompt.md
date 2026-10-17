# Implementation handoff: buyer page for "Pedido asistido" (#268) and leftovers

Paste this into a fresh Claude Code session in
`/Users/ultirequiem/ulti/biasmarket.com`. Written for: the implementation agent.
Source of truth:
`.artifacts/2026/10/20261027--assisted-order-buyer-page/plan.md`. Read its
**"USER DIRECTION (2026-10-28)" block first**: it overrides the rest of the file
(the plan was written when security hardening and infra were in scope; the user
then said they are an afterthought, to use default answers, and to use one
optimistic PR stack). Review history: `review-log.md` (ten rounds, exit bar not
met; the findings are the traps worth reading).

## Mission

Make the private link sellers already send, `/es/store/{slug}/pedido/{token}`,
open a working, mobile-first buyer page (#268), and land the checkout race fix
(#333), the seller "other orders of the same number" list, and #337, as **one
stack of 5 PRs** that reviewers will code-review, merge bottom-up and deploy. Do
not merge. Do not take GitHub write actions beyond opening PRs (and retargeting
bases when told to). No questions to the user: use the plan's defaults.

## Context (current main; code unchanged since `d88be078`, later commits are artifacts)

- Seller-side assisted-order stack is merged (#324-#331, #344) plus #321
  (`ContactSellerButton` takes `message`/`label`/`icon`), #343 (`trust proxy`
  1), #345 (public DTO has `trackingNumber`, `trackingUrl`,
  `packedPhotoAvailable`), #347 (public payments have `voidedAt`). #258 and Epic
  #253 are closed.
- `GET /public/orders/:token` exists (identical 404 for unknown/revoked, first
  valid read stamps `linkFirstOpenedAt`, fail-closed, `no-store`/`no-referrer`).
  The SDK has `apiClient.publicOrders.getByToken(token, options?)`. No web route
  exists yet.
- The checkout race (#333) is real: parallel checkouts return 201 + 500, failing
  on `BuyerAccount_phone_key` and `CustomerStoreLink_buyerAccountId_storeId_key`
  first (plan section 2 probes P1/P2).

## Decisions already made (plan section 3 + USER DIRECTION)

- The browser fetches the order, the server never does; `page.tsx` has no fetch.
  One identical "invalid link" state for unknown/revoked/rotated/wrong-slug
  links.
- Reuse `FulfillmentTimeline`, `ContactSellerButton` (with `message`/`label`)
  and the checkout `PaymentMethodDetails` (widen its prop to
  `Pick<PaymentMethodConfigResponseDto, "method" | "details">`, run checkout
  tests). Do not reuse `AccountOrderDetail` or `OrderStatusBadge`.
- API computes `orderNumber` (last 4 chars of the id, uppercase, no `#`).
- DEFERRED (do not build): Caddy filter/deploy guard, web Sentry scrub,
  token-format guard, `credentials: "omit"` mutator change, CI curl header
  check, proxy.ts fallback, DTO minimisation. Keep only the cheap privacy items
  listed in the plan's USER DIRECTION item 2.

## The stack (build and open in this order; each branch is based on the previous one)

| # | Branch                         | Based on | Scope    | PR line     |
| - | ------------------------------ | -------- | -------- | ----------- |
| 1 | `feat/public-order-dto-fields` | `main`   | plan 4.1 | Refs #268   |
| 2 | `feat/public-order-page`       | #1       | plan 4.2 | Closes #268 |
| 3 | `fix/checkout-customer-race`   | #2       | plan 4.4 | Closes #333 |
| 4 | `feat/order-related-orders`    | #3       | plan 4.5 | Refs #265   |
| 5 | `fix/hide-ghost-customers`     | #4       | plan 4.6 | Closes #337 |

PR 1 (API): add `customerAlias` (sanitised: well-formed, whitespace collapsed,
control/bidi chars removed, 40-character cap), `orderNumber`, `createdAt` to the
public DTO; update the stale "link-preview fetches count as that first read"
comment in `public-order.service.ts`; regenerate openapi + metadata + SDK;
service spec (exact key set, alias cases) and extend
`assisted-order-links.e2e-spec.ts`. PR 2 (web): route
`app/[locale]/(storefront)/store/[slug]/pedido/[token]/{page,loading,error}.tsx`
(`force-dynamic`, `generateMetadata` noindex + `referrer: no-referrer` + generic
OG), `features/public-order/` (query with `isError` before `data`, `gcTime: 0`,
slug check inside `queryFn`; status banner per state; hide the timeline for
CANCELLED; payments from `paidAmount`/`pendingAmount`, never summed client-side,
"Anulado" for `voidedAt`; how-to-pay only under the plan's rule with
`PaymentMethodDetails` and a second `ContactSellerButton` "ya pague el pedido
#XXXX"; masked-phone line and "no es tu numero" disclosure with the `message`
prop; date keys in `storefront.publicOrder.date.*`; `noscript` text; hide
number/date if the API omits them), `app/robots.ts` disallow, `next.config.ts`
`headers()` for both the prefixed and unprefixed path, es/en `storefront.json`,
tests (component tests with real `ApiError`, static guard for `page.tsx`,
robots/i18n/canonical-regression), one Playwright invalid-state spec if cheap,
one line of seller created-screen copy about not opening the link. PR 3 (API):
plan 4.4 as written (advisory lock first in `findOrCreateCustomer`; ON CONFLICT
inserts with explicit ids for BuyerAccount/link/Customer; typed `updateMany`
guards; guest result when the Google attach is lost; `change-phone` confirm;
`upsertStoreContact` reuse); e2e (a)-(d) without a pre-seeded Customer, (e)-(g)
best effort; rewrite the unit spec as the plan says. PR 4 and 5: plan 4.5 and
4.6 (check first whether a cross-store e2e for `customers/lookup` already exists
before adding one).

## Traps to preserve (full table in review-log.md)

- Never try/catch statements inside the transaction (25P02). Lock order: pickup
  -> courier -> phone advisory lock -> Customer step -> stock -> Order insert;
  never `FOR UPDATE` the Customer row.
- A conditional `UPDATE ... NOT EXISTS` is not race-safe under READ COMMITTED.
- `depositPercent` is not the order's adelanto; use
  `requiredAmount`/`totalAmount`/`pendingAmount`.
- No DTO-sourced `href` (not `trackingUrl`), no packed photo, no account
  invitation, no raw `<img src={logoUrl}>`, wa.me text carries the order ref
  only.
- Format only touched files (no `prettier --write` on directories).

## Verification (PLANNED; run per PR, as separate invocations)

`pnpm --filter <pkg> test`, `lint`, `typecheck`;
`pnpm turbo run build --filter=api` and `pnpm db:generate` before vitest/e2e
that import workspace packages; API e2e on your own Postgres/Redis (non-default
ports) with the workers app on `MAIL_DRIVER=file`; storage-dependent specs fail
locally with ECONNREFUSED :9000 (environmental). After DTO changes:
`pnpm --filter api generate:openapi && pnpm --filter @biasmarket/types generate`,
then `bash scripts/ci/check-openapi-drift.sh` (env from
`scripts/ci/e2e.env.example`) exits 0 and commit `apps/api/src/metadata.ts` if
`typecheck` regenerates it. Web PR: `next build`, plus a manual `next start`
curl of the headers on the prefixed and unprefixed path (report; no CI step). PR
3: the new e2e fails on the base commit (paste output) and passes after.

## Acceptance criteria

Plan section 9, minus item 6 (Sentry/Caddy, deferred) and without the
CI-asserted header proof (manual curl instead).

## Constraints

- Work in an isolated worktree under your scratchpad, never in the user's
  checkout.
- Hosted CI only runs for PRs whose base is `main`; the stack's upper PRs get
  none until retargeted. Run the checks above locally and say what you ran in
  each PR body. Never claim a check passed unless you ran it.
- Open the 5 PRs with `gh pr create --base <previous branch>` (the first on
  `main`). Do not merge. `gh` writes need `env -u GITHUB_TOKEN gh ...` (the
  shell token is read-only). Commit trailer:
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; PR bodies end
  with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Do not touch the `packages/db` schema or the `packageManager` pin. Stop and
  report if a plan claim is contradicted by main or a step needs a migration.

## Output for the reviewer

When done, fill the PR numbers into `review-handoff-prompt.md`'s table (in your
worktree copy) and list in your final message: what you ran, what you could not
run, and any deferred item you hit while working (the reviewer turns those into
tickets).

## First action

Read `plan.md` (USER DIRECTION block first, then sections 3, 4.1, 4.2, 4.4-4.6,
7, 9), `CLAUDE.md`, `apps/web/AGENTS.md`. `git fetch`, create the worktree off
`origin/main`, build once, then start PR 1.
