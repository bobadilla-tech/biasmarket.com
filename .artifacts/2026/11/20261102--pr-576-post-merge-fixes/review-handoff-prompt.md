# Review handoff: post-merge fixes for PR #576

Paste this into a third Claude Code session in
`/Users/ultirequiem/ulti/biasmarket.com` after the implementer has opened the
PRs.

## Task

Review the stack of PRs that implement
`.artifacts/2026/11/20261102--pr-576-post-merge-fixes/plan.md` using the
`pr-review` skill (`.claude/skills/pr-review`): review notes and drafts under
`.artifacts/` first, verify claims by running code, subagent review rounds, then
wait for a human to approve before posting. Do not post anything until approved.

## PRs to review (the implementer fills these in at the end of their session)

| Slice    | PR number | Branch | Base | Head SHA |
| -------- | --------- | ------ | ---- | -------- |
| 1        |           |        |      |          |
| 5a       |           |        |      |          |
| 3a       |           |        |      |          |
| 3b       |           |        |      |          |
| 8        |           |        |      |          |
| 4a       |           |        |      |          |
| 4b       |           |        |      |          |
| 5b       |           |        |      |          |
| 6a-i     |           |        |      |          |
| 6a-ii    |           |        |      |          |
| 6c       |           |        |      |          |
| 6b-race  |           |        |      |          |
| 6b-erase |           |        |      |          |
| 2a       |           |        |      |          |
| 2b       |           |        |      |          |
| 7        |           |        |      |          |

(Leave rows empty for slices that were not implemented; PR 6b-erase and the
`app.json` part of 2b are expected to be absent until Q8 / Q7 are answered.)

## Inputs

- Plan: `.artifacts/2026/11/20261102--pr-576-post-merge-fixes/plan.md`
- Review log (every round-1..3 finding and decision, including rejected ideas):
  `.../review-log.md`
- Original review that produced the work:
  `.artifacts/2026/11/20261102--review-pr-576-mobile-epic/` and
  https://github.com/bobadilla-tech/biasmarket.com/pull/576#pullrequestreview-5737995758
- Reviewer identity: use `GH_TOKEN=$(gh auth token --user UltiRequiem)` per
  command (the login is case-sensitive); confirm with `gh api user --jq .login`;
  never switch the global account.

## Process

Each stacked PR is reviewed against its own base first
(`git diff origin/<base>...origin/<head>`), then the stack top is re-checked. CI
results exist for every PR (the workflow has no `branches:` filter), but only
the jobs whose path filters match run. Follow `pr-review` sections 0-6 exactly:
scratch worktree, record head SHAs, existing comments first, no duplicated bot
comments, run what is cheap (typecheck, the listed specs, generators), and state
what could not run.

## Review checklist (from the plan)

Acceptance criteria 1-22 (plan section 9) and the appendix mapping each original
comment (576-1..576-23) to a PR. For every PR check:

1. It closes only the criteria it claims, and its Verify commands were really
   run (look at the PR text and the CI logs; "not run" is fine if stated).
2. Known risks to probe, by area:
   - Replay (3a/3b): `resolveReplay` used at all three read sites; compare
     before expiry (mismatch vs cancelled -> 409 not 410); `PAYMENT_SUBMITTED`
     and `VERIFIED` past `expiresAt` replay; 410/409 bodies carry no order id;
     the pre-lookup still precedes the missing-proof 400 and the upload; 4xx
     deletes the image without a lookup; non-HTTP error lookup is store-scoped;
     `pickupDate` compare in UTC; shipping compare when either side has an
     address; `proofSubmitted` uses `source`; mutation-test the new compare
     table and the P2002 catch.
   - Mobile (4a/4b/5a/5b): `*.component.tsx` naming (run `jest --listTests`);
     AGENCY form validates; the five i18n keys in both locales and the parity
     test; view-state gating (`isError && data === undefined`, relevant query
     only); key record `v`/`done` semantics, per-store promise chain, 409/410
     mapping, neutral copy; refresh handler restored with the generation guard
     (no pasted base block overriding current code); 401-on-delete does not
     claim deletion; cart/key wipe only on deletion.
   - Deletion (6a/6b/6c): the lock order table exists and matches the code;
     locked read in `claimWithGoogle`; `lockLiveBuyerAccount` on
     address/link/password/profile writers; null- phone attach `where`;
     `P2034`/`40P01`/`P2028` -> retryable 409 with no PII; e2e specs ran in CI
     `E2E (API)`; retained-data table matches README/UI copy; `Customer` erasure
     uses `hasRemainingCustomerOrders` and the assisted-customer lock; seller
     list/detail do not throw on `erased:<id>`.
   - Release path (1/2a/2b/8): `pnpm/action-setup` before `actions/setup-node`
     everywhere; `mobile-production-build.yml` pnpm `10.11.0`; the emulator
     `script:` is one line; secrets step-scoped; no `npm install -g` /
     `curl | bash`; `eas-cli` exact, lockfile adds only its subtree;
     `--environment production`; OTA guard script; dependabot skip condition
     parenthesized; Caddy redaction in both `log` blocks; docs match the
     workflows and the admin prerequisites.
3. No change to out-of-scope files (`mobile-release.yml`, the shared validation
   schema, DB schema/migrations, the assisted-order idempotency path).
4. Generated files (`openapi.json`, `metadata.ts`,
   `packages/types/generated/**`) are regenerated by the documented commands in
   order and the two drift scripts pass.
5. Coverage floors are not lowered; new pure modules are in `coverage.include`.

## Known risks / uncertainty to keep in mind

- PR 6b-race / 6b-erase: the design survived three review rounds that each found
  new problems; treat any lock-order claim as unproven until the e2e
  demonstrates it.
- Q7 (encryption declaration) and Q8 (retention policy) are owner decisions;
  flag any PR that decided them silently.
- Deploy-order rules: PR 8 before any mobile build with 5a; PR 3a before any
  build with 4b.
- Assumptions not verified in planning: Maestro env-var support (Q6), whether
  the Maestro release publishes a checksum, `caddy` availability, Q10.

## Output

Per the skill: review notes + drafts + rounds under a new
`.artifacts/YYYY/MM/YYYYMMDD--review-pr-576-post-merge-fixes/`; then stop for
approval.
