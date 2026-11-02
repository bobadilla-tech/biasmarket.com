# Implementation handoff: post-merge fixes for PR #576 (mobile Epic)

Paste this whole file into a fresh Claude Code session started in
`/Users/ultirequiem/ulti/biasmarket.com`.

## Mission

Implement the fixes for the defects found in the post-merge review of PR #576
(merged 2026-11-02). Work in small stacked PRs, one per slice in the plan. Do
not merge anything. Do not post anywhere except opening the PRs (and the
follow-up issues listed in the plan, when the plan says so).

## Context

- Repo: `bobadilla-tech/biasmarket.com` (Turborepo; pnpm only; ESM only; API
  relative imports use `.js` extensions; every tenant query filters by
  `storeId`; generated OpenAPI/Orval files are committed). Read `CLAUDE.md`
  first.
- Plan (read it fully before coding; it has file:line facts, designs, per-PR
  scope, tests, commands, acceptance criteria, open questions):
  `/Users/ultirequiem/ulti/biasmarket.com/.artifacts/2026/11/20261102--pr-576-post-merge-fixes/plan.md`
- Review log (every reviewer finding and decision):
  `.../20261102--pr-576-post-merge-fixes/review-log.md`
- Source review (the 23 posted comments, notes, drafts):
  `.artifacts/2026/11/20261102--review-pr-576-mobile-epic/` and the posted
  review
  https://github.com/bobadilla-tech/biasmarket.com/pull/576#pullrequestreview-5737995758
- Base: `origin/main` was `3c40e0b0` when planned. If `main` moved in the files
  listed in plan section 5, re-read the plan's section 2 facts first.
- Node: the Homebrew default node aborts in the planning environment (missing
  `libsimdjson`); put `/opt/homebrew/opt/node@24/bin` first on `PATH` if you see
  that. Build workspace packages before API/mobile suites (plan section 8).

## Decisions already made

(Details and reasons are in plan section 4 and `review-log.md`.)

- No machine-readable error `code`: the global exception filter strips it. A
  replay of a **dead** order returns **410**; a payload mismatch returns
  **409**. Mobile maps by `ApiError.status`.
- Replay rule (one helper, `resolveReplay(order, dto, now)`, used at all three
  read sites; compare first, then expiry): dead = `status === "CANCELLED"` or
  `paymentStatus === "CANCELLED"` or (`PENDING_PAYMENT`/`PARTIALLY_PAID` and
  `expiresAt < now`). `PAYMENT_SUBMITTED` and `VERIFIED` replay normally.
  Compare `pickupDate` (UTC date string) and compare shipping when either side
  has an address. The controller pre-lookup stays before the missing-proof 400
  and the upload. `whatsappUrl` stays `null` on replay.
- Error-path proof cleanup: 4xx `HttpException` -> `deleteImage` directly, no
  lookup; 5xx/non-HTTP -> store-scoped lookup, delete only if unreferenced. No
  migration.
- Mobile key record `{ v: 1, id, fingerprint, done? }`, items-only fingerprint,
  mark `done` first (one retry) then clear the cart; 410 clears the key; 409
  clears it and shows neutral "check My orders" copy. No form-hash, tombstone,
  TTL or request timeout (follow-ups).
- Account deletion lock order: phone lock -> assisted-customer locks (sorted) ->
  Order rows (`FOR NO KEY UPDATE`, id-sorted) -> `BuyerAccount` row; phone
  change, deadlock or timeout -> retryable 409; `claimWithGoogle` uses a locked
  read; `lockLiveBuyerAccount` for the other writers; the null-phone attach
  `where` gains `passwordVersion` and `email`.
- Test naming: mobile component tests are `*.component.tsx` (jest), unit tests
  are `*.test.ts` (vitest); new mobile logic goes in pure modules. Run
  `pnpm --filter mobile exec jest --listTests` and confirm new component files
  appear.
- Release path: `eas-cli` becomes an exact devDependency of `apps/mobile`;
  workflows call `pnpm --filter mobile exec eas`; secrets are step-scoped; the
  environment protection rules (not `if: github.ref`) are the real control.

## Reviewed plan (ordered steps, one PR per slice, branches, bases)

Merge order: **1, 5a, 3a, 3b, 8, 4a, 4b, 5b, 6a-i, 6a-ii, 6c, 6b-race, 6b-erase,
2a, 2b, 7**. Full scope, tests and Verify lines per PR are in plan section 6.

| PR       | Branch (suggested)                      | Base                  | One-line scope                                                                                                                                                            |
| -------- | --------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | `fix/mobile-workflows-runnable`         | `main`                | pnpm-before-node order, Maestro `script:` -> `scripts/ci/mobile-maestro.sh`, KVM step, production-build pnpm `10.11.0`/Node 24, step-scoped secrets, concurrency/timeouts |
| 5a       | `fix/mobile-session-renewal`            | `main`                | restore `setSessionRefreshHandler`, 401-on-delete neutral handling, `http.test.ts` cases                                                                                  |
| 3a       | `fix/checkout-replay-rules`             | `main`                | `resolveReplay` (409/410), `pickupDate`, compare table + P2002 + race e2e                                                                                                 |
| 3b       | `fix/checkout-proof-cleanup`            | 3a                    | `proofSubmitted` source, 4xx cleanup without lookup, controller spec                                                                                                      |
| 8        | `fix/caddy-redact-session-headers`      | `main`                | Caddy log redaction for `X-Session-Token`, `Idempotency-Key`                                                                                                              |
| 4a       | `fix/mobile-checkout-courier`           | `main`                | AGENCY fields, five i18n keys + parity test, config-failure view state                                                                                                    |
| 4b       | `fix/mobile-checkout-retries`           | 4a                    | `mapCheckoutError`, key record, proof-image downscale                                                                                                                     |
| 5b       | `fix/mobile-small-auth-fixes`           | 5a                    | login slug, search sync, `signIn` ordering, cleanup on deletion, orders retry                                                                                             |
| 6a-i     | `fix/buyer-account-deletion-safety`     | `main`                | `clearCookie`, `@Throttle`, log line, deletion tests                                                                                                                      |
| 6a-ii    | `chore/delete-me-and-idempotency-types` | 6a-i (merge after 3b) | `OkResponseDto`, uuid header format, regenerated OpenAPI/SDK                                                                                                              |
| 6c       | `fix/web-account-deletion-ui`           | `main`                | `AlertDialog`, `invalidateQueries`, mutation file, test                                                                                                                   |
| 6b-race  | `fix/buyer-deletion-concurrency`        | 6a-i                  | lock design, writer guards, e2e (**caveats below**)                                                                                                                       |
| 6b-erase | `fix/buyer-customer-erasure`            | 6b-race               | `Customer` erasure (**blocked on Q8**)                                                                                                                                    |
| 2a       | `chore/mobile-release-hardening`        | 1                     | eas-cli pin, `--environment production`, OTA guard script, dependabot skip, docs (**merge waits on Q2**)                                                                  |
| 2b       | `chore/mobile-eas-profiles`             | `main`                | `eas.json` env/autoIncrement; `app.json` encryption flag **only after Q7**                                                                                                |
| 7        | `test/mobile-web-gaps`                  | `main`                | `.well-known`, `+native-intent`, `private-payment-proof` tests (deferrable)                                                                                               |

Ready now: 1, 3a, 3b, 4a, 4b, 5a, 5b, 6a-i, 6a-ii, 6c, 7, 8. Start with PR 1,
then 5a, then 3a, in that order.

## Review findings to preserve

Every posted review comment (576-1 to 576-23) maps to a PR in plan section 9
(appendix). Do not drop any of them; if you decide one is wrong, say so in the
PR text with evidence. Two facts to keep in mind from the planning rounds:

- `mobile-production-build.yml` currently fails at setup (`version: 10` vs
  `packageManager: pnpm@10.11.0` makes the pinned `pnpm/action-setup` throw).
- A Zod `.refine` is skipped when the base object is invalid, so form tests must
  supply every base field (plan appendix B).

## Verification (planned vs run)

Commands and timings that were **run** in the plan session on `3c40e0b0` (Node
24): install 13 s; `pnpm --filter mobile typecheck`; `pnpm --filter mobile test`
(26 pass); `pnpm --filter mobile test:components` (4 pass); `pnpm db:generate` +
`turbo run build --filter='api^...'`; `cd apps/api && pnpm exec vitest run` on
the create-order / customer-auth / checkout-upload-limits specs (127 pass);
`pnpm --filter api typecheck` (~8 s);
`cd apps/web && pnpm exec vitest run
app/.well-known` (6 pass).

**Planned, not yet run** (report "not run" honestly if you cannot): `pnpm lint`,
`test:cov` for touched packages, `pnpm --filter api test:e2e` and the new e2e
specs (need Postgres, Redis, MinIO via `scripts/ci/e2e.sh`),
`generate:swagger-metadata` + `generate:openapi` + Orval +
`scripts/ci/check-openapi-drift.sh` + `scripts/ci/check-types-sdk-drift.sh`,
actionlint (`brew install actionlint` on a Mac) and
`shellcheck scripts/ci/*.sh`, `caddy validate` on a stubbed copy, any
emulator/EAS/GitHub workflow run. Never claim a test passed unless you ran it.

## Acceptance criteria

Plan section 9, criteria 1-22. A PR's description lists which criteria it closes
and which it does not.

## Constraints and blockers (do-not-change list; when to stop and ask)

- Do not touch `.github/workflows/mobile-release.yml`, the shared validation
  schema (web uses it), the assisted-order idempotency path, or any DB schema.
  No new migration.
- Do not run the GitHub admin steps (creating `mobile-staging` /
  `mobile-production` environments, protecting `mobile-release`): that is Q2, a
  repo admin's job. PR 2a must not merge before it.
- **Stop and ask before** starting PR 6b-erase (needs Q8: retention policy and
  legal basis; default if the owner says "use defaults": erase eligible
  `Customer` rows, keep order snapshots, keep order links live, document it) and
  the `app.json` part of PR 2b (needs Q7: confirmation that only exempt
  encryption is used; **no default**).
- PR 6b-race is the highest-uncertainty item: three review rounds kept finding
  new lock-order problems. Before coding it, write a short table of every writer
  of `BuyerAccount`, `Order.buyerAccountId`, `Address`, `CustomerStoreLink` and
  `Customer` with the lock each takes, get it reviewed, and prove the design
  with the e2e. It merges only with a green CI `E2E (API)` job. If you cannot do
  that, ship 6a-i, 6a-ii and 6c and leave 6b to a follow-up issue.
- Release-order rules (not merge order): PR 8 deploys before any mobile build
  containing 5a; PR 3a before any build containing 4b; the owner confirms Q10
  (no mobile build with this code reached users) before those builds are cut.
- Other defaults you may use without asking: Q1 (OTA stays inactive: no
  `expo-updates`, add the guard script), Q3 (no index migration), Q6 (verify
  Maestro env support in PR 1, else keep `--env`), Q9 (`beta` uses `preview`).
- If `main` changed the facts in plan section 2, or a design in section 4 turns
  out wrong when you read the code, stop and report instead of improvising.

## Stack base policy

Bases are in the table above. Stacked PRs (3b, 4b, 5b, 6a-ii, 6b-race, 6b-erase,
2a) are opened with the previous PR's branch as base so the diff is only the
slice; after the base merges, retarget with `gh pr edit <n> --base main` and
rebase. Never push to a branch you did not create. `ci.yml` runs on
`pull_request` without a `branches:` filter, so stacked PRs get CI; check which
jobs run per path filter (workflow-only PRs run only Hygiene and `ci-success`).

## PR instructions

Open the PRs in the order above, one per slice, with the repo's PR format (see
recent merged PRs for the title/body style and linked issues). Do not use
`Closes` for issue #186 (deep linking) or any issue whose acceptance is not met.
State in each PR: what was run and its result, what was not run, the criteria
closed, residual risks, and the deploy/release-order rule if relevant. Do not
merge. No tooling/skill PR is needed first. Open the follow-up issues from plan
section 10 when the PR that relates to them is opened (title + short body +
link), except those the plan marks as unrelated. End each commit message with
the attribution lines your session instructs.

## First action

1. `git status` (report anything not yours; never stash/reset it),
   `git fetch origin
   main`, create a fresh branch off `origin/main` (not from
   the current checkout branch).
2. Read `CLAUDE.md`, the plan (sections 2, 4, 6, 8, 9, 12), and `review-log.md`.
3. Run the section 8 prerequisite commands once to confirm your environment
   matches the timings.
4. Start PR 1.
