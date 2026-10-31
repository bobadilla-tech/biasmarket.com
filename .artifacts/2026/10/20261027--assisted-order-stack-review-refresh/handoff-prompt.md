# Implementation handoff: refresh assisted-order PR stack and clear CI

## Mission

Repair the active CI failures and remaining confirmed review findings on PRs
#324–#331. Preserve the linear stack. Do not merge, release, post reviews, or
change GitHub PR descriptions without explicit authorization.

## Context

- Repository: `/Users/ultirequiem/ulti/biasmarket.com`
- Detailed plan:
  `.artifacts/2026/10/20261027--assisted-order-stack-review-refresh/plan.md`
- Current review notes:
  `.artifacts/2026/10/20261027--assisted-order-stack-review-refresh/review-notes.md`
- Earlier comments/evidence:
  `.artifacts/2026/10/20261027--assisted-order-stack-review/`
- PR order: #324 → #325 → #326 → #327 → #328 → #329 → #330 → #331.
- Heads at handoff: #324 `1fbcaff3`, #325 `5305b9b9`, #326 `bf572eb6`, #327
  `9b51f461`, #328 `89be607c`, #329 `fe9eab6f`, #330 `203f2fce`, #331
  `96460de2`. Fetch and recheck all heads/bases first.
- #325 API, E2E (API), and `CI Success` fail because `apps/api/openapi.json`
  does not include the updated `customerName` regex. Codacy also blocks on
  `Math.random()` in `apps/api/test/assisted-orders.e2e-spec.ts:39`.
- The stack now targets each current parent through #331. #324 targets `main` at
  `6d6ec3a0` while current `main` is `e32ce87a`; refresh its base/checks.
- The latest #326–#331 checks inherit the missing OpenAPI pattern from #325.
  #330 now fixes summary display, WhatsApp readiness, and the seller preview.
- #268 owns the buyer-facing page. Do not release #330/#331 before #268 is
  deployed. Keep #333 as a separate checkout race follow-up.

## Decisions already made

- Refresh each parent before its descendants. If an upstream fix changes a head,
  rebase every descendant in order before relying on its CI result.
- In #325 use `node:crypto` `randomInt` or deterministic unique test data, then
  regenerate OpenAPI and run Orval generation; retain the existing cleanup and
  stronger tests. Preserve registered buyer names while making lookup return the
  latest assisted-order alias; use a separate alias field or derive it from
  order history, and clarify #258's criterion.
- In #326 keep the explicitly accepted in-flight stale-token 200 after rotation,
  but fail closed if first-open tracking for a valid token fails.
- Preserve existing review threads and reply instead of duplicating comments.
  The authenticated reviewer `eliaz-tilt` is the PR author; only `COMMENT`
  review events are appropriate.
- Prepare PR-description cleanup for the prohibited tool-attribution lines, but
  wait for authorization before editing those descriptions.
- In #331 hide a previously generated link after cancellation and match the
  API's expired-hold rule in the UI.

## Ordered implementation

1. Inspect clean status and fetch current remote state. Rebase #324 onto current
   `main`; verify the extraction remains behavior-preserving.
2. Fix #325's weak random test data and regenerate `apps/api/openapi.json`; run
   `pnpm --filter @biasmarket/types generate` and inspect whether generated SDK
   files change. Rebase #325 onto #324.
3. Re-review #326's seller-field projection, creator includes, and race/expiry
   tests. Fix first-open tracking-write failures so the correction lockout
   cannot be skipped. Then refresh #327–#331.
4. Re-review #327's narrowed optional-template fallback and editor tests; ensure
   5xx/network errors surface. Then refresh #328–#331.
5. Refresh #328 and rerun checkout behavior tests; keep this PR a refactor.
6. Fix #329 quantity bounds and reset/clamp quantity on product/variant changes.
   Add component regressions. Refresh #330/#331.
7. Re-review #330's summary, template readiness, and removed seller preview link
   at `203f2fce`; do not reimplement unless new tests/trace find a gap. Refresh
   #331 if #330 changes.
8. Fix #331's stale result after cancellation and expired-hold action state; add
   transition and exact expiry tests.
9. Once all code heads are stable, prepare PR-description attribution cleanup;
   apply only after authorization.
10. Re-review all refreshed diffs and thread state. Run the focused commands and
    monitor current hosted checks for every PR/base pair.

## Verification

Previously run for this review refresh:

- Hosted #325 API log shows the exact OpenAPI pattern mismatch; hosted E2E fails
  at the same drift check before migrations/tests.
- `bash scripts/ci/check-openapi-drift.sh` was run in a clean detached #325
  worktree after API build and loading `scripts/ci/e2e.env.example`; it
  reproduced the one-line pattern difference.
- Focused #327/#329 review runs passed 8 and 34 tests respectively.

Run after implementation (not yet run):

```bash
pnpm --filter api generate:openapi
pnpm --filter @biasmarket/types generate
bash scripts/ci/check-openapi-drift.sh
pnpm --filter api typecheck
pnpm turbo run lint --filter=api --filter=web
pnpm --filter api test
pnpm --filter web test
bash scripts/ci/e2e.sh
```

Run E2E only in an isolated environment owned by this task. Verify Codacy,
`E2E (API)` and `CI Success` are green on fresh heads, and confirm the E2E job
reaches and passes tests.

## Acceptance criteria

- Current bases equal the refreshed parent heads; #324 is based on current main.
- OpenAPI and generated client match the updated DTO; drift gate passes.
- Codacy no longer reports weak randomness.
- Assisted-order E2E and the applicable full API E2E job execute and pass.
- Every PR has fresh green required checks on its current head/base.
- Existing findings are fixed or explicitly deferred; no duplicate review
  comments are posted.
- #268 release gate and #333 follow-up are preserved.

## Constraints

- Preserve tenant `storeId` checks, lock order, token privacy, and checkout
  behavior. No schema/API contract change unless a verified finding requires it.
- Work in isolated worktrees. Keep the user's checkout and unrelated work
  untouched.
- No merge, release, review post, PR-description edit, or push without the
  required authorization.

## First action

Read the plan and review notes, inspect `git status`, refresh live PR heads and
bases, then start with #324's current-main rebase before changing #325.
