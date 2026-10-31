# Run the API E2E suite on pull requests

Status: implemented. Supersedes goal 2 ("do not run E2E on pull requests") of
`2026-08-28-e2e-ci-merge-gate-cd-block-plan.md`; everything else in that plan
(push-to-main gate, CD block, fail-closed `ci-success`) is unchanged.

## Why

The API E2E job (`ci.yml` → `e2e`, "E2E (API)") only ran after merge, on push to
`main`. On PRs it was `skipped`, and `CI Success` accepted that as green — so a
PR touching auth/checkout flows could merge with its own new E2E spec never
having executed, and breakage surfaced only on `main`, where it blocks CD for
everyone. That happened with the merge of #206: three latent E2E bugs landed and
turned `main` red.

The original reason for keeping E2E off PRs was cost. The repo is public, so
GitHub-hosted standard runner minutes are free, and the job (~2.5 min) has no
`needs` and runs in parallel with the per-package jobs, so PR wall-clock is
essentially unchanged.

## Change

- `ci.yml` `e2e.if`: add `github.event_name == 'pull_request'`.
- `scripts/ci/check-ci-success.sh`: on `pull_request`, `e2e` must be `success`
  (as on `push`). `workflow_dispatch` keeps the `run_e2e` input; any other event
  still requires `skipped` (fails closed).
- CD is unaffected: `cd.yml` only acts on `workflow_run` events from `push` runs
  on `main`, so a PR's E2E result never deploys anything.
- Fork PRs: the job only uses the committed test-only env
  (`scripts/ci/e2e.env.example`) and `GITHUB_TOKEN` with `packages: read` for
  public GHCR sidecar images — no repository secrets — so it works on forks.

## E2E fixes shipped alongside (red `main` after #206)

- `seller-bearer-auth`: `GET /stores/:id/products` returns a plain array; the
  spec read `body.data`.
- `customer-account-auth` (bearer test):
  - `runId` repeated the `caa-bearer-` prefix, pushing the customer email's
    local part to 67 chars (> RFC 5321's 64) → checkout `@IsEmail` 400.
  - Mailer snapshot was taken _after_ checkout, racing the worker writing the
    verification email → intermittent "Timed out waiting for verification
    email".
  - Cleanup never removed the buyer's `Customer`/`BuyerAccount` rows before
    deleting the store (FK violation); now calls `cleanupBuyerTestData`.
  - The test boots a second `AppModule` and runs ~5.5s; given a 30s timeout
    instead of vitest's 5s default.
