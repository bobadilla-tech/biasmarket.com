# Review notes: issue-batch follow-up PRs

Review started 2026-10-29 against the handoff in
`20261029--issue-batch-followups`. GitHub state changed during review: PRs #428,
#429, #431, #432, #433, #434, #435, and #436 merged before this review pass
completed. I refreshed PR heads and `main` after each observed change.

## Scope and current state

| PR   | Scope                                               | State at latest check                           | Review result                                                                                                                                                                                        |
| ---- | --------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #428 | Orval pin and SDK drift check                       | merged                                          | No code defect found; generator and drift check verified locally.                                                                                                                                    |
| #429 | Checkout upload limits                              | merged                                          | No code defect found; focused supertest passed.                                                                                                                                                      |
| #430 | Vitest `next/image` stub                            | merged                                          | No defect found; full web suite passed locally.                                                                                                                                                      |
| #431 | Codacy migration exclusion                          | merged                                          | `.codacy.yml` only; #342 closed. External Codacy settings remain unverified.                                                                                                                         |
| #432 | Shared six-character order ref                      | merged                                          | No defect found; focused tests and D4 grep passed.                                                                                                                                                   |
| #433 | Hide imageless marketplace products                 | merged                                          | No defect found; focused service test passed.                                                                                                                                                        |
| #434 | Invite preconditions and event dedupe               | merged                                          | Post-merge concurrency follow-up found; patch pushed to its former branch after the PR closed and is not merged.                                                                                     |
| #435 | Google login without email linking                  | merged                                          | No defect found; API and web suites passed.                                                                                                                                                          |
| #436 | Product image cap                                   | merged                                          | No defect found; API/OpenAPI and SDK generators were run.                                                                                                                                            |
| #437 | Remove `buyerAccountId` from seller order responses | merged                                          | No defect found; 60 controller tests passed after building `@biasmarket/utils`.                                                                                                                      |
| #438 | Caddy token redaction                               | merged at 17:19:36Z (`UltiRequiem`, per GitHub) | Local validation and log-redaction probes passed. The handoff explicitly reserved merge and VPS recreation for a human; we did not issue the merge or perform production actions. #340 remains open. |
| #439 | Assisted-order idempotency API                      | merged                                          | Post-merge adversarial review found a P2 race when the same key requests the last unit concurrently; see follow-up below.                                                                            |
| #441 | Assisted-order idempotency web                      | merged                                          | Web key stability/replay behavior reviewed; focused web tests passed.                                                                                                                                |
| #442 | Epic #255 safe follow-ups                           | merged                                          | Safe subset merged; follow-up issues #443-#446 created and #380 closed with links.                                                                                                                   |

## Verified checks

- #428: `pnpm --filter @biasmarket/types generate`,
  `bash scripts/ci/check-types-sdk-drift.sh`, `pnpm check:workspaces`, and
  `shellcheck scripts/ci/*.sh` passed. Mutating `CreateProductDto.name.type` in
  a temporary OpenAPI copy made the drift check fail with the generated
  interface diff; restoring the source and re-running the check left the
  worktree clean.
- #429:
  `pnpm --filter api exec vitest run src/modules/orders/infrastructure/checkout-upload-limits.spec.ts`
  passed (9 tests). `git diff --check` was clean.
- #430: full web suite passed in review (135 files, 823 tests); `next.config.ts`
  is unchanged. After rebasing, the diff is still limited to the image stub, its
  existing `src` assertion, and the config test.
- #432: utils build and focused order-ref, API, and web tests passed; D4 grep
  found no extra order-ref implementation. `git diff --check` was clean.
- #433: product-search service unit test passed (12 tests); marketplace-only
  filter is shared with count/bestseller queries and store pages omit it.
- #434 follow-up patch: unit spec passed (34 tests) after changing the advisory
  lock to order/type scope; added an e2e assertion for a moment-less duplicate
  against an existing moment-specific click. The e2e assertion is not locally
  run. The original PR had already merged, so the patch is not on `main`.
- #435: API suite passed (1,074 tests) and web suite passed (823 tests); the
  Google flow resolves by Google subject or creates an account, and skip logs
  contain IDs only.
- #436: `pnpm --filter api generate:openapi`,
  `pnpm --filter @biasmarket/types generate`, and
  `bash scripts/ci/check-openapi-drift.sh` passed with the E2E example
  environment; generated files had no extra worktree diff.
- #437: built `@biasmarket/utils`, then
  `pnpm --filter api exec vitest run src/modules/orders/infrastructure/order.controller.spec.ts`
  passed (60 tests). Seller/assisted/checkout DTOs no longer expose the field;
  internal row types and `Address` retain it.
- #438: `caddy validate` passed for the full file after copying the checked-in
  `.example` active fragments into a temporary config. Throwaway Caddy requests
  to `/api/public/orders/SECRET-TOKEN?x=1` and
  `/es/store/x/pedido/SECRET-TOKEN?x=1`, with a token-bearing Referer and a dead
  upstream, returned 502 while logs contained only `REDACTED` and no `SECRET`.
  `docker compose config --services` passed with a dummy `IMAGE_TAG`.
- #439: API unit tests passed (26); destructive-migration check passed. The
  later post-merge E2E follow-up is described below.
- #441: focused web tests passed (30). Browser/API integration was not rerun in
  this review.
- #442: focused utils and web specs passed (29 total); OpenAPI drift was
  reported clean in the implementation log, not independently rerun here.

## Findings

### Post-merge follow-up: #434 mixed-moment concurrency

`recordInvite` used an advisory-lock key containing `moment`, but the lookup for
a moment-less event is a wildcard across all moments. A moment-specific and a
moment-less request could therefore acquire different locks, both observe no
row, and insert before either sees the other. This was reported after #434 had
already merged. A patch is preserved on branch `fix/invite-server-preconditions`
at commit `3eec5251`, but the closed PR was not reopened and `main` was not
edited. The focused service unit test passes; the new e2e assertion needs a
hosted run if a follow-up PR is authorized.

## Not independently verified

- #429 full API e2e and all acceptance boundaries were not rerun here; the
  focused test and hosted checks passed before merge.
- #433/#435/#436 full DB e2e suites were not rerun; their reported local/hosted
  evidence is recorded above.
- #438 VPS behavior, existing log rotation, and production container recreation
  are intentionally not run.
- Browser/device checks for Epic #255 remain human tasks.

## Final remote status and follow-up

At the final remote check, PRs #428-#442 were merged. Issues #338, #375, #391,
#341, #342, #339, #356, #378, #377, #376, #335, #379, #336, and #380 were
closed. #340 remains open. #443-#446 are open follow-up issues. Latest `main`
was `5e55be28`; CI succeeded and CD was still in progress.

Follow-up PR [#447](https://github.com/bobadilla-tech/biasmarket.com/pull/447)
combines both post-merge concurrency fixes: (1) #439's last-stock idempotency
race, where the loser could return stock-insufficient 400 instead of replay 409;
and (2) #434's mixed moment and legacy invite-event dedupe race. Assisted-order
failures now recheck the store/seller-scoped key after a stock
`BadRequestException`. Invite events share an order/type lock, and
moment-specific lookups include a prior legacy row with empty payload, so either
arrival order dedupes consistently. The PR adds unit and E2E coverage for both
gaps; issues #336 and #378 link to it.

Verification on PR head `5356605f`: focused API unit specs passed (49), the
`public-orders.e2e-spec.ts` and `assisted-order-idempotency.e2e-spec.ts` real-DB
specs passed (19), `pnpm --filter api build` passed, and Prettier plus
`git diff --check` passed. The PR is open and mergeable; hosted CI and Codacy
were still running at the last check.
