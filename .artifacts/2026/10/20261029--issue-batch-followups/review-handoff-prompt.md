# Review handoff: issue-batch follow-up PRs (review, fix, merge, close)

Use the `pr-review` skill (`.claude/skills/pr-review`) for the review phases.
This handoff records an explicit, durable authorization from the user for THIS
batch (their words in the planning request: the review session "fixes and posts
comments, then merges autonomously, and then closes issues autonomously"). That
authorization covers: pushing fixes to these PR branches, posting review
comments, merging the PRs listed below, and closing the listed issues. It does
NOT cover anything in "Not authorized" below. The pr-review skill's "wait for
human approval before posting" step is waived for this batch only.

## What to review

PR numbers (filled in by the implementer at the end of their session):

- PR 1 `chore/pin-orval-sdk-drift`: #428 (#338 #375)
- PR 2 `fix/checkout-upload-limits`: #429 (#391)
- PR 3 `chore/web-test-next-image`: #430 (#341)
- PR 4 `chore/codacy-exclude-migrations`: #431 (#342)
- PR 5 `refactor/order-ref-six-chars`: #432 (#339)
- PR 6 `fix/hide-imageless-products-home`: #433 (#356)
- PR 7 `fix/invite-server-preconditions`: #434 (#378)
- PR 8 `security/google-login-no-email-link`: #435 (#377 #376)
- PR 9 `fix/product-image-cap-dto`: #436 (#335, base PR 1)
- PR 10 `chore/drop-buyer-account-id-seller`: #437 (#379, base PR 9)
- PR 11 `fix/caddy-redact-token-logs`: #438 (#340, DRAFT)
- PR 12 `feat/assisted-order-idempotency-api`: #439 (#336)
- PR 13 `feat/assisted-order-idempotency-web`: #441 (#336, base PR 12)
- PR 14 `chore/epic-255-followups`: #442 (#380)

Some PRs may be absent (Tier C is cut first); `implementation-log.md` says
which. Review each stacked PR against its own base first, read its CI run, then
re-check after rebasing onto current `main`.

## Source of truth

`.artifacts/2026/10/20261029--issue-batch-followups/plan.md`, `review-log.md`,
`handoff-prompt.md`, `implementation-log.md`, `follow-up-issues.md`. Write
review notes in a new folder under `.artifacts/` per its `AGENTS.md`; verify
claims by running code, not by reading.

## Preconditions

1. `gh auth status`; for each login run
   `GH_TOKEN=$(gh auth token --user <login>) gh api repos/bobadilla-tech/biasmarket.com --jq .permissions`.
   Use a login with `push: true` (per command via `GH_TOKEN`, never
   `gh auth switch`); ask the user which login if unclear. The globally active
   login at planning time (`eliaz-hireoverseas`) was read-only. Stop if no login
   can push/merge.
2. Branch ruleset (verified at planning time): `main` requires only the status
   check `CI Success`; no required approvals. So merge is technically possible
   without a human; the rules below are the only guard.

## Review checklist (from the plan's acceptance criteria and risks)

1. **PR 1:** lockfile diff touches only orval entries; `generate` leaves
   `git status` empty (run it); drift script passes and fails after touching a
   generated file; `types` filter includes `apps/api/openapi.json` and the
   script; no `.github/dependabot.yml`; `pnpm check:workspaces` and shellcheck
   pass.
2. **PR 2:** realistic 20-item cart passes, 6 MB -> 413, 1000 fields -> 400; no
   `@ArrayMaxSize` on items; spec modelled on
   `payment-proof-upload-limits.spec.ts`.
3. **PR 3:** full web suite green; `next.config.ts` untouched; `src` passed
   through.
4. **PR 4:** `.codacy.yml` content only.
5. **PR 5:** one `orderRef` (6 chars); run the D4 grep; all pinned tests
   updated; utils built before tests.
6. **PR 6:** `images: { isEmpty: false }` only without `storeSlug`; counts
   consistent; no OpenAPI change.
7. **PR 7:** ineligible orders create no row, 204 either way; dedicated
   `loadForInvite`; CLICKED dedupe; e2e fixtures have a counting payment.
8. **PR 8:** no email-link path remains; dead ambiguity code removed; checkout-
   created-account scenario is a test; `google-link-skipped` logs ids only; hint
   copy es/en; the G+A checkout behavior documented.
9. **PR 9/10:** SDK regenerated cleanly; `maxItems` present; `buyerAccountId`
   gone from seller/assisted/checkout responses and 5 SDK interfaces, kept
   internally and in Address; e2e absence assertions.
10. **PR 11 (draft):** `caddy validate` (run it), local curl check incl. Referer
    and upstream-down case; placement per plan D5; image pin; docs; human
    checklist in the body. Do not merge or close #340.
11. **PR 12/13:** CORS header allowed (test), typed exception + filter branch,
    pre-tx lookup, defensive P2002, migration passes
    `check-destructive-migrations.sh` (no forbidden words in comments),
    old-INSERT check, race e2e N>=5 with DB-count assertions, tenant scoping by
    `storeId` AND `userId`; web: key stable per mount, reset after success/edit,
    replay handled.
12. **PR 14:** each implemented item has a test; unimplemented items listed.
13. All PRs: no unrelated files (`git diff --name-only <base>...HEAD` against
    the plan's file list), Prettier clean, CI green, no `pull_request_target`,
    `permissions` untouched, no changes to `cd.yml`, `mobile-release.yml`,
    `infra/vps/*` (except PR 11).

## Fix, post, merge, close protocol (authorized)

- Fix defects you find directly on the PR branch (small commits; run the scoped
  checks), post the review comments, then re-review until clean.
- Merge only when: `CI Success` is green on the PR's current head (re-run after
  any base change or force-push), the review is clean, and all earlier PRs it
  depends on are merged. Merge method: squash (the recent CI PRs #416-#422 were
  squash merges; older ones were merge commits; if the repo setting forbids
  squash, use what it allows and adapt the rebase step). After a squash of a
  base PR, rebase every stacked PR with
  `git rebase --onto origin/main <old-base-tip> <branch>` (PR 9 after PR 1, PR
  10 after PR 9, PR 13 after PR 12, PR 14 if it was stacked on PR 10) and
  force-push with lease; rebase PR 12 onto `main` after PR 10 merges. Base of PR
  14: see `implementation-log.md`. Never merge with a red or stale-green check;
  never use admin override or `--force` on `main`.
- Order: 1, then Tier A (2-6), then 7, 8, then 9 and 10 (stacked: after PR 1
  merges, `git rebase --onto origin/main <old-base-tip> <branch>`, force-push
  with lease, wait for fresh CI), then 12, wait for its deploy to finish, then
  13, then 14. Merge in small groups and wait for each `main` CI/CD run to
  finish green before the next group (`ci.yml` cancels earlier runs; the last
  SHA carries all deploys). Keep the migration PR (12) in its own deploy. If
  `main` goes red (hygiene, coverage, CD), stop merging, fix or revert the last
  PR, and report.
- Close issues after their PR merges, with a closing comment naming the PR and
  any caveat: #338 #375 (PR 1; note the 8.43 upgrade is deliberately deferred
  and #375's missing-DTO claim was stale), #391, #341, #342 (comment: verify on
  the next migration PR), #339, #356 (comment: marking the test store `isDemo`
  is a human data step), #378, #377 and #376 (comment: change-email token
  binding and a safe merge flow tracked in the new follow-up issue), #335, #379,
  #336 (after PR 13).
- If PR 13 was not opened (Tier C cut), leave #336 open with a comment saying
  the API half merged (PR 12) and the web half is pending.
- #380: create the follow-up issues from `follow-up-issues.md`
  (`gh issue create`), then close #380 with a comment linking them and PR 14.
- Final report to the user: merged/closed list, anything not done and why, human
  tasks pending (PR 11 checklist, #356 data step, #342 verification, manual
  device checks).

## Not authorized

Merging or closing PR 11 / #340 (a human merges it alone and recreates the caddy
container); any VPS or production database action; `isDemo` data changes;
editing `main` directly; changing branch protection; deleting branches of
unmerged PRs; posting from a login other than the one confirmed in
Preconditions.

## Known risks to confirm

A red coverage floor or `hygiene` on a `main` push blocks CD; migration PR 12
and the Caddy PR must deploy alone; stacked PR bases after squash merges; web
before API for #336 would break creates (hence PR 12 before 13); #339 changes
visible `#XXXX` to `#XXXXXX`; #377 gives Google-first buyers a new empty account
by design.
