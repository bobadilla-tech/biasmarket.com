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
MinIO, and reads verification emails written by the workers' file mailer. The
Vitest E2E config intentionally runs files serially because the tests create
users against better-auth's shared rate limiter.

The other applications do not currently have E2E suites:

| App            | Existing test coverage found                                         | Plan                           |
| -------------- | -------------------------------------------------------------------- | ------------------------------ |
| `apps/api`     | 22 E2E spec files, 66 `it`/`test` cases, real `AppModule`            | Run the existing full suite    |
| `apps/web`     | One Vitest/jsdom test file; no Playwright/Cypress/browser E2E config | Do not invent or add E2E tests |
| `apps/workers` | Unit tests only; no `*.e2e-spec.ts` suite                            | Do not invent or add E2E tests |
| `apps/sanity`  | No E2E suite                                                         | Do not invent or add E2E tests |

The E2E job must run for the commit that lands on `main`, not for every commit
or update of a pull request. CD must not build or deploy until the E2E suite has
passed for that same landed commit.

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
`main` with pull-request-only merges and no direct pushes so that “push to main”
means a merged change. Configure `enforce_admins: true`, no bypass actors,
required approvals/status checks, and no emergency exception; this deployment
gate must not be bypassable by administrators or any other actor.

Remove the current `paths-ignore` entries from the `pull_request` and `push`
triggers. A skipped workflow can leave a required `CI Success` check pending on
a docs-only pull request, and the literal merge policy should not silently
exclude documentation merges. Docs-only pull requests still run normal CI but do
not run E2E; the resulting push to protected `main` runs the push-only E2E job
and therefore follows the same CD gate. This is more predictable than
maintaining a hidden docs-only exception.

Add the `merge_group` trigger now so required checks also work if the repository
uses a merge queue. The exact workflow declarations are
`pull_request_target: [opened, synchronize, reopened, edited]` and
`merge_group:` with `permissions: contents: read, pull-requests: read` for the
trusted policy workflow. The exact event matrix is:

| Event                                   | E2E result              | CD eligible? |
| --------------------------------------- | ----------------------- | ------------ |
| `pull_request`                          | skipped                 | no           |
| `merge_group`                           | skipped                 | no           |
| `push` to protected `main`              | required and successful | yes          |
| `workflow_dispatch` with `run_e2e=true` | required and successful | no           |

The CI merge-group path must check out with `fetch-depth: 0` and configure
`dorny/paths-filter` with `base: ${{ github.event.merge_group.base_sha }}`; the
resulting push created by the merge still requires `e2e == success` before CD.

The final `ci.yml` trigger set is exactly `push` on `main`, `pull_request` to
`main`, `merge_group`, and `workflow_dispatch`; only the `e2e` job is
conditional within those events. The separate `merge-policy.yml` uses only
`pull_request_target` with the listed activity types plus `merge_group`, and has
`contents: read` and `pull-requests: read` permissions. This separation keeps
untrusted PR code out of the trusted policy workflow while preserving the
push-only E2E rule.

Add boolean `workflow_dispatch` inputs `run_e2e` and `force_e2e_failure` for
controlled CI verification. The E2E condition may run for a push to `main` or
for an explicit manual run with `run_e2e=true`; `force_e2e_failure=true` must
make the E2E helper fail immediately and is only valid for manual runs. CD must
continue to require `workflow_run.event == 'push'`; a manual run can never
authorize deployment.

Add a separate required `.github/workflows/merge-policy.yml` triggered by
`pull_request_target` types `[opened, synchronize, reopened, edited]` and
`merge_group` that runs from the trusted base revision, inspects the PR
title/body and all proposed commit messages through the GitHub API, and fails on
`[skip ci]`, `[ci skip]`, `[no ci]`, `[skip actions]`, `[actions skip]`, or
`skip-checks: true`. GitHub documents that these skip instructions do not
suppress `pull_request_target`, so this required policy check cannot be bypassed
by the same trailer. Require this check alongside `CI Success`; keep direct
pushes to protected `main` disabled.

### 2. Make the existing CI Success job require E2E on pushes

Add `e2e` to `ci-success.needs`. Keep `if: always()` so the terminal gate can
inspect upstream outcomes, then make its validation explicit:

- `detect-changes` must be `success`.
- For each package job, consult its corresponding `detect-changes` output:
  output `true` requires that job to be exactly `success`; output `false`
  requires it to be exactly `skipped`. `failure`, `cancelled`, or any other
  result fails the gate. Apply the same mapping to `release-config`.
- On a pull request, `e2e == skipped` is expected and accepted.
- On `merge_group`, `e2e == skipped` is expected and accepted.
- On a push to `main`, `e2e` must be `success`; `skipped`, `failure`, or
  `cancelled` fails `CI Success`.
- On `workflow_dispatch` with `run_e2e=true`, `e2e` must be `success`, but the
  CD workflow rejects that event type.

This also closes the existing weakness where the gate checks only `failure` for
package jobs and could miss a cancellation or an upstream detection failure.
`CI Success` remains the single required status for branch protection, while the
E2E job remains visible as its own check for diagnosis.

### 2a. Do not let release-input changes become an untested PR

The current package filters do not cover every input used by CD. As part of the
same CI change, add a named `release-config` filter containing the complete
release-input set: `.github/workflows/**`, `.github/actions/**`, `infra/**`,
`.dockerignore`, all `**/Dockerfile*` and `**/.dockerignore` files,
`apps/**/package.json`, `packages/**/package.json`, `scripts/**`,
`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `.npmrc`,
`pnpmfile.*`, all root and package `tsconfig*.json` files, and committed
deployment environment templates. When true, run a non-skippable
`release-config` validation job and make the deployable `api`, `web`, and
`workers` build jobs run as well. The validation should run `bash -n` over the
changed deployment scripts, validate workflow/Compose YAML with the repository
tooling, and run the applicable app builds; it must not require production
secrets. Include its result in `ci-success`.

This is separate from the E2E trigger: the E2E job still runs only on a push to
`main`, but a pull request changing a Dockerfile, deployment script, or CD
workflow must not be allowed to pass merely because all package jobs were
`skipped`. A release/config job that is not applicable may be skipped; when its
filter is true it must be successful before merge.

The required result mapping is explicit: `release-config=true` requires
`release-config == success` and also forces `api == success`, `web == success`,
and `workers == success`; `release-config=false` permits only
`release-config == skipped`, while each app job follows its own detector output.
Any other result fails `CI Success`.

When `merge_group` is enabled, set the workflow's read permissions explicitly
(`contents: read` and `pull-requests: read`) and verify the path-filter job
resolves the merge-group base/ref correctly.

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
required checks, including E2E, passed before `build-push` or `sync-and-deploy`
can start.

The wired suite is the repository's existing API integration E2E suite. It
creates a Nest testing application directly and does not run the compiled
`main.ts` process, so it does not independently prove global bootstrap,
listener, CORS, Helmet, or production environment-validation behavior. That is
an explicit limitation of hooking up only existing tests, not a reason to add a
new browser or process-level suite in this plan. CD's existing image build,
candidate health checks, smoke checks, and deploy preflight remain the separate
runtime validation layers; an E2E pass must never bypass a failed deploy
preflight.

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

The job should use the same Node and pnpm versions already defined in CI: Node
26 and pnpm 10.11.0. Install with `pnpm install --frozen-lockfile`.

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
- The built API application started as a disposable local process on port 3000
  with the same test environment. Workers' scheduled order-expiration job calls
  `/internal/orders/expire-sweep`; the existing E2E tests' in-process Nest
  application does not listen on a port, so a worker-only process check or a
  fake PID is insufficient. Poll the real API `GET /api/health` endpoint before
  starting workers, then set `INTERNAL_API_URL=http://127.0.0.1:3000`.

The implementation should make the service definitions concrete rather than
relying on undocumented runner defaults. For example, the PostgreSQL service
must declare `POSTGRES_USER=ci`, `POSTGRES_PASSWORD=ci`, and `POSTGRES_DB=ci`,
expose `5432:5432`, and use a `pg_isready -U ci -d ci` health check. Redis must
expose `6379:6379`, use the exact URL consumed by the job (the simplest isolated
form is `redis://127.0.0.1:6379`), and have a matching `redis-cli ping` health
check. Pin the PostgreSQL, Redis, MinIO, and MinIO client images to the exact
versions or digests validated in the implementation and record those pins in the
workflow; do not inherit floating `latest` tags.

Prefer GitHub Actions service containers for PostgreSQL and Redis and a small
explicit MinIO container/setup step over starting the complete development
Compose stack. The development Compose stack builds and starts the API and web
watchers, which is unnecessary for this API-level suite and would add startup
time and unrelated failure modes.

The MinIO bootstrap must be executable and retain its container identity for
cleanup. Create a dedicated Docker network (for example `biasmarket-e2e`), start
`minio/minio` with `server /data`, test-only root credentials, a pinned image
digest, `--name biasmarket-e2e-minio`, and `-p 9000:9000`; poll
`http://127.0.0.1:9000/minio/health/live`. Run a pinned `minio/mc` container on
the same network with
`MC_HOST_ci=http://<user>:<password>@biasmarket-e2e-minio:9000`, then create all
three buckets and apply `mc anonymous set download` only to `products` and
`logos`. The host-side API uses the published `http://127.0.0.1:9000` endpoint.
Save the MinIO container name/ID in the trapped helper so logs can be collected
and the exact container removed.

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
credential. The `S3_ACCESS_KEY`/`S3_SECRET_KEY` values exported to the API must
be exactly the same test-only credentials passed to MinIO and `mc`.

### 6. Prepare and run the existing suite

The ordered job steps should be:

1. Check out the exact push SHA used by the CI run. For a job inside the same CI
   workflow, `github.sha` is the tested commit. Keep
   `persist-credentials:
false`.
2. Set up Node and pnpm and install the frozen lockfile.
3. Wait for PostgreSQL, Redis, and MinIO health; fail with a service-specific
   message if readiness times out.
4. Run Prisma client generation: `pnpm --filter @biasmarket/db run db:generate`.
5. Apply migrations to the empty test database with
   `pnpm --filter @biasmarket/db exec prisma migrate deploy`.
6. Verify `apps/api/openapi.json` exists and is tracked with
   `test -s apps/api/openapi.json` and
   `git ls-files --error-unmatch apps/api/openapi.json`, then regenerate the
   committed API OpenAPI document with `pnpm --filter api generate:openapi`,
   then fail if `git diff --exit-code -- apps/api/openapi.json` reports drift.
   The existing specs import this committed file directly, so a missing or stale
   contract must not be hidden by CI.
7. Build the API and workers with the dependency-aware command
   `pnpm turbo run build --filter=api --filter=workers`, start the API
   production entrypoint, and poll `http://127.0.0.1:3000/api/health` until it
   reports success. This is a disposable bootstrap/readiness check, not a new
   application test suite.
8. Start the workers' production entrypoint in the background and poll its
   actual `GET http://127.0.0.1:3002/health` endpoint. Fail if the PID exits or
   the endpoint does not become healthy; a live PID alone is not readiness. Set
   `E2E_DISABLE_ORDER_EXPIRATION_SCHEDULER=true` in the worker only. The small,
   explicitly reviewed worker guard for this test-only flag prevents the
   five-minute scheduler from mutating fixtures during a long serial run, while
   leaving the processor enabled. Confirm the worker log contains the
   scheduler-disabled message. Enqueue one existing `expire-sweep` job on
   `QUEUE_NAMES.ORDERS` using a one-off Node helper from the built `workers`
   workspace, wait for the worker log to report a completed `expire-sweep`, and
   assert its result is a valid `{ "cancelled": number }` response. This
   verifies the real BullMQ callback through the disposable API while preserving
   the existing worker scheduler/processor unit coverage; do not claim this adds
   a worker E2E suite.
9. Run the existing command unchanged: `pnpm --filter api test:e2e`.

The first implementation must establish a clean-runner baseline before making
the result deployment-blocking: the target SHA must pass all 22 E2E files and 66
currently counted test cases. If a failure is an application/test failure rather
than missing CI bootstrap, stop rollout and fix or explicitly resolve it before
enabling the CD gate.

Do not add `--runInBand`-style flags or override the existing Vitest config;
`apps/api/vitest.config.e2e.ts` already disables file parallelism for the
better-auth limiter. Do not run the suite once per package or split it into
parallel jobs unless the suite is later made data- and rate-limit-isolated.

### 7. Make background-process cleanup and diagnostics reliable

Use one committed CI helper (or one Bash step) that installs
`trap cleanup EXIT INT TERM` before provisioning any service, exports the test
environment, starts the named MinIO container, runs `mc`, starts the API as
`(cd "$GITHUB_WORKSPACE" && exec node apps/api/dist/main.js) >.ci/e2e-api.log
2>&1 & API_PID=$!`,
starts workers as
`(cd "$GITHUB_WORKSPACE" && exec node apps/workers/dist/main.js) >.ci/e2e-workers.log
2>&1 & WORKER_PID=$!`,
runs migrations and tests, and cleans up the API PID, worker PID, MinIO
container, Docker network, and generated mail directory from that same helper
using `trap cleanup EXIT INT TERM`. Starting the actual Node entrypoints makes
the tracked PIDs the process groups to stop; cleanup must still terminate,
`wait`, and verify both processes before removing the mail directory or network.
A trap in a setup step does not survive into a later Actions step. The cleanup
may remove only the generated `apps/workers/.mailer-dev` directory in the
disposable checkout. Capture MinIO setup, migration, and test stdout/stderr to
named log files. On failure, upload a short-lived private artifact with those
exact log paths and a machine-readable Vitest report only if a reporter/path is
explicitly configured; otherwise call it a captured stdout/stderr artifact and
do not imply that a report file exists. Do not upload the mailer directory: it
contains verification and password-reset links, even though they are test
values. Set `retention-days: 1` on the failure artifact.

The job should start with an explicit `timeout-minutes: 30`, then record actual
runtime after the first few main pushes. A timeout is a failed E2E gate, not a
warning or an automatic deploy bypass.

Before the non-blocking baseline, use these immutable service references in the
workflow/helper (resolved from Docker Hub on this plan revision):

| Service      | Immutable image reference                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| PostgreSQL   | `docker.io/library/postgres@sha256:7157393f508fd8eb46119937fab39813783fe3e7d4c6316c45c12ce2ea25e61d` |
| Redis        | `docker.io/library/redis@sha256:e7723ff73d963f5cc6d9c4643ea3d989527a402a319239054e9472a7fb9219a2`    |
| MinIO        | `docker.io/minio/minio@sha256:640c22768ed5dbc92eacc14502a1b06a1c708fa60431345c78dfc22917062e93`      |
| MinIO client | `docker.io/minio/mc@sha256:95b5f3f7969a5c5a9f3a700ba72d5c84172819e13385aaf916e237cf111ab868`         |

Record the human-readable tags used to resolve these digests in workflow
comments, and re-resolve only through a reviewed plan/workflow change. The gate
cannot be enabled while any service image uses an unpinned floating tag.

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
- A newer push may supersede an older in-progress CI run through the existing CI
  concurrency group. A cancelled CI run cannot authorize CD, and the existing CD
  staleness guard prevents an older SHA from deploying over a newer SHA already
  live. Do not claim that a successful older run is automatically prevented from
  starting CD after a newer push unless an explicit latest-main-SHA check is
  added.
- Existing CD `build-push`, image tags, native ARM runner choice, staleness
  guard, SSH setup, deployment environment, and non-cancelling deploy
  concurrency remain unchanged except for comments and the dependency proof.

## Files expected to change during implementation

- `.github/workflows/ci.yml` — add the push-only API E2E job and make
  `ci-success` validate all outcomes, including E2E.
- `.github/workflows/merge-policy.yml` — add the trusted `pull_request_target`
  skip-token policy check and require it for merge.
- `.github/workflows/cd.yml` — update comments/documentation only unless
  implementation verification finds that an additional explicit dependency
  assertion is needed; do not remove the current security gates.
- `docs/core/deploy.md` or the relevant CI/CD runbook — document that merges to
  protected `main` run E2E before CD and that PR updates do not.
- Optionally a small committed CI helper script under `scripts/` if the service
  bootstrap/cleanup shell becomes too large or hard to test inline.
- `apps/workers/src/jobs/orders/expire-orders-scheduler.service.ts` — add the
  test-only scheduler-disable guard, if it does not already exist; the processor
  remains enabled for the explicit queued callback smoke probe.
- This plan document — append execution notes and measured runtime after the
  implementation lands.
- GitHub branch-protection/ruleset configuration — require `CI Success` and the
  merge-policy check, require pull requests for `main`, disable administrator
  bypass for normal operation, block all direct pushes, and verify the
  configured merge paths.
- `.github/CODEOWNERS` — add explicit trusted-owner entries for
  `.github/workflows/**`, `.github/actions/**`, `infra/**`, and deployment
  scripts; replace the current malformed line with valid entries such as:

  ```text
  * @bobadilla-tech/biasmarket-core
  /.github/CODEOWNERS @bobadilla-tech/biasmarket-core
  /.github/workflows/** @bobadilla-tech/biasmarket-core
  /.github/actions/** @bobadilla-tech/biasmarket-core
  /infra/** @bobadilla-tech/biasmarket-core
  /scripts/** @bobadilla-tech/biasmarket-core
  ```

  Configure the branch rule so these reviews are required and bypass is disabled
  for normal merges.

No application source, existing E2E spec, package test script, or new browser
test file should be changed unless the current suite cannot run in a clean
runner and the failure is a genuine test-environment defect. The one planned
test-environment exception is the small worker-only
`E2E_DISABLE_ORDER_EXPIRATION_SCHEDULER` guard described above. Any such fix
must be separately called out with its severity and rationale.

## Verification and rollout

1. Add the E2E job and `workflow_dispatch(run_e2e=true)` path, but temporarily
   leave `e2e` out of `ci-success.needs`. Run that manual path as the
   non-blocking baseline on the target SHA. Record 22/22 files and 66/66
   currently counted cases passing; only then add `e2e` to `ci-success.needs`
   and enable the deployment-blocking push gate.
2. Reproduce the complete E2E bootstrap locally with the same environment
   contract, including a clean database, MinIO buckets, Redis, and workers.
3. Validate YAML syntax and inspect Actions expressions, especially the
   push-only condition and `ci-success` handling of `success`, `skipped`,
   `failure`, and `cancelled`.
4. Open a test PR and update it several times: confirm normal CI runs and E2E
   does not.
5. Merge the test PR: confirm exactly one E2E run starts for the resulting
   `main` SHA, all 22 API spec files run, and `CI Success` waits for it.
6. Use `workflow_dispatch` with `run_e2e=true` and `force_e2e_failure=true` to
   intentionally fail the E2E helper. Confirm the manual run fails its CI gate
   but CD does not build, push, SSH, or deploy because its `workflow_run.event`
   is not `push`. Restore the test path.
7. Restore the test and merge a passing commit: confirm CD starts only after the
   successful CI run, and that its checkout/image tags equal the tested merge
   SHA.
8. Verify a rapid pair of pushes: an older cancelled/superseded CI run must not
   deploy, while the newest successful SHA may deploy.
9. Verify branch protection requires `CI Success` and disallows direct pushes to
   `main` for normal contributors. Use repository-admin access to confirm the
   required status check is the exact stable check name (`CI Success`), branch
   protection/rulesets are active, and no merge path bypasses the protected
   branch. The E2E check is intentionally not a PR-required check; it is
   enforced after merge by the push CI gate and CD `workflow_run`.
10. Append actual run duration, runner/service assumptions, and any deviations
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
- **High:** Package path filters do not cover all release inputs, so a PR that
  changes deployment/Docker/CD configuration can have every package job skipped.
  Resolution: add a release/configuration filter and a required validation job
  (or route it to deployable app jobs) before merge.
- **High:** The API suite depends on more than PostgreSQL; Redis, MinIO, and a
  running workers mailer are required. Resolution: model all four disposable
  dependencies in the job and wait for readiness.
- **Medium:** The existing `*.e2e-spec.ts` tests boot `AppModule` through Nest's
  testing harness rather than the compiled `main.ts` process. Resolution:
  classify the gate accurately as API integration E2E and retain CD's existing
  candidate health/smoke/deploy checks as the process-level layer; do not add
  new tests under this scope.
- **Medium:** `apps/api/vitest.config.e2e.ts` disables file parallelism because
  of better-auth's shared limiter. Resolution: run the existing command and
  preserve serial execution rather than parallelizing files for speed.
- **Medium:** The suite reads files written under `apps/workers/.mailer-dev`; a
  containerized worker with no shared workspace would make verification-email
  tests time out. Resolution: run workers in the runner or explicitly share that
  directory.
- **Medium:** Existing CI paths-ignore rules mean docs-only pushes do not run
  CI/E2E/CD and can leave a required status pending. Resolution: remove the
  ignore rules; docs-only PRs run normal CI, and their merged push runs E2E.
- **Low:** There are no browser E2E tests for web and no E2E suites for workers
  or sanity. Resolution: inventory and explicitly leave them out per scope.
- **Medium:** Branch-protection state was not verifiable from the repository
  workspace. Resolution: make repository-admin verification of the `CI Success`
  required check and protected `main` an explicit rollout acceptance step.
- **Medium:** Existing CD can still fail on an unrelated VPS state/preflight
  problem even when E2E passes. Resolution: preserve and separately observe the
  existing CD preflight/rollback behavior; E2E success must not be treated as
  proof that the VPS is deployable.
- **High:** The draft did not require a known-green clean-runner baseline before
  turning the suite into a deployment blocker. Resolution: require all 22
  files/66 current cases to pass on the target SHA before enabling the gate.
- **High:** Service credentials and health checks were underspecified.
  Resolution: define matching Postgres user/password/database, Redis URL and
  health checks, and pin service images or digests during implementation.
- **Medium:** A cleanup trap in an earlier setup step would not cover processes
  started there once a later test step ran. Resolution: keep startup, test, and
  cleanup in one trapped helper step, with a separate always-upload step.
- **Medium:** The failure-injection rollout test cannot use a non-main push when
  E2E is intentionally push-to-main only. Resolution: use an opt-in manual test
  mode that CD rejects, or a controlled main commit/revert.
- **Medium:** A successful older CI run can still emit a CD workflow event after
  a newer push; existing concurrency and staleness checks limit the damage but
  do not guarantee only the newest run starts. Resolution: state the weaker
  guarantee accurately unless a latest-main-SHA check is added.
- **Low:** The draft referred to an undefined “Vitest report”. Resolution:
  specify exact log paths and a configured report format, or describe only
  stdout/stderr artifacts.
- **Low:** Floating service-image versions would make the gate non-reproducible.
  Resolution: pin the four immutable image references recorded above before the
  baseline and keep tag updates reviewable.
- **High:** The worker's scheduled expiration processor calls an HTTP API, but
  the test harness's in-process Nest app does not listen on port 3000.
  Resolution: start the built API process, poll `/api/health`, and point the
  worker at it; keep the in-process app used by the existing tests unchanged.
- **Medium:** Worker readiness cannot be inferred from a running PID.
  Resolution: poll `/health` on port 3002 and fail on early process exit.
- **Medium:** Generated mail files were not explicitly cleaned up. Resolution:
  remove only the disposable `apps/workers/.mailer-dev` directory during the
  trapped cleanup.
- **Medium:** The queue package must be built before the worker because the
  workspace entrypoint resolves `dist/index.js`. Resolution: use the explicit
  Turbo dependency-aware API/worker build command.
- **High:** The committed `apps/api/openapi.json` is imported directly by
  several existing specs, so a missing/stale file could fail or be hidden by the
  environment. Resolution: regenerate it and fail on git drift before the suite.
- **Medium:** A separate `mc` container cannot use a container-local `127.0.0.1`
  to reach MinIO. Resolution: use a dedicated Docker network, the MinIO service
  name for `mc`, and the published localhost port only for the host-side API.
- **Medium:** Worker `/health` is liveness-only and the scheduled expiration
  callback was not otherwise exercised. Resolution: poll health, verify the
  mandatory scheduler-disabled log, enqueue the existing processor job, and
  observe its callback against the real disposable API process.
- **High:** Workflow and deployment files could be changed in a PR while
  preserving the required check name. Resolution: require trusted CODEOWNER
  approval and branch-rule enforcement for workflow/action/infrastructure paths.
- **Medium:** A non-blocking baseline phase was not explicit. Resolution: run
  and record a green 22-file/66-case baseline before enabling the required
  deployment-blocking dependency.
- **Medium:** The prior failure test offered alternatives. Resolution: choose
  the explicit manual-dispatch mode, which CD rejects by event type.
- **Medium:** The worker's five-minute scheduler can touch test data while a
  long serial suite is running. Resolution: make the test-only scheduler disable
  guard mandatory for this job, keep the processor enabled, and verify the
  callback by manually enqueueing the existing job against the disposable API.
- **High:** The API startup environment omitted `S3_LOGO_BUCKET`, which the real
  process requires. Resolution: set `S3_LOGO_BUCKET=logos` and use the same
  MinIO credentials/bucket names in API and `mc` setup.
- **High:** A git diff check alone would not catch a missing untracked
  `openapi.json`. Resolution: assert the file is non-empty and tracked before
  regeneration, then fail on generated drift.
- **Medium:** A direct internal endpoint probe did not prove the BullMQ worker
  actually consumed the callback job. Resolution: enqueue one existing
  `expire-sweep` job and wait for its completion log/result.
- **Medium:** Merge-queue/manual behavior was conditional. Resolution: record
  the fixed event matrix above and require manual E2E success while keeping
  manual runs ineligible for CD.
- **Medium:** Skip-CI trailers could suppress the post-merge gate. Resolution:
  add a required merge-policy check that rejects them before merge.

### Subagent review rounds

The plan was iterated through these subagent rounds; findings are recorded above
by severity and were applied before the next round:

1. **Copernicus — repository/CI archaeology:** HIGH findings established that
   API E2E, real infrastructure, and CD dependency were missing; MEDIUM/LOW
   findings established the suite inventory, serialism, mailer filesystem, and
   absent web/workers/sanity E2E suites.
2. **Ptolemy — Actions/CD semantics; Parfit — runtime dependencies; Boyle —
   scope/rollout:** HIGH findings added strict CI result handling, release-input
   validation, clean-runner baseline, and same-SHA gating; MEDIUM/LOW findings
   added exact services, cleanup, artifacts, branch protection, and failure
   verification.
3. **Leibniz — workflow security; Socrates — API/worker runtime; Cicero —
   request completeness:** HIGH findings added OpenAPI verification, workflow
   CODEOWNER protection, and explicit environment/startup requirements;
   MEDIUM/LOW findings added MinIO networking, worker callback execution,
   scheduler isolation, and manual event behavior.
4. **Jason — workflow/runtime; Einstein — scope:** HIGH findings corrected
   release filters, result mapping, administrator bypass, and policy-check
   details; MEDIUM/LOW findings corrected process cleanup and immutable image
   pinning.
5. **Averroes — workflow/release; Ohm — application runtime:** HIGH/MEDIUM
   findings made the merge-group base explicit, required the scheduler-disable
   mode, and tightened the process/trap ordering.
6. **Meitner — CI/CD; Archimedes — user-scope:** HIGH/MEDIUM findings removed
   all administrator bypass language, fixed exact trigger separation, and made
   the manual forced-failure path explicit.
7. **Boole — final consistency:** HIGH/MEDIUM/LOW findings were resolved by
   making the scheduler guard mandatory, pinning the four immutable image
   digests, and adding this review history.

Each round classified findings as HIGH, MEDIUM, or LOW, corrected this plan, and
triggered another review. The final revision-9 audit is recorded below.
