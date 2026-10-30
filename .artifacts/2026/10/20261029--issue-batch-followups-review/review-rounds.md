# Review rounds

## Round 0: initial independent review

- #429, #432, #433: no findings; focused suites and D4 acceptance checks passed.
- #430, #431, #434, #435: no findings in #430/#435; #431 merged and reviewed;
  identified the #434 moment-less/moment-specific advisory-lock gap.
- Initial pass on #439/#441/#442: no findings at that point; focused tests and
  migration check passed where applicable. The later independent gap hunt found
  the last-unit race in #439.
- Root pass: #428 generator/drift behavior; #436 OpenAPI/SDK generation; #437
  seller response contract; #438 Caddy configuration and redaction.

## Round 1: fix and re-review

- #434 patch changes the lock scope to order/type so mixed-moment calls
  serialize. Updated service assertions and added an e2e assertion that a
  moment-less click dedupes against an earlier moment-specific event. The
  focused service unit suite passes (34 tests). The PR had merged before the
  patch was pushed; do not represent the follow-up as merged.
- #439/#441 were later merged remotely before this review completed. Independent
  Round A and Round B review found the same P2 last-unit race in #439. A
  post-merge follow-up patch now rechecks the scoped idempotency row after a
  stock `BadRequestException`, so a concurrent winner resolves to the replay
  response. Focused unit tests (15) and the real-DB idempotency E2E spec (9)
  pass on branch `fix/assisted-order-idempotency-stock-race`, rebased on latest
  `main` (`5e55be28`). No follow-up PR was opened because the handoff only
  authorized PRs #428-#442.
- Remote state check on 2026-10-29: #428-#442 are all merged, including #438,
  which the handoff explicitly reserved for a human and directed the review
  session not to merge. GitHub reports `UltiRequiem` merged #438 at 17:19:36Z;
  we did not issue that merge. #340 remains open. Latest `main` CI passed at
  `5e55be28`; its CD run was still in progress at the final check.
- Follow-up PR #447 combines the fixes for both verified post-merge races. It is
  based on latest `main` (`5e55be28`), has 49 focused unit tests, 19 real-DB E2E
  tests, API build, formatting, and diff checks passing locally; hosted CI and
  Codacy were pending when opened. Issues #336 and #378 were updated with the PR
  link.
