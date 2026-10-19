# Skip unchanged Docker image rebuilds in CD

## Status

Planning document only. No implementation changes are included in this plan.

## Context and invariants

`.github/workflows/cd.yml` currently runs one native `ubuntu-24.04-arm` matrix
job per `api`, `web`, and `workers` and invokes `docker/build-push-action@v6`
for every app on every successful CI push. Its GHCR tags are the full commit
SHA. `infra/vps/deploy.sh` exports `IMAGE_TAG="$sha"` before migration and
service startup; `infra/vps/lib/compose.sh` then interpolates that value into
both blue and green service definitions in `infra/vps/docker-compose.yml`.
Consequently every incoming SHA must have a pullable tag for all three images,
even when one image's content is unchanged.

The target is to avoid the buildx/build-push action entirely for an unchanged
app while preserving the existing blue/green guarantees: the candidate image is
still pulled and health-checked, migrations still run against the candidate
before its services start, the old color stays alive until the scheduled
cleanup, and rollback never recreates a faulty live image by accident.

The implementation must retain these existing conventions:

1. `workflow_run`'s security gate, explicit SHA-pinned checkouts, per-app
   `production-build-${app}` cancellation, serialized non-cancelling
   `production-deploy`, full-history checkout for the staleness guard, and the
   existing `contents: read`/`packages: write` permissions model.
2. Native arm64 runners. No QEMU or x86 image may be introduced.
3. GHCR login through `docker/login-action@v3`; no VPS registry credential is
   assumed because the package is public.
4. The dependency/build conventions in `pnpm-workspace.yaml`, `turbo.json`, the
   workspace manifests, and the three root-context Dockerfiles.
5. The blue/green state machine and its rollback-target image inspection in
   `infra/vps/lib/compose.sh`.

## 1. Decision: use the last successful CD deployment as the diff baseline

Add a single preflight job after `gate` and before the build matrix. It obtains
the most recent CD run whose dedicated `deployment-provenance` job completed
successfully (that job runs after `sync-and-deploy` and does not wait for the
delayed/cancellable `scheduled-cleanup` job), reads that run's `head_sha`, and
verifies locally that the SHA is an ancestor of the incoming `head_sha`. The
preflight downloads that run's provenance artifact, containing the three image
digests and effective web build-argument hash. It publishes:

- `baseline_sha`: the verified prior successful deployment SHA, or empty when
  none is usable;
- `baseline_available`: `true` only when the SHA is an ancestor, the artifact is
  valid, and all three source digests can be inspected;
- one per-app changed/rebuild decision, derived from the complete diff and
  effective build-argument comparison.

The lookup must use a GitHub API path with an explicit `actions: read`
permission (or an equivalent repository-owned, read-only source of CD run
provenance), identify the exact `cd.yml` workflow, paginate candidates, inspect
their jobs for a successful `deployment-provenance` conclusion, and exclude the
current run ID. It must validate repository, branch, head SHA, artifact
schema/expiry, and all three recorded digests. API, download, schema, or
ancestry failure means no usable baseline.

Rationale: a successful CD run is stronger than “an image tag exists”: it means
all three SHA tags were created and the VPS deploy completed successfully. It
also avoids adding SSH deploy secrets to build jobs. The ancestry check makes a
force-pushed or rebased `main` conservative: if no prior successful SHA is in
the incoming history, treat every app as changed and build all three.

**Accepted, documented limitation:** this is a shared deployment baseline, not
an independently tracked per-app build ledger. The current workflow publishes
all three tags, so the per-run artifact is sufficient. If a future workflow
permits partial deploys, replace it with a per-app record before enabling skips.

## 2. Decision: define relevant inputs as Docker-context dependency closure

The preflight must compare `git diff --name-status baseline_sha...head_sha` and
compute a decision independently for each app. A changed path is relevant to an
app when it matches the app's source, any workspace package in its transitive
build dependency closure, or a shared build input.

The closure must be derived from the workspace manifests and the Turborepo
dependency model, not hand-maintained only in the workflow. The implementation
may use a small repository-owned CI helper (planned path:
`scripts/ci/changed-image-inputs.mjs`) that reads `pnpm-workspace.yaml`, the
workspace `package.json` files, and `turbo.json`, resolves `workspace:*`
dependencies, and emits the three app decisions plus matching paths. It must
fail closed (all three rebuild) if graph parsing or diff resolution fails. The
helper should be exercised against the same package names used by
`pnpm turbo run build --filter=api|web|workers`; it must not infer dependencies
from import text or from the CI package-filter job.

At minimum, the required closure and shared-input rules are:

| Image     | Relevant workspace paths                                                                                                                                                                                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `api`     | `apps/api/**` plus every transitive workspace build dependency; explicitly include `packages/db/**`, `packages/i18n/**`, `packages/queue/**`, `packages/types/**`, and `packages/utils/**`                                                                                                                                                       |
| `web`     | `apps/web/**` plus its transitive workspace build dependencies; explicitly include `packages/i18n/**`, `packages/types/**`, `packages/ui/**`, and `packages/utils/**`                                                                                                                                                                            |
| `workers` | `apps/workers/**` plus its transitive workspace build dependencies; explicitly include `packages/queue/**`; conservatively include `packages/db/**` and `packages/types/**` as required compatibility inputs because a Prisma/client or shared contract change must not leave workers stale, even if the current manifest graph appears narrower |

The implementation must also mark **all three** images changed when any of these
paths changes: `pnpm-lock.yaml`, `pnpm-workspace.yaml`, the root `package.json`,
any workspace `package.json` (every Dockerfile installs the full workspace),
`turbo.json`, `.dockerignore`, root TypeScript/configuration/build files
consumed by the commands below, `infra/docker/api.Dockerfile`,
`infra/docker/web.Dockerfile`, `infra/docker/workers.Dockerfile`, or a
repository-wide build/configuration file that the helper identifies as being
copied or consumed by the Docker build. `infra/docker/<app>.Dockerfile` is an
unconditional rebuild trigger for that app at minimum; the shared root files are
all-app triggers because each Dockerfile performs a root-context install and
`COPY . .`.

The explicit Dockerfile input `infra/docker/api-healthcheck.ts` is an all-app
trigger for `api` and `workers`. Include framework/config files such as
`tsconfig*.json`, `nest-cli.json`, `next.config.*`, PostCSS/Tailwind
configuration, Prisma configuration/schema inputs, package build scripts, and
other files directly consumed by the Dockerfile build commands. If the helper
cannot prove a changed non-ignored root-context file irrelevant, it marks all
three changed. This preserves useful skips for isolated app/package source edits
without retagging a stale root-context build.

Markdown-only changes do not reach CD today because `ci.yml` uses
`paths-ignore`, but the detector must still handle them correctly if the trigger
policy changes. A docs-only diff produces three retags only when there is a
valid baseline; it must not accidentally become a build due to an unrelated
glob.

## 3. Decision: copy the manifest, never rebuild or repush layers

Each matrix job continues to check out the exact `needs.gate.outputs.head_sha`,
set up buildx on arm64, and authenticate with GHCR. It then branches:

1. If the app is changed, its effective build argument changed, or no valid
   baseline exists, run the existing `docker/build-push-action@v6` step with the
   existing context, Dockerfile, SHA tag, build args, and per-app `type=gha`
   cache scope.
2. If the app is unchanged, inspect the immutable recorded source digest and its
   platform result. Then run
   `docker buildx imagetools create --tag
   ghcr.io/bobadilla-tech/biasmarket-<app>:<head_sha>
   ghcr.io/bobadilla-tech/biasmarket-<app>@sha256:<recorded_digest>`.
   This is a registry manifest/tag operation: it must not invoke a Dockerfile,
   rebuild layers, or use `docker pull`/`docker push`.

The source reference is the recorded immutable **top-level descriptor** digest,
never the mutable baseline SHA tag. The artifact schema must separately record
`source_descriptor_digest`, `arm64_manifest_digest`, `arm64_config_digest`,
media type, and platform. Inspect raw manifest JSON, support both a single
manifest and an index, require a valid Linux arm64 descriptor, and preserve the
source media type where possible (`--prefer-index=false` for a single-manifest
source). After copying, inspect the target and compare the Linux arm64 child
manifest/config digest and platform; do not compare only top-level index
digests, which can change when a single manifest is wrapped. The accepted policy
is either a single Linux/arm64 manifest or an index whose arm64 child matches
exactly; any other platform children are rejected rather than silently
propagated.

If source inspection or the manifest copy fails, fail the job rather than
claiming the SHA tag exists. A retry may repeat the same manifest operation; it
must never copy from the incoming tag before confirming that tag's digest. An
optional implementation improvement is a bounded fallback to a real
`build-push-action` build after a source-copy failure, but this must be explicit
and observable; silent fallback would hide registry permission/tag corruption
and destroy the expected skip measurement.

When `baseline_sha == head_sha`, inspect the target tag and no-op if it already
exists with a valid arm64 manifest; do not attempt a self-copy. If it is absent,
build it. The job summary must state `built`, `retagged`, or
`repaired-by-build`, the baseline SHA, the matching paths, and the source/target
digest.

Hash a canonical JSON object containing the exact names and values passed to the
build step (including explicit unset versus empty handling). Hash the effective
`NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SENTRY_DSN` values into the per-run
provenance artifact. A changed value forces a web build even when Git has no
changed path. If the prior artifact lacks this hash, build web conservatively.

## 4. Concurrency and provenance rules

The preflight and matrix jobs must use the existing build concurrency group and
cancel behavior. A cancelled older run may leave tags for its SHA, but it does
not become a baseline because only a successful CD deployment qualifies.

A newer CD run can complete after an older run has read its baseline. This is
safe but may cause an unnecessary build: stale baselines are allowed to cause
extra work, never a skip based on a newer/unrelated source. The preflight must
therefore pin the run list and verify ancestry before emitting decisions; the
deploy job's existing CD-side `git merge-base --is-ancestor` staleness guard
remains authoritative immediately before rsync/SSH.

Do not use `github.sha` in the `workflow_run` jobs where it can mean the default
branch context; continue using `needs.gate.outputs.head_sha`. Do not infer
success from a tag listing, a cache hit, a cancelled run, or a currently-running
run.

## 5. Edge cases and safety behavior

### First deploy or no usable baseline

If there is no prior successful CD run, the history is shallow/unavailable, the
baseline SHA is missing, or any source tag cannot be inspected, mark all three
apps `build`. This preserves bootstrap's requirement that all services have real
images under the requested SHA.

### Force-push/rebase

If the prior successful SHA is not an ancestor of the incoming SHA, mark all
three `build`. The later deployment staleness guard may still reject the deploy
if the VPS's live SHA is not an ancestor; image planning must not weaken that
guard or attempt to “repair” history with retags.

### Concurrent pushes and cancelled builds

Only a completed successful `deployment-provenance` job is baseline. A build
cancelled after it created one or two tags does not establish provenance. A
later run with no usable successful baseline builds all three. The serialized
`production-deploy` group still prevents rsync/deploy overlap, and the per-app
build groups retain their existing cancellation semantics.

### Registry deletion, permission change, or digest mismatch

A missing source digest, non-arm64 source, or failed `imagetools create` is a
hard failure for that app. Never retag a tag that cannot be inspected and never
fall back to a live/rollback image discovered on the VPS. If source and target
digests are recorded, the source digest must be the digest observed before the
copy and the target digest must be checked afterward.

### Manual rollback

`deploy.sh --rollback` is independent of CD and must remain so. It uses
`running_image_sha` from the benched color to recover the pre-fault release and
explicitly refuses to recreate a target when no inspectable previous image tag
exists. The change must not alter rollback to use the CD baseline or a new
retag. A rollback remains a real image pull/restart path, and an operator must
restore a missing old tag manually before retrying.

### Blue/green cutover

No change is permitted to `deploy.sh`'s sequence after a new preflight: before
`run_migration_phase`, it must verify/pull all three candidate SHA references
and confirm valid Linux arm64 manifests. A partial pull must be cleaned up or
safely cached; it must not apply migrations before discovering that web or
workers is unavailable. Then retain candidate startup, health checks, pre-switch
smoke tests, canary, post-canary verification, state commit, and delayed
old-color cleanup. A SHA retag has identical image content to the prior
successful release, so it is safe for the unchanged app to start in the inactive
color. The workflow must also verify all three tags immediately before SSH
launch; the VPS-side check is authoritative against the race because Compose
interpolates one `IMAGE_TAG` across both colors.

The implementation must close the mutable-tag window rather than treating it as
a deployment guarantee: `sync-and-deploy` downloads the verified manifest
artifact, places a SHA-bound `infra/vps/deploy-manifest.json` in the rsynced
deployment payload, and invokes a newly allowlisted fixed-path manifest form of
the SSH dispatcher. `deploy.sh` validates the SHA, top-level descriptor and
arm64 child digest for all three images after pulling and before migrations or
startup. The manifest is secret-free, rejected if stale/mismatched, and is
removed or superseded atomically with the next sync. Manual deploy/bootstrap
must use the same validated manifest form; no SHA-only production path remains.

## 6. Files and implementation sequence

1. Add `scripts/ci/changed-image-inputs.mjs` (or document a comparably tested
   helper location) with unit fixtures for app-only, transitive package,
   Dockerfile, lockfile, docs-only, missing-baseline, and graph-failure cases.
2. Update `.github/workflows/cd.yml` with the read-only provenance preflight,
   job outputs, conditional build/manifest-copy steps, digest verification,
   summaries, and comments explaining why a successful CD run—not an image
   listing—is the baseline. Preserve all gate, checkout, permissions,
   concurrency, cache, and deployment comments unless they become stale. Keep
   the static three-item matrix and branch at step level; use an explicit JSON
   output contract consumed with `fromJSON`, and give preflight clearly scoped
   concurrency separate from the per-app build groups.
3. Each matrix job uploads a uniquely named per-app metadata artifact after
   either build or retag, with a bounded JSON schema containing app, SHA,
   outcome, source/target top-level descriptor digest, arm64 manifest/config
   digest, media type, platform, and canonical web-argument hash. The matrix
   job's output contract is compact JSON containing only the decision/outcome;
   matching paths go in the summary/artifact, avoiding GitHub output-size and
   multiline escaping limits. The four outcomes are mutually exclusive: `build`,
   `retag`, `no-op` (existing valid target when baseline equals head), and
   `repair` (missing/invalid target built from source). A retag failure is a
   hard failure in the initial version; no undocumented build fallback.
4. Add a `deployment-provenance` job after `sync-and-deploy` and before
   `scheduled-cleanup`. It downloads the three per-app artifacts, obtains the
   observed runtime digests from the deploy result/allowlisted read-only VPS
   query, requires them to match the manifest, verifies the incoming manifests
   and web-argument hash, and uploads a per-run artifact containing the deployed
   SHA, per-app digests, and argument hash. Its success, not the overall
   workflow (which can be affected by cleanup cancellation), is the baseline
   criterion. Make `scheduled-cleanup` depend on this job so cleanup cannot run
   after an unproven deployment.
5. Add CI validation for the helper and a dry-run/testable command that prints
   decisions for a supplied baseline/head pair. Do not modify `ci.yml`'s
   existing gate or package test matrix as part of this change.
6. Update the relevant CD/deploy documentation (this plan's decisions and the
   blue/green plan's cross-reference) to explain manifest retagging, provenance,
   and accepted limitations.
7. Validate with action/config linting, helper tests, representative diff
   fixtures, and a GHCR test namespace or disposable tags. Confirm with
   `docker buildx imagetools inspect` that retagged images retain the same arm64
   digest and with a controlled deploy that Compose can pull all three incoming
   SHA tags. Do not test by deleting production tags or running
   `docker compose down`.

## 7. Review checklist

- A changed transitive package rebuilds every image whose Docker build consumes
  it; `packages/db`/Prisma and shared types cannot leave API or workers stale.
- Lockfile, workspace, Turbo, Dockerfile, explicit Dockerfile inputs, and
  root-context changes cannot be skipped.
- Missing/invalid baseline, rebased history, cancelled run, missing source tag,
  and concurrent workflow cases fail closed.
- Retagging performs no layer rebuild or repush and proves source/target arm64
  child-manifest identity from an immutable digest source.
- All three incoming SHA tags exist before `deploy.sh` receives the SHA.
- Blue/green health, canary, migration, cleanup, and rollback guarantees are
  unchanged; manual rollback never uses a potentially broken retag as its
  recovery source.
- No implementation file is changed while this planning task is in progress.

## Accepted, documented limitations

- A conservative shared baseline and all-app triggers may still rebuild more
  than the theoretical minimum; correctness and immutable SHA availability take
  priority over a narrower heuristic.
- The first deployment after adopting the detector builds all three images.
- A registry/API outage prevents a safe retag and therefore fails CD; it is not
  treated as permission to deploy an unverified or VPS-local image.
- A force-pushed history is deliberately treated as a full rebuild plus the
  existing deploy staleness decision, not as an opportunity to guess ancestry.
- `node:26-slim` base-image tags are mutable. An unchanged app intentionally
  keeps the previously proven base until one of its relevant inputs changes;
  routine base refreshes require a separate scheduled rebuild/digest policy.
- GHCR SHA tags remain aliases required by the existing VPS interface. Digest
  manifests are the planned mitigation for tag mutability; changing Compose to
  digest-pinned fields is a separate scope expansion unless it can be added
  without changing the dispatcher contract.
