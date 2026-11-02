# Review notes: PR #576 post-merge fixes

Review date: 2026-11-02 (America/Lima)
Repository: `bobadilla-tech/biasmarket.com`
Reviewer account: `UltiRequiem` (verified with `gh api user --jq .login`)

## Scope

| PR | Slice | Base | Head SHA | Existing feedback | Status |
| --- | --- | --- | --- | --- | --- |
| #586 | 1 | `main` | `d87d9dfdc89e52ac88918eb29351fafbc6ba83cf` | CodeRabbit review and 5 inline threads | Open |
| #587 | 5a | `main` | `2f6a9b727dea60ccf4cffb62dcb90890d343159f` | CodeRabbit review body | Open |
| #591 | 3a | `main` | `0cfd2ab2e45a4c9190ce09db4af47da8001c1622` | None | Open |
| #592 | 3b | `fix/checkout-replay-rules` | `4787b174b5dec718bd44eaf6d39117174bb04778` | None | Open |
| #594 | 8 | `main` | `497055e31e4c7de28c077286a93ba37ab67c58c2` | None | Open |
| #597 | 4a | `main` | `b61b063dacdbf6fb4c56f984c5781e6781e52462` | None | Open |
| #600 | 4b | `fix/mobile-checkout-courier` | `48d4fadaebe81d9a56404214c56fea58eca89604` | None | Open |
| #601 | 5b | `fix/mobile-session-renewal` | `ba4790576644a01610aad8526f6880b613d8b3fa` | None | Open; base conflict |
| #602 | 6a-i | `main` | `195537ed0e4d922949e9e76f875f03fa818045e5` | None | Open; main conflict |
| #603 | 6a-ii | `fix/buyer-account-deletion-safety` | `6a5d53c54263c35ca8ad42f5646b3a0cc5e4af9e` | None | Open |
| #605 | 7 | `main` | `a9fdae703dcdfcc4e61db543e57d16389dc75bc3` | None | Open |
| #608 | 2a | `fix/mobile-workflows-runnable` | `e5bb632128d690b632d240d61d6d2ec8ef9d8d89` | None | Open |
| #609 | 2b (`eas.json` only) | `main` | `3a61c841cd808b6247f9b9d4cf56598db53b7489` | None | Open |

Planned PR 6b-race, PR 6b-erase, and the `app.json` compliance change are not
open PRs in this set. The owner clarified that customer-retention work is a
future follow-up because the app is not published. No encryption declaration
will be inferred.

The user explicitly authorized posting review comments, fixing findings, and
merging eligible PRs. Environment creation was also authorized. `mobile-staging`
now allows `main` and `mobile-release`. `mobile-production` is limited to
protected branches and requires the `UltiRequiem` reviewer. `prevent_self_review`
is false. The only repository Actions secret currently listed is
`CODECOV_TOKEN`; no mobile environment secrets are configured. `main` is not
protected and `mobile-release` does not exist, so live workflows remain blocked
pending the remaining admin setup.

## Existing feedback inventory

- #586 has five CodeRabbit inline comments. All remain valid; reply on the
  existing threads rather than opening duplicate inline comments.
- #587 has a CodeRabbit review body with two valid follow-up findings and no
  separate inline threads. Reference that review in the new review body rather
  than duplicating inline comments.
- #591, #592, #594, #597, #600, #601, #602, #603, #605, #608 and #609 had no
  submitted review or inline comment at inventory time.

## Verification

- #600 in `/private/tmp/biasmarket-pr576-4b`: mobile typecheck, 49 unit tests,
  4 component tests, `jest --listTests`, coverage, and lint passed. Coverage:
  statements 88.96%, branches 87.70%, functions 91.30%, lines 90.44%, above the
  configured package thresholds.
- #601 in `/private/tmp/biasmarket-pr576-5b`: mobile typecheck, 31 unit tests,
  7 component tests, `jest --listTests`, coverage, lint, types typecheck, and 14
  types tests passed. Coverage: statements 97.36%, branches 97.87%, functions
  96.29%, lines 98.46%.
- #587 in `/private/tmp/biasmarket-pr576-5a`: mobile typecheck, 28 unit tests,
  6 component tests, coverage, and `jest --listTests` passed. Coverage matched
  #601: statements 97.36%, branches 97.87%, functions 96.29%, lines 98.46%.
- #605 in `/private/tmp/biasmarket-pr576-7`: 2 web well-known route suites (6
  tests) and 2 mobile suites (9 tests) passed.
- #602 in `/private/tmp/biasmarket-pr576-6ai`: focused customer-auth and
  customer-account service specs (114 tests) and API typecheck passed.
- #603 in `/private/tmp/biasmarket-pr576-6aii`: API/types typecheck and 12
  types tests passed. The documented OpenAPI/SDK generators and both
  `check-openapi-drift.sh` / `check-types-sdk-drift.sh` passed. OpenAPI startup
  initially failed without environment values; it passed with dummy local-only
  DB/Redis/storage/auth values and made no live-service calls.
- #591 in `/private/tmp/biasmarket-pr591-mutation`: baseline focused
  replay/create-order specs passed (91 tests); a removed customer-name compare
  and a P2002-winner bypass were each detected by tests. After restoring both
  mutants, all 91 tests passed again. The isolated worktree was clean and
  removed.
- #591/#592: four focused API specs passed (103 tests); hosted `E2E (API)` is
  green for both. No local DB-backed E2E was run.
- #586/#608: actionlint and ShellCheck passed; `bash -n` passed for the
  Maestro/install/OTA scripts; OTA-guard probes behaved as expected. No EAS,
  staging workflow, emulator, or device flow ran.
- #594: Caddy validation passed in the isolated configuration probe. No
  post-deploy log check ran.
- Hosted `CI Success` is green for every open PR in scope. Relevant hosted
  `Mobile`, `API`, `Types`, and `E2E (API)` jobs are green where path filters
  select them. #608 CodeRabbit was `IN_PROGRESS` at the last check.
- `git diff --check` passed for all 13 PR diffs.

## Verified findings

- #586: all five existing CodeRabbit comments remain valid: pre-build
  fixture-secret presence validation; preserving pending production build,
  update, and store-submit dispatches with `queue: max`; and independent iOS /
  Android store submissions. Reply on the existing threads; do not duplicate.
- #587: both valid CodeRabbit follow-ups remain unresolved. A stale delete 401
  can route a newer session to login, and refresh can persist a token after
  provider unmount. These are in a review body rather than inline threads; refer
  to that existing review in the new REQUEST_CHANGES body.
- #597: `checkoutViewState` gates on enabled courier configuration rather than
  the shopper's selected method, so a courier query failure blocks pickup on a
  mixed-method store. A direct probe returned `configError: "courier"` for a
  delivery config containing both methods and a failed courier query. The new
  locale-parity test also skips assertions when a blank shown field unexpectedly
  passes validation.
- #608: the lockfile adds the exact `eas-cli@27.2.0` pin but also removes
  existing `semver@7.8.5` and `yaml@2.9.0` snapshots and changes peer snapshots
  outside the EAS CLI subtree. CI passes; the plan required preserving unrelated
  resolutions.

## Candidates investigated and dropped

- #600 maps every checkout-path 409 internally to `mismatch`. The other
  reachable `ConflictException` from `findOrCreateCustomer` occurs inside the
  order transaction before `Order.create`, so no order committed. The displayed
  copy is neutral (“couldn't confirm; check My orders”), and clearing the key is
  safe for that rollback.
- #600's stale-cart replay case requires the done-marker write to succeed and
  cart persistence to fail. That case is documented as an accepted residual in
  the plan and covered by the existing test.
- #586 store-submit split finding is valid: pinned EAS CLI 27.2.0 waits by
  default, so an iOS submission reaching the job timeout prevents the sequential
  Android command from starting. GitHub's current concurrency docs also confirm
  that the default single pending run is replaced by later runs.
- #602's merge conflict is from newer `main` adding `countryCode: null` deletion
  coverage. It is not a code finding; resolution must preserve that assertion
  and the PR's deletion/stale-session test.
- #601 has one component-test conflict because base PR #587 advanced. It is not
  a code finding; keep both PRs' tests when rebasing.

## Not verified / external state

- No local database-backed E2E or live API race run. Hosted `E2E (API)` passed
  for #591, #592, #602, and #603.
- No hosted EAS build, workflow dispatch, staging credentials, emulator, or
  device run. Environment secret values are not visible through the API; no
  mobile environment secrets are configured.
- Production is protected by reviewer and protected-branch rules, but `main`
  is not currently protected. `mobile-release` does not exist. Do not dispatch
  until those settings and the required secrets are in place.
- Q7 remains unanswered; #609 intentionally changes only `eas.json` and makes
  no encryption declaration. Customer retention remains a future follow-up per
  the owner's direction; no erasure-policy PR is open.

## Mergeability notes

- #601 conflicts with current base #587 in
  `apps/mobile/src/features/auth/session-context.component.tsx`; keep both
  PRs' tests after #587 is fixed.
- #602 conflicts with newer `main` in
  `apps/api/test/customer-account-auth.e2e-spec.ts`; combine the deletion test
  with the country-clearing assertion from #598.
- #603 is stacked on #602 and merges cleanly once that base is updated.
- #592 is stacked on #591; #600 on #597; #601 on #587; #603 on #602; #608 on
  #586. Merge each base before its dependent PR.

## Review status

Initial verification and drafts are complete. Fresh adversarial, gap-hunt,
author-advocate, tone, and final-payload rounds remain before posting.
