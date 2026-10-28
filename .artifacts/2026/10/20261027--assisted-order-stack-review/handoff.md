# Implementation handoff: repair and review the assisted-order PR stack

## Mission

Fix the confirmed CI blocker and the confirmed web/API review findings in the
open assisted-order PR stack #324–#331. Preserve its eight-PR linear order. Do
not merge or post review comments as part of implementation. Do not push branch
updates without explicit authorization.

## Context

- Repository: `/Users/ultirequiem/ulti/biasmarket.com`
- GitHub: `bobadilla-tech/biasmarket.com`
- Detailed plan:
  `.artifacts/2026/10/20261027--assisted-order-stack-review/implementation-plan.md`
- Review evidence:
  `.artifacts/2026/10/20261027--assisted-order-stack-review/review-notes.md`
- Proposed GitHub review drafts:
  `.artifacts/2026/10/20261027--assisted-order-stack-review/draft-comments.md`
- Review log and claim ledger:
  `.artifacts/2026/10/20261027--assisted-order-stack-review/review-rounds.md`
- Earlier feature spec/decisions:
  `.artifacts/2026/10/20261027--assisted-order-seller-flow/plan.md`
- Current heads are recorded in the plan and review notes; fetch and re-check
  before starting because PRs may have moved.

## Current CI and review findings

- #324, #328, #330, and #331 currently have green required checks.
- #325, #326, #327, and #329 fail `E2E (API)` and `CI Success` from one defect
  introduced in #325. The new `assisted-orders.e2e-spec.ts` assertions pass,
  then teardown fails to delete the store because its checkout-vs-assisted race
  leaves a `CustomerStoreLink` row. Local reproduction passed all 8 assertions
  and failed at the same FK during `afterAll`.
- #327's new English and Spanish ICU descriptions throw `MALFORMED_ARGUMENT`.
  The optional assisted-template lookup also shares a `Promise.all` with two
  existing template reads. The deployment independently weights API and web
  canary traffic, so isolate failure of the optional read.
- #329 can submit before product details finish loading and can keep buyer A's
  lookup-generated alias after the phone changes to buyer B.
- #330 leaves `?order=<id>` in the URL and can reopen the detail sheet after a
  list refresh.
- #331 leaves an enabled no-op “Correct number” action when correction is
  blocked, and links to the generic Customers list instead of satisfying issue
  #265's same-number order/customer-detail criterion.
- Issue #333 tracks a separate checkout `Customer` uniqueness race. Keep it open
  and do not claim this stack fixes it.
- Issue #268 is still open. Do not release #330/#331 until the buyer-facing
  order page ships; otherwise the assisted-order link reaches a missing page.

## Decisions already made

- Fix each defect in the earliest PR that owns its source.
- Delete only `CustomerStoreLink` rows for generated test store IDs; do not
  delete unrelated global buyer accounts.
- Keep `NEW_ORDER` and `PAYMENT_REMINDER` settings available when an older API
  rejects the optional `ASSISTED_ORDER_LINK` request.
- Clear only auto-filled aliases immediately when the normalized phone changes,
  including invalid/incomplete input. Fill from a matching lookup response and
  preserve seller-entered aliases.
- Use `customerId` to open the existing selected-customer detail sheet, or
  provide same-number order history. A link to the generic Customers list is
  insufficient for issue #265.
- After each parent PR changes, refresh/rebase every descendant in chain order
  before continuing. GitHub `pull_request` checks may be on the generated merge
  ref; validate the latest suite for the current PR head and expected base
  without requiring literal check-run SHA equality with the branch head.
- Use a clean isolated E2E environment. Do not run the fixed-port/container-name
  bootstrap against containers not started for this task.

## Ordered implementation steps

1. Fetch and verify the current PR heads, bases, status checks, reviews, and
   issue state. Start in isolated scratch worktrees; leave the user's checkout
   untouched.
2. Fix #325's E2E teardown, then run its E2E spec and verify the store and
   associated rows are cleaned up.
3. Refresh #326 through #331 in order after the #325 branch changes.
4. Fix #327's ICU literals and parser regression. Isolate the optional template
   request and add a test where it alone rejects. Refresh #328 through #331.
5. Fix #329's product-detail readiness and alias lifecycle. Add delayed/failed
   detail-query cases, a positive courier fee case, variant requirements, and
   phone A-to-B while the second lookup is pending. Preserve manual edits.
   Refresh #330 and #331.
6. Fix #330's one-shot order deep link and test close followed by list refresh.
   Refresh #331.
7. Fix #331's blocked correction action and add customer-detail/history
   navigation for the selected order's `customerId`. Test both blocked/enabled
   correction states and correct-customer selection.
8. Run targeted API/web tests, lint, typecheck, OpenAPI drift, migration safety,
   checkout regression tests, and the full API E2E suite. No DB/OpenAPI changes
   are expected; regenerate committed artifacts if that changes.
9. Re-review each updated diff, record new heads, and verify fresh successful
   `CI Success` plus applicable E2E results for every current PR/base pair. Keep
   issue #333 separate and retain the #268 production release gate.

## Verification

Previously run on the reviewed snapshot:

- `pnpm install --frozen-lockfile --ignore-scripts`
- `pnpm db:generate`
- `pnpm --filter @biasmarket/db exec prisma migrate deploy` on a disposable
  PostgreSQL 18 database (58 migrations passed)
- `pnpm turbo run build --filter=api --filter=workers`
- `pnpm --filter api exec vitest run --config vitest.config.e2e.ts test/assisted-orders.e2e-spec.ts`
  (8 assertions passed; teardown failure reproduced)
- `IntlMessageFormat` parse of both new catalog descriptions (both failed)

Repeat tests after fixes in a disposable environment. Hosted checks remain the
acceptance source for the PR branches.

## Acceptance criteria

- The assisted-order API E2E teardown passes and no longer violates
  `CustomerStoreLink_storeId_fkey`.
- #325, #326, #327, and #329 have fresh successful `E2E (API)` and `CI Success`
  results after ancestry is refreshed.
- Both locale strings parse and display literal `{{link}}`; a test catches
  malformed ICU messages.
- The settings page retains existing templates when the optional template
  request fails during mixed-version canary traffic.
- The form waits for selected product details and does not carry an old
  lookup-generated alias across a phone change.
- The order detail does not reopen after a close and list refresh.
- The correction confirmation action reflects the order's blocked state and
  reason.
- Issue #265's customer-detail/history criterion is met or #265 remains open.
- All required checks are green for the latest PR head/base pair; no merge or
  review post occurs without separate authorization.
- #330/#331 are not released until #268 ships; issue #333 remains a tracked
  follow-up.

## Constraints and blockers

- Do not change the assisted-order API contract, order state machine, DB schema,
  or checkout order rules unless a newly confirmed issue requires it.
- Preserve tenant `storeId` checks, token privacy, lock order, ESM/`pnpm` rules,
  and existing checkout regression tests.
- Do not post reviews or replies from `draft-comments.md` until the user
  approves the review drafts. Draft approval is not permission to push code.
- Do not merge the stack or release #330/#331 ahead of #268.
- Report #333 separately; it is outside this repair plan.

## First action

Read `implementation-plan.md` and `review-notes.md`, fetch the current PR refs,
verify the working tree and PR bases, then prepare the #325 cleanup fix in an
isolated worktree.
