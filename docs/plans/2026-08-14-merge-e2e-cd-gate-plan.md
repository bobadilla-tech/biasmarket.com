# Run existing E2E tests after merge and gate CD

## Status

Planning only. This document describes the implementation to make; it does not
add the workflow or change deployment behavior by itself.

## Context

The repository already has a substantial API E2E suite, but CI currently runs
only lint, typecheck, build, and unit tests. The API package exposes
`pnpm --filter api test:e2e`, which discovers the 22 files under
`apps/api/test/**/*.e2e-spec.ts`. The suite boots the real Nest `AppModule`,
uses a real PostgreSQL database, talks to Redis through BullMQ, uploads against
MinIO, and reads verification emails written by the workers' file mailer.
The Vitest E2E config intentionally runs files serially because the tests
create users against better-auth's shared rate limiter.

The other applications do not currently have E2E suites:

| App | Existing test coverage found | Plan |
| --- | --- | --- |
| `apps/api` | 22 E2E spec files, 66 `it`/`test` cases, real `AppModule` | Run the existing full suite |
| `apps/web` | One Vitest/jsdom test file; no Playwright/Cypress/browser E2E config | Do not invent or add E2E tests |
| `apps/workers` | Unit tests only; no `*.e2e-spec.ts` suite | Do not invent or add E2E tests |
| `apps/sanity` | No E2E suite | Do not invent or add E2E tests |

The E2E job must run for the commit that lands on `main`, not for every commit
or update of a pull request. CD must not build or deploy until the E2E suite
has passed for that same landed commit.

## Goals and non-goals

### Goals

1. Run every existing API E2E spec on a successful push to `main`.
2. Keep E2E out of pull-request CI, so updates to a PR do not pay the full
   real-service test cost.
3. Make the E2E result part of the existing CI success gate.
4. Preserve the existing `workflow_run` CD security model and make CD depend on
   the CI run whose conclusion includes E2E success.
5. Run against an isolated, disposable environment with no production
   credentials or data.
6. Produce enough diagnostics to distinguish application failures from service
   startup, migration, queue, or storage failures.

### Non-goals

- Do not create a browser E2E suite for `apps/web`.
- Do not create E2E suites for `apps/workers` or `apps/sanity`.
- Do not run the API E2E suite on pull requests.
- Do not run E2E against the production VPS, production database, production
  Redis, production MinIO, or production mail provider.
- Do not broaden this work into new product-flow coverage; existing tests are
  the scope.
- Do not make CD deploy a different SHA than the SHA tested by CI.

## Proposed workflow design

### 1. Keep one CI workflow, but make the E2E job push-only

Add a named `e2e` job to `.github/workflows/ci.yml` with a condition equivalent
to:

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

The existing workflow already listens to both pull requests and pushes to
`main`. The condition means:

```text
PR commit/update  -> normal CI only -> no E2E
merge creates push -> normal CI + API E2E -> CI Success
```

This avoids a second workflow and keeps the existing CD trigger chain intact.
The push trigger is the post-merge event in this repository. Enforce protected
`main` with no direct pushes so that “push to main” means a merged change in
normal operation. Document that direct pushes, if an administrator bypasses
branch protection, also run the same safety checks.

The existing `paths-ignore` behavior remains: documentation-only changes do
not start CI and therefore do not start CD. If the team later requires every
merge, including docs-only merges, to run E2E and CD, remove that ignore rule as
a separate decision because it changes the repository's current deployment
policy.

### 2. Make the existing CI Success job require E2E on pushes

Add `e2e` to `ci-success.needs`. Keep `if: always()` so the terminal gate can
inspect upstream outcomes, then make its validation explicit:

- `detect-changes` must be `success`.
- Every conditional package job may be `success` or `skipped`; `failure`,
  `cancelled`, and unexpected results fail the gate.
- On a pull request, `e2e == skipped` is expected and accepted.
- On a push to `main`, `e2e` must be `success`; `skipped`, `failure`, or
  `cancelled` fails `CI Success`.

This also closes the existing weakness where the gate checks only `failure`
for package jobs and could miss a cancellation or an upstream detection
failure. `CI Success` remains the single required status for branch
protection, while the E2E job remains visible as its own check for diagnosis.

### 3. Leave CD triggered by successful CI, but make the dependency explicit

Keep `.github/workflows/cd.yml` on:

```yaml
on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]
```

Its existing gate already limits CD to a successful push run on the repository's
`main` branch and rejects fork-derived workflow runs. After the CI Success gate
includes the push-only E2E job, `workflow_run.conclusion == success` means all
required checks, including E2E, passed before `build-push` or
`sync-and-deploy` can start.

Keep the SHA pinning already present in CD: every checkout and image tag must
use `github.event.workflow_run.head_sha` (passed through the gate output), not
the default branch tip. Retain the existing staleness guard and deployment
concurrency controls so a late result for an older commit cannot deploy over a
newer commit.

Update stale comments in `cd.yml` that describe CI as excluding E2E, and link
back to this plan for the merge-only E2E policy. Do not weaken the existing
`event == 'push'`, same-repository, and `head_branch == 'main'` checks.

## API E2E job implementation

### 4. Reproduce the real dependencies in an isolated runner

The job should use the same Node and pnpm versions already defined in CI:
Node 26 and pnpm 10.11.0. Install with
`pnpm install --frozen-lockfile`.

Provide disposable services only:

- PostgreSQL service on the runner, with a fresh `ci` database and
  `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci?schema=public`.
- Redis service on the runner, with `REDIS_URL` pointing to that service.
- MinIO started as a temporary Docker container on localhost, using test-only
  access credentials. Create the `products`, `logos`, and `payments` buckets;
  apply public download policy only to `products` and `logos`, matching local
  behavior. Keep `payments` private.
- The `workers` package built and started locally in the background with
  `MAIL_DRIVER=file`, `REDIS_URL`, and a local `INTERNAL_API_URL`. It is needed
  because API tests enqueue verification/reset emails and then read the files
  produced by the mailer worker. The worker must write to the checked-out
  `apps/workers/.mailer-dev` directory that the test process reads.

Prefer GitHub Actions service containers for PostgreSQL and Redis and a small
explicit MinIO container/setup step over starting the complete development
Compose stack. The development Compose stack builds and starts the API and web
watchers, which is unnecessary for this API-level suite and would add startup
time and unrelated failure modes.

### 5. Set safe test-only environment values

Set all boot-required API variables explicitly in the job. Values may be
deterministic test literals because the runner is disposable, but must never be
production values or GitHub secrets. The set should include:

```text
DATABASE_URL
REDIS_URL
BETTER_AUTH_SECRET
BETTER_AUTH_URL=http://localhost:3000
CUSTOMER_ACCOUNT_TOKEN_SECRET
WEB_URL=http://localhost:3001
INTERNAL_JOBS_SECRET
MONITORING_WEBHOOK_SECRET
SITEMAP_INTERNAL_TOKEN
S3_ENDPOINT=http://127.0.0.1:9000
S3_PUBLIC_URL=http://127.0.0.1:9000
S3_ACCESS_KEY
S3_SECRET_KEY
S3_BUCKET=products
S3_LOGO_BUCKET=logos
S3_PAYMENT_BUCKET=payments
```

Set worker variables separately as needed, including `PORT`, `MAIL_DRIVER=file`,
`REDIS_URL`, `INTERNAL_API_URL`, and `INTERNAL_JOBS_SECRET`. Do not set
`MAIL_DRIVER=resend`, `RESEND_API_KEY`, or any production S3/Redis/database
credential.

### 6. Prepare and run the existing suite

The ordered job steps should be:

1. Check out the exact push SHA used by the CI run. For a job inside the same
   CI workflow, `github.sha` is the tested commit. Keep `persist-credentials:
   false`.
2. Set up Node and pnpm and install the frozen lockfile.
3. Wait for PostgreSQL, Redis, and MinIO health; fail with a service-specific
   message if readiness times out.
4. Run Prisma client generation:
   `pnpm --filter @biasmarket/db run db:generate`.
5. Apply migrations to the empty test database with
   `pnpm --filter @biasmarket/db exec prisma migrate deploy`.
6. Build the queue package and workers, then start the workers' production
   entrypoint in the background. Wait for its health endpoint or a successful
   process boot before running tests.
7. Run the existing command unchanged:
   `pnpm --filter api test:e2e`.

Do not add `--runInBand`-style flags or override the existing Vitest config;
`apps/api/vitest.config.e2e.ts` already disables file parallelism for the
better-auth limiter. Do not run the suite once per package or split it into
parallel jobs unless the suite is later made data- and rate-limit-isolated.

### 7. Make background-process cleanup and diagnostics reliable

Run the worker and MinIO under a shell trap so they are stopped on success,
failure, or cancellation. Capture the worker log, MinIO setup log, migration
output, and test output. On failure, upload a short-lived private artifact
containing logs and the Vitest report. Do not upload the mailer directory: it
contains verification and password-reset links, even though they are test
values.

The job should have an explicit timeout sized for the current serial suite,
with a documented starting value (for example 30 minutes) and a follow-up
measurement after the first few main pushes. A timeout is a failed E2E gate,
not a warning or an automatic deploy bypass.

## CD and security invariants

The implementation must preserve these invariants:

- PR workflows never receive production deployment secrets and never run this
  real-service E2E job.
- Only a successful `CI` `workflow_run` from a push to this repository's
  protected `main` can enter CD.
- The CD workflow checks out and deploys the exact SHA that CI tested.
- E2E uses only disposable local services and test credentials.
- A failed, cancelled, or timed-out E2E run prevents `CI Success` from passing
  for the push, so the CD `workflow_run` gate does not deploy.
- A newer push may supersede an older in-progress CI run through the existing
  CI concurrency group; only the newest successful tested SHA should proceed
  to CD.
- Existing CD `build-push`, image tags, native ARM runner choice, staleness
  guard, SSH setup, deployment environment, and non-cancelling deploy
  concurrency remain unchanged except for comments and the dependency proof.

## Files expected to change during implementation

- `.github/workflows/ci.yml` — add the push-only API E2E job and make
  `ci-success` validate all outcomes, including E2E.
- `.github/workflows/cd.yml` — update comments/documentation only unless
  implementation verification finds that an additional explicit dependency
  assertion is needed; do not remove the current security gates.
- `docs/core/deploy.md` or the relevant CI/CD runbook — document that merges to
  protected `main` run E2E before CD and that PR updates do not.
- Optionally a small committed CI helper script under `scripts/` if the
  service bootstrap/cleanup shell becomes too large or hard to test inline.
- This plan document — append execution notes and measured runtime after the
  implementation lands.

No application source, existing E2E spec, package test script, or new browser
test file should be changed unless the current suite cannot run in a clean
runner and the failure is a genuine test-environment defect. Any such fix must
be separately called out with its severity and rationale.

## Verification and rollout

1. Reproduce the complete E2E bootstrap locally with the same environment
   contract, including a clean database, MinIO buckets, Redis, and workers.
2. Validate YAML syntax and inspect Actions expressions, especially the
   push-only condition and `ci-success` handling of `success`, `skipped`,
   `failure`, and `cancelled`.
3. Open a test PR and update it several times: confirm normal CI runs and E2E
   does not.
4. Merge the test PR: confirm exactly one E2E run starts for the resulting
   `main` SHA, all 22 API spec files run, and `CI Success` waits for it.
5. Force a controlled E2E failure on a non-production test branch/commit:
   confirm `CI Success` fails and CD does not build, push, SSH, or deploy.
6. Restore the test and merge a passing commit: confirm CD starts only after
   the successful CI run, and that its checkout/image tags equal the tested
   merge SHA.
7. Verify a rapid pair of pushes: an older cancelled/superseded CI run must
   not deploy, while the newest successful SHA may deploy.
8. Verify branch protection requires `CI Success` and disallows direct pushes
   to `main` for normal contributors.
9. Append actual run duration, runner/service assumptions, and any deviations
   to this document after rollout.

## Review findings and iteration log

Findings are classified as follows: **high** blocks the requested merge/CD
guarantee or creates a security/data-loss risk; **medium** can cause a likely
failure, flake, or operational blind spot; **low** is clarity, maintainability,
or non-blocking polish.

### Initial repository review

- **High:** CD currently follows successful CI, but CI has no E2E job. Adding an
  independent post-merge E2E workflow without changing CD would leave a race
  where CD could deploy first. Resolution: put push-only E2E inside CI and make
  `ci-success` require it before the existing CD `workflow_run` can pass.
- **High:** The current terminal gate only tests for `failure` and does not
  explicitly reject cancellation or detection failure. Resolution: validate
  exact allowed results and require `detect-changes == success`.
- **High:** The API suite depends on more than PostgreSQL; Redis, MinIO, and a
  running workers mailer are required. Resolution: model all four disposable
  dependencies in the job and wait for readiness.
- **Medium:** `apps/api/vitest.config.e2e.ts` disables file parallelism because
  of better-auth's shared limiter. Resolution: run the existing command and
  preserve serial execution rather than parallelizing files for speed.
- **Medium:** The suite reads files written under
  `apps/workers/.mailer-dev`; a containerized worker with no shared workspace
  would make verification-email tests time out. Resolution: run workers in the
  runner or explicitly share that directory.
- **Medium:** Existing CI paths-ignore rules mean docs-only pushes do not run
  CI/E2E/CD. Resolution: document this as current policy instead of silently
  claiming every possible merge is covered.
- **Low:** There are no browser E2E tests for web and no E2E suites for workers
  or sanity. Resolution: inventory and explicitly leave them out per scope.

### Subagent review rounds

Subagents must review this draft after it is written. Each round must record
findings under this section using the high/medium/low classification, apply
corrections to the plan, and run another review until a round reports no
actionable findings. The final round must state “no actionable findings” and
include the agent names/roles and the reviewed revision.

