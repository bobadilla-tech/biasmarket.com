# Implementation handoff: close 15 follow-up issues as 14 PRs

## Mission

Implement the reviewed plan at
`.artifacts/2026/10/20261029--issue-batch-followups/plan.md` (read it fully
first; it is the source of truth, `review-log.md` lists what reviewers found).
Open the PRs in the plan's priority order. **Do not merge anything** and do not
touch production, the VPS, or production data. A later review session reviews,
fixes, merges and closes the issues.

Issues covered: #338 #375 (PR 1), #391 (2), #341 (3), #342 (4), #339 (5), #356
(6), #378 (7), #377 #376 (8), #335 (9), #379 (10), #340 (11, draft), #336 (12
API, 13 web), #380 subset (14).

## Context

- Repo `bobadilla-tech/biasmarket.com`, pnpm monorepo, read `CLAUDE.md` and
  `apps/web/AGENTS.md` first (hard rules: pnpm only, ESM with `.js` imports in
  `apps/api`, web never imports `packages/db`, every tenant query filters by
  `storeId` and mutations verify ownership).
- Base is `origin/main` (was `010f43d8` at planning time). The user's checkout
  `main` may be behind; run `git fetch origin` and branch from `origin/main`.
  Run `git status` first; if the tree is dirty, report it and work in a worktree
  (`git worktree add ../bm-<slug> -b <branch> origin/main`); never stash/reset
  someone's changes.
- CI runs on PRs with any base (no branch filter), so stacked PRs get CI.
- Probe results already in the plan (do not redo): Orval 8.23.0 + prettier gives
  a zero-diff `generate`; 8.43.0 renames ~49 call sites; both "missing DTO"
  claims of #375 are stale; Caddy has no access log today; `BuyerAccount.email`
  is not unique.

## Decisions already made

- **#377 (human decision):** Google login never auto-links by email. Resolve by
  `googleSub` only, otherwise create a new account; remove the email-merge path
  and dead ambiguity code; log `google-link-skipped` (ids only); static hint
  copy. No migration. Change-email token binding is NOT in scope (follow-up
  candidate).
- Defaults (plan section 10): imageless products hidden marketplace-wide (#356);
  `recordInvite` "never rejected" = current `paymentStatus`; assisted-order
  replay = 409 without link, typed exception + filter branch, no token rotation;
  #339 = 6 characters; #338 = exact pin of orval 8.23.0, no upgrade; #340 =
  redacted access logs, PR is a draft; #380 = safe subset only.

## Reviewed plan (ordered)

Follow plan sections 2 (design per issue), 4 (PR table) and 5 (steps). Summary:

| PR | Branch                                | Base                                                                     |
| -- | ------------------------------------- | ------------------------------------------------------------------------ |
| 1  | `chore/pin-orval-sdk-drift`           | main                                                                     |
| 2  | `fix/checkout-upload-limits`          | main                                                                     |
| 3  | `chore/web-test-next-image`           | main                                                                     |
| 4  | `chore/codacy-exclude-migrations`     | main                                                                     |
| 5  | `refactor/order-ref-six-chars`        | main                                                                     |
| 6  | `fix/hide-imageless-products-home`    | main                                                                     |
| 7  | `fix/invite-server-preconditions`     | main                                                                     |
| 8  | `security/google-login-no-email-link` | main                                                                     |
| 9  | `fix/product-image-cap-dto`           | `chore/pin-orval-sdk-drift`                                              |
| 10 | `chore/drop-buyer-account-id-seller`  | `fix/product-image-cap-dto`                                              |
| 11 | `fix/caddy-redact-token-logs` (DRAFT) | main                                                                     |
| 12 | `feat/assisted-order-idempotency-api` | main                                                                     |
| 13 | `feat/assisted-order-idempotency-web` | `feat/assisted-order-idempotency-api`                                    |
| 14 | `chore/epic-255-followups`            | main (or `chore/drop-buyer-account-id-seller` if it regenerates the SDK) |

Tiers: A = 1-6, B = 7-10, C = 11-14. After Tier B write a checkpoint line in
`implementation-log.md`; if Tier C does not fit, stop and report (cut order 14,
then 13, then 11; plan section 4). Say what was not done and why. Per PR:
failing test first where applicable, implement, run the scoped commands,
`pnpm fix`, commit, push, open PR, record the number.

## Review findings to preserve (do not regress)

- D12 needs CORS `allowedHeaders` += `Idempotency-Key` (`apps/api/src/main.ts`),
  a typed exception + `AllExceptionsFilter` branch (the plain filter drops extra
  fields), a pre-transaction replay lookup, defensive `P2002` matching, and the
  web must keep the key stable per mount and reset it after success/edit. Race
  tests are e2e only, N>=5 rounds, DB-count assertions.
- #377: the cheap `passwordHash` predicate was rejected; do not reintroduce
  email-linking. #376 log: ids only; one `findFirst` only on the create path.
- D1: `pnpm install --lockfile-only`, lockfile diff only orval entries; do not
  create `.github/dependabot.yml`; `pnpm exec prettier`; delete
  `generated/index.ts`.
- Every PR that regenerates the SDK is stacked on PR 1; PR 12 never regenerates
  (no `@ApiHeader`). PR 13 uses a raw fetch with the 409 body (like
  `orders.api.ts`), not the generated client, and does not touch
  `packages/types`.
- D5: image pin only if the human supplies the tag (default: leave
  `caddy:2-alpine`); the global default log goes INSIDE the existing global
  options block; the Caddy change enables access logging (disclose); snippet
  top-level, `import redact_log` at site level; also configure the global
  default log (reverse_proxy error logs carry the URI); verify with upstream
  stopped; human checklist in the PR body (merge alone, recreate the caddy
  container, bind-mount inode caveat, pin the tag the VPS runs).
- D9 uses a dedicated `loadForInvite`; D10 lists every `toOrderDto` caller and
  the 5 generated interfaces (Address stays); D4 grep acceptance and the
  test-pin list.
- Migration SQL must not contain `drop`/`alter column ... type` even in
  comments.

## Verification (planned; label every claim as run or not run)

See plan section 7. Key commands:
`pnpm turbo run lint typecheck test:cov
--filter=<pkg>`,
`pnpm --filter @biasmarket/utils build` before api/web tests that use it,
`scripts/ci/e2e.sh` (Docker) for api e2e or label specs "CI-verified only",
`bash scripts/ci/check-types-sdk-drift.sh` (after PR 1),
`bash scripts/ci/check-openapi-drift.sh` (needs the e2e env vars from
`scripts/ci/e2e.env.example` and an api build), `pnpm check:workspaces`,
`shellcheck scripts/ci/*.sh`, `bash scripts/ci/check-destructive-migrations.sh`
for PR 12. Never write "passed" unless you ran it in this session.

## Acceptance criteria

Plan section 9 (14 criteria, each issue maps to at least one).

## Constraints and blockers

- **GitHub account precondition:** the globally active `gh` login may be
  read-only. Run `gh auth status`, then for each login
  `GH_TOKEN=$(gh auth token --user <login>) gh api repos/bobadilla-tech/biasmarket.com --jq .permissions`;
  use only a login with `push: true`, per command via `GH_TOKEN` (never
  `gh auth switch`), and ask the user which login to use if unclear. Stop if
  none can push.
- Do-not-change list: `infra/vps/*` except PR 11, `.github/workflows/cd.yml`,
  `mobile-release.yml`, `packageManager` pin, any production data, any deploy.
- Stop and ask if: a probe contradicts the plan (e.g. `Order` has no usable
  creator column, `BuyerAccount.email` turns out unique, orval 8.23.0 pin
  changes the lockfile beyond orval entries), a PR needs a scope the plan lists
  as a non-goal, or the working tree is dirty with unrelated work.
- Unconfirmed decisions with defaults: none open; all defaults in plan
  section 10.
- Prod data step for #356 (marking @carlos as `isDemo`) and the VPS steps for
  #340 are human tasks; put them in PR bodies, never run them.

## Stack base policy

PRs 9->1 base and 10->9, and 13->12, are stacked on their previous branch; every
other PR targets `main`. Never push to `main` or to another PR's branch. If a
base is merged first, retarget with `gh pr edit <n> --base main` and
`git rebase --onto origin/main <old-base-tip> <branch>`, then force-push with
`--force-with-lease` (a base change alone does not rerun CI; the push does).

## PR instructions

Open in table order, each with the repo PR format (summary, what changed, how
verified with run/not-run labels, risks, issue refs per plan section 4). End PR
bodies with the attribution line from the session's system reminder. PR 11 is
`--draft`. Do not merge. After the last PR: fill in the PR numbers in
`review-handoff-prompt.md`, write `implementation-log.md` and
`follow-up-issues.md` (drafts: release-claim feature + claim notification;
manual device checks; change-email token binding +
case-insensitive/pending-aware clash check; safe same-email merge flow) in this
folder, and leave them untracked.

## First action

Read `plan.md`, `review-log.md`, `CLAUDE.md`, `apps/web/AGENTS.md`,
`docs/core/ci.md`, `docs/core/blue-green-migrations.md`; run `git status`,
`git fetch origin`, the GitHub-account precondition; confirm the base SHA; start
with PR 1.
