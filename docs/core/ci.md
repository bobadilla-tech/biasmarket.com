# CI: lint, tests and coverage

What `.github/workflows/ci.yml` guarantees per workspace, and the rules that
keep it honest. `CI Success` is the only required check; it fails if any
path-filtered job that should run did not succeed
(`scripts/ci/check-ci-success.sh`).

## Workflows

| Workflow                                              | Triggers                                                                | What it does                                                                                                                                                                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml` (CI)                                         | push to `main` (not markdown-only), every pull request, manual dispatch | The jobs in the next section. Concurrent runs for the same ref cancel the older one.                                                                                                                               |
| `cd.yml` (CD)                                         | completion of a CI run                                                  | Deploys only a successful CI `push` run on `main` from this repository: a gate job, a build-and-push matrix (`api`, `web`, `workers` images to GHCR), then sync and deploy to the VPS. See [deploy.md](deploy.md). |
| `cleanup-fallback.yml`                                | hourly cron, manual dispatch                                            | Runs `deploy.sh --cleanup` over SSH as a backstop for the server-side scheduled cleanup; a no-op unless a cleanup is due. See [blue-green-migrations.md](blue-green-migrations.md#scheduled-cleanup).              |
| `dependabot-automerge.yml`                            | pull requests opened, reopened or updated                               | For Dependabot PRs only, enables auto-merge (squash) on patch and minor updates. The merge still waits for the required `CI Success` check.                                                                        |
| `mobile-release.yml`                                  | a published release, manual dispatch                                    | Builds the mobile app for Android and iOS and attaches the outputs to the release. See [mobile-release.md](mobile-release.md).                                                                                     |
| `.github/actions/deploy-ssh-setup` (composite action) | used by `cd.yml` and `cleanup-fallback.yml`                             | Writes the pinned `known_hosts`, the two restricted deploy keys and SSH keepalive settings, and exports the host and user to later steps.                                                                          |

## Jobs in `ci.yml`

- `detect-changes` computes one path-filter output per job below (the filter
  list lives in the `filters:` block of that job).
- One job per workspace that has a `package.json` runs only when its filter
  matches: `api`, `web`, `mobile`, `workers`, `db`, `i18n`, `queue`, `types`,
  `design-tokens`, `utils`, `validation`, `query`, `sanity`. Which steps each
  runs is in the matrix below.
- `hygiene` always runs: the workspace-scripts guard and its tests, `actionlint`
  over `.github/workflows` (pinned and checksum-verified by
  `scripts/ci/install-actionlint.sh`), and `shellcheck` over `scripts/ci/*.sh`.
  Production scripts under `infra/vps` are deliberately not shell-checked here.
- `e2e` (API E2E) boots the API and workers against real Postgres, Redis and
  MinIO started by `scripts/ci/e2e-datastores.sh` and `minio-e2e.sh`. It runs on
  every push to `main`, on pull requests whose changes match the `api_e2e`
  filter, and on a manual dispatch that sets `run_e2e`. It uploads logs as an
  artifact when it fails. It never sets `continue-on-error`, so a red E2E run
  blocks `CI Success` and therefore CD.
- `web-e2e` (accessibility) builds and starts the API and web apps, seeds, and
  runs the browser accessibility and keyboard smoke tests with Playwright
  (`scripts/ci/web-e2e.sh`). It is filtered by `web_e2e`.
- `migration-safety` runs on pull requests that change `packages/db`. If a new
  migration contains destructive statements
  (`scripts/ci/check-destructive-migrations.sh`) it lists them in the job
  summary and the job turns red, so the author sees it before merge. It is not
  in `ci-success.needs`, so it does not block merging: a destructive migration
  can be legitimate (see the expand/contract rules in
  [blue-green-migrations.md](blue-green-migrations.md)).
- `ci-success` (`CI Success`) always runs and fails if any job that should have
  run did not succeed.

## Per-workspace matrix

| Workspace                               | lint          | typecheck | tests + coverage (Codecov flag) |
| --------------------------------------- | ------------- | --------- | ------------------------------- |
| `apps/api`                              | root config   | yes       | `test:cov`, `api`               |
| `apps/web`                              | own config    | yes       | `test:cov`, `web`               |
| `apps/workers`                          | root config   | yes       | `test:cov`, `workers`           |
| `apps/mobile`                           | own config    | yes       | `test:cov`, `mobile`            |
| `apps/sanity`                           | studio config | yes       | none                            |
| `packages/utils`                        | root config   | yes       | `test:cov`, `utils`             |
| `packages/validation`                   | root config   | yes       | `test:cov`, `validation`        |
| `packages/types`                        | root config   | yes       | `test:cov`, `types`             |
| `packages/design-tokens`                | root config   | yes       | `test:cov`, `design-tokens`     |
| `packages/db`, `i18n`, `queue`, `query` | root config   | yes       | none (no tests yet)             |

Every workspace defines `lint` and `typecheck`; `pnpm turbo run lint` must
report as many successful tasks as there are workspaces (one per directory with
a `package.json` under `apps/` and `packages/`) and never "No tasks were
executed".

## Lint

- Root `eslint.config.mjs` serves workspaces without a local config (ESLint
  resolves the nearest config upward from the cwd). It parses TypeScript with
  `@babel/eslint-parser` because `typescript-eslint` cannot load on
  TypeScript 7.
  `no-undef`/`no-unused-vars`/`no-redeclare`/`no-dupe-class-members` are off;
  `tsc` is the authority. `.ts` is parsed without `jsx` (it mis-parses `<T>x`).
- `web` and `mobile` keep local configs that import `baseRules` from the root
  config and add react-hooks (`exhaustive-deps` is a warning, so no
  `--max-warnings 0`). `sanity` keeps `@sanity/eslint-config-studio`.
- Backend and package lint =
  `node ../../scripts/lint-changed-files.mjs <dir> && eslint . --max-warnings 0`.
  The first half is the Prettier check on files changed against `BASE_REF`
  (`origin/<PR base>` on pull requests, `origin/main` otherwise), so the job
  needs `fetch-depth: 0`. Do not add a root `lint` script running `eslint .`: it
  would apply the base config to web/mobile/sanity.
- Editing the root config or the changed-files script re-runs lint everywhere
  (turbo `lint` inputs, and every package path filter in `ci.yml`).

## Coverage

- Every vitest config sets a literal `coverage.include` (so files no test loads
  count) and `coverage.thresholds`, a hard gate: a regression fails the job and
  therefore `CI Success`. The floors live in each workspace's
  `vitest.config.ts`; they are set from CI-measured coverage and are not
  repeated here because the numbers change.
- `apps/mobile` measures only the three logic files that have tests
  (`session-storage`, `cart-storage`, `pagination`); the UI is untested, so its
  floor means "no regression". The `types` workspace gates `lines` only (the
  value is in `packages/types/vitest.config.ts`); generated code is deliberately
  unmeasured.
- turbo `test:cov` has `outputs: ["coverage/**"]` so a cache hit restores
  `lcov.info`. New upload steps are preceded by
  `test -f <pkg>/coverage/lcov.info`.
- Codecov upload uses `fail_ci_if_error: false` and Codecov statuses are not
  required checks; the floors are the real gate. Unverified: whether the Codecov
  GitHub App posts statuses/comments on PRs.
- Not covered: mobile bundling (`expo export`) - lint, typecheck and unit tests
  cannot see a Metro resolution failure.

## Guard (`hygiene` job)

`scripts/ci/check-workspace-scripts.mjs` (also `pnpm check:workspaces`) fails if
a workspace lacks `lint`/`typecheck`, if a workspace with a `test` script is not
run by a single-line `run:` in `ci.yml` (`--filter <name>` + `test`/`test:cov`,
no `exec`), or if a test script uses `--passWithNoTests`. It checks that the
text exists, not that the job can trigger, and does not see multi-line `run: |`
blocks. Tests: `node --test scripts/ci/check-workspace-scripts.test.mjs`
(fixtures in `scripts/ci/fixtures/workspace-scripts/`).

## Web E2E (`Web E2E (a11y)` job)

`scripts/ci/web-e2e.sh` starts Postgres, Redis and MinIO, builds `api` + `web`,
seeds, boots both (`api` :3000, `web` :3001) and runs Playwright
(`apps/web/playwright.config.ts`). The job keeps the name `Web E2E (a11y)` so
`check-ci-success.sh` still matches it. It runs when its `web_e2e` path filter
matches, so on a PR check that it was not skipped. Timeout is 35 min; the
Playwright `globalTimeout` is 20 min.

Projects: `mobile-375`, `tablet-768` and `desktop` run the unauthenticated a11y
and responsive specs (they ignore `e2e/flows/`). `setup` logs the seeded seller
in once (`e2e/auth.setup.ts` -> gitignored `e2e/.auth/seller.json`). `flows`
(375x812, Spanish, `retries: 0`) runs the assisted-order journeys in
`e2e/flows/*.spec.ts`: each test creates its own throwaway store and products
through the seller API (web never talks to Postgres), uses a unique phone and a
unique Google code, and finds its rows by those, never by position. The API E2E
suite stays authoritative for rules; flows cover what a person sees.

- **One host.** web, API, `BETTER_AUTH_URL` and `WEB_URL` all use `127.0.0.1`,
  set on the exec lines of `web-e2e.sh` (never in `e2e.env.example`, which feeds
  the API E2E job). A page and API on different hosts are cross-site, so
  `SameSite=Lax` auth and claim cookies would not be sent.
- **Google is simulated.** The API process alone is started with
  `E2E_GOOGLE_STUB=1`, fake `GOOGLE_CLIENT_ID/SECRET` (`*.invalid`) and
  `NODE_OPTIONS=--import scripts/ci/google-stub.mjs`, which answers the OAuth
  token call for codes starting `e2e-`. Playwright cannot route the server-side
  redirect to Google, so `e2e/flows/helpers/google.ts` intercepts the API's own
  `/api/account/google` response and swaps its `Location` for the API callback.
  If the OAuth code starts verifying signatures, flows fail loudly: update the
  stub. The `hygiene` job syntax-checks it, runs its self-test, and fails if
  `google-stub`/`E2E_GOOGLE_STUB` appear outside `scripts/ci`, `apps/web/e2e`,
  `docs` and `ci.yml`, or if `GOOGLE_*` appears in `e2e.env.example`.
- **Rate limits.** All browser contexts share one IP and the in-memory
  throttler. Claims happen in one test; keep new flows well under the per-IP
  caps (claim-ticket, Google start/callback and proof upload are 10/min).
- **Artifacts.** The report and `test-results` are uploaded for 3 days. Traces
  (`retain-on-failure`) can contain cookies, private links and the seed
  password; that is acceptable only because everything is disposable. Never use
  `trace: "on"` or `video: "on"`, and keep `.auth` out of the upload paths.
- **Local run.** `bash scripts/ci/web-e2e.sh` needs Docker; pass
  `WEB_E2E_PLAYWRIGHT_ARGS="--project=flows --repeat-each=3 --workers=1"` to
  narrow it, and `E2E_POSTGRES_PORT`/`E2E_REDIS_PORT` if the defaults are taken.
- **Not covered:** real Google, real phones and in-app browser engines,
  WhatsApp links, the KoreaLexa pilot, seller-side Google login and iOS Safari
  same-site behavior.

### Extra guards

Besides the `hygiene` scripts, three scripts under `scripts/ci/` keep committed
artifacts and migrations honest:

- `check-openapi-drift.sh` (in the `api` job): regenerates the OpenAPI spec and
  fails if it differs, ignoring key order, from the committed
  `apps/api/openapi.json`.
- `check-types-sdk-drift.sh` (in the `types` job): regenerates the Orval SDK in
  `packages/types/generated` and fails if the result differs from what is
  committed.
- `check-destructive-migrations.sh` (the `migration-safety` job above).

## Changing the API contract

The OpenAPI spec and the generated SDK are committed, so `web` can build and
typecheck without booting the API. After changing a controller or a response DTO
of a migrated module:

1. `pnpm --filter api generate:openapi` (builds the API and writes
   `apps/api/openapi.json`).
2. `pnpm --filter @biasmarket/types generate` (regenerates
   `packages/types/generated/**` with Orval, whose version is pinned).
3. Commit both diffs together with the code change.

If you forget, `check-openapi-drift.sh` or `check-types-sdk-drift.sh` fails the
PR and prints the commands above. Never edit `packages/types/generated/**` or
`apps/api/openapi.json` by hand. Details on the SDK shape are in
[`apps/web/AGENTS.md`](../../apps/web/AGENTS.md).

## Adding a path-filtered job (wiring list)

A new path-filtered job must be added in seven places, in one PR: (1) the
`detect-changes` job `outputs`, (2) its `filters:` block, (3) the job, (4)
`ci-success.needs`, (5) the `X_RESULT` env entry, (6) the `X_CHANGED` env entry,
(7) `package_names`/`package_keys` in `scripts/ci/check-ci-success.sh`. A typo
in a filter key makes the script fail on every run and blocks CD. The always-run
`hygiene` job has no changed output; it only has `HYGIENE_RESULT`. Add
`eslint.config.mjs` and `scripts/lint-changed-files.mjs` to package filters.

Two things are special-cased and do not follow the list above exactly: the `e2e`
job's result is checked against an expectation derived from the event type and
the `api_e2e` output rather than a plain changed/skipped pair
(`check-ci-success.sh`), and `web-e2e` is an ordinary filtered job with its own
`web_e2e` filter. Also, `mobile-release.yml` reads the `mobile` filter out of
`ci.yml` at the release tag (`scripts/ci/mobile-release-changes.sh`), so
renaming or restructuring that filter changes which releases build the mobile
app.

## Emergency path

`CI Success` gates `cd.yml` (push to `main` only). If a flaky floor or a
`hygiene` regression blocks a needed deploy, fix or lower the floor in a PR; the
supervised manual path is `infra/vps/deploy.sh` (see [deploy.md](deploy.md)).
The ruleset has admin bypass, so `CI Success` is not an absolute barrier.

## Related

- [deploy.md](deploy.md) for what CD does after `CI Success`.
- [mobile-release.md](mobile-release.md) for release builds.
- [docker-dev.md](docker-dev.md) for running the same checks locally.
