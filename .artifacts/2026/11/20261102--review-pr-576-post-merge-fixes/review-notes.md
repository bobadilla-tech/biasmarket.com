# Review notes: PR #576 post-merge fixes

Review date: 2026-11-02 (America/Lima) Repository:
`bobadilla-tech/biasmarket.com` Reviewer account: `UltiRequiem` (verified with
`gh api user --jq .login`)

## Scope

| PR   | Slice                | Base                                | Head SHA                                   | Existing feedback                      | Status                                         |
| ---- | -------------------- | ----------------------------------- | ------------------------------------------ | -------------------------------------- | ---------------------------------------------- |
| #586 | 1                    | `main`                              | `d87d9dfdc89e52ac88918eb29351fafbc6ba83cf` | CodeRabbit review and 5 inline threads | Open                                           |
| #587 | 5a                   | `main`                              | `2f6a9b727dea60ccf4cffb62dcb90890d343159f` | CodeRabbit review body                 | Open                                           |
| #591 | 3a                   | `main`                              | `0cfd2ab2e45a4c9190ce09db4af47da8001c1622` | None                                   | Open                                           |
| #592 | 3b                   | `fix/checkout-replay-rules`         | `4787b174b5dec718bd44eaf6d39117174bb04778` | None                                   | Open                                           |
| #594 | 8                    | `main`                              | `497055e31e4c7de28c077286a93ba37ab67c58c2` | None                                   | Open                                           |
| #597 | 4a                   | `main`                              | `b61b063dacdbf6fb4c56f984c5781e6781e52462` | None                                   | Open                                           |
| #600 | 4b                   | `fix/mobile-checkout-courier`       | `48d4fadaebe81d9a56404214c56fea58eca89604` | None                                   | Open                                           |
| #601 | 5b                   | `fix/mobile-session-renewal`        | `ba4790576644a01610aad8526f6880b613d8b3fa` | None                                   | Open; GitHub reports merge conflict            |
| #602 | 6a-i                 | `main`                              | `195537ed0e4d922949e9e76f875f03fa818045e5` | None                                   | Open; GitHub reports merge conflict            |
| #603 | 6a-ii                | `fix/buyer-account-deletion-safety` | `6a5d53c54263c35ca8ad42f5646b3a0cc5e4af9e` | None                                   | Open                                           |
| #605 | 7                    | `main`                              | `a9fdae703dcdfcc4e61db543e57d16389dc75bc3` | None                                   | Open; GitHub initially reported merge conflict |
| #608 | 2a                   | `fix/mobile-workflows-runnable`     | `e5bb632128d690b632d240d61d6d2ec8ef9d8d89` | None                                   | Open                                           |
| #609 | 2b (`eas.json` only) | `main`                              | `3a61c841cd808b6247f9b9d4cf56598db53b7489` | None                                   | Open                                           |

Planned PR 6b-race, PR 6b-erase, and the `app.json` compliance change are not
open PRs in this set. The owner has clarified that customer-retention work is a
future follow-up because the app is not published. No encryption declaration
will be inferred.

The user explicitly authorized posting review comments, fixing the findings, and
merging eligible PRs. GitHub environment creation was also authorized. Created
`mobile-staging` and `mobile-production`, each restricted to `main`. Neither
environment has secrets or required reviewers yet; the only repository Actions
secret currently listed is `CODECOV_TOKEN`.

## Existing feedback inventory

- #586 has five CodeRabbit inline comments. Review each against the current
  workflow and reply to valid existing threads instead of duplicating them.
- #587 has a CodeRabbit review body with follow-up findings; there are no
  separate inline threads. Verify each and avoid duplicating valid findings.
- #591, #592, #594, #597, #600, #601, #602, #603, #605, #608 and #609 had no
  submitted review or inline comment at the time of inventory.

## Verification run so far

- In `/private/tmp/biasmarket-pr576-4b` at #600: mobile typecheck, 49 unit
  tests, 4 component tests, `jest --listTests`, coverage, and lint passed.
  Coverage: statements 88.96%, branches 87.70%, functions 91.30%, lines 90.44%,
  above the configured package thresholds.
- In `/private/tmp/biasmarket-pr576-5b` at #601: mobile typecheck, 31 unit
  tests, 7 component tests, `jest --listTests`, coverage, lint, types typecheck,
  and 14 types tests passed. Coverage: statements 97.36%, branches 97.87%,
  functions 96.29%, lines 98.46%.
- In `/private/tmp/biasmarket-pr576-7` at #605: 2 web well-known route suites (6
  tests) and 2 mobile suites (9 tests) passed.

## Findings

Review in progress. Add verified findings, dropped candidates, remaining gaps,
and current CI status before posting.
