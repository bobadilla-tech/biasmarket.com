# CI: lint, tests and coverage

What `.github/workflows/ci.yml` guarantees per workspace, and the rules that
keep it honest. `CI Success` is the only required check; it fails if any
path-filtered job that should run did not succeed (`scripts/ci/check-ci-success.sh`).

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

Every workspace defines `lint` and `typecheck`; `pnpm turbo run lint` must print
`Tasks: N successful, N total` with N equal to the number of `package.json`
files in `apps/*` and `packages/*` (never "No tasks were executed").

## Lint

- Root `eslint.config.mjs` serves workspaces without a local config (ESLint
  resolves the nearest config upward from the cwd). It parses TypeScript with
  `@babel/eslint-parser` because `typescript-eslint` cannot load on TypeScript 7.
  `no-undef`/`no-unused-vars`/`no-redeclare`/`no-dupe-class-members` are off;
  `tsc` is the authority. `.ts` is parsed without `jsx` (it mis-parses `<T>x`).
- `web` and `mobile` keep local configs that import `baseRules` from the root
  config and add react-hooks (`exhaustive-deps` is a warning, so no
  `--max-warnings 0`). `sanity` keeps `@sanity/eslint-config-studio`.
- Backend and package lint = `node ../../scripts/lint-changed-files.mjs <dir> && eslint . --max-warnings 0`.
  The first half is the Prettier check on files changed against `BASE_REF`
  (`origin/<PR base>` on pull requests, `origin/main` otherwise), so the job
  needs `fetch-depth: 0`. Do not add a root `lint` script running `eslint .`: it
  would apply the base config to web/mobile/sanity.
- Editing the root config or the changed-files script re-runs lint everywhere
  (turbo `lint` inputs, and every package path filter in `ci.yml`).

## Coverage

- Every vitest config sets a literal `coverage.include` (so files no test loads
  count) and `coverage.thresholds`, a hard gate: a regression fails the job and
  therefore `CI Success`. Floors are `floor(CI-measured - 3)` per metric.
- `apps/mobile` measures only the three logic files that have tests
  (`session-storage`, `cart-storage`, `pagination`); the UI is untested, so its
  floor means "no regression". `packages/types` gates `lines` only (35
  statements, generated code deliberately unmeasured).
- turbo `test:cov` has `outputs: ["coverage/**"]` so a cache hit restores
  `lcov.info`. New upload steps are preceded by `test -f <pkg>/coverage/lcov.info`.
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
text exists, not that the job can trigger, and does not see multi-line
`run: |` blocks. Tests: `node --test scripts/ci/check-workspace-scripts.test.mjs`
(fixtures in `scripts/ci/fixtures/workspace-scripts/`).

## Adding a path-filtered job (wiring list)

A new path-filtered job must be added in seven places, in one PR: (1) the
`detect-changes` job `outputs`, (2) its `filters:` block, (3) the job, (4)
`ci-success.needs`, (5) the `X_RESULT` env entry, (6) the `X_CHANGED` env entry,
(7) `package_names`/`package_keys` in `scripts/ci/check-ci-success.sh`. A typo in
a filter key makes the script fail on every run and blocks CD. The always-run
`hygiene` job has no changed output; it only has `HYGIENE_RESULT`.
Add `eslint.config.mjs` and `scripts/lint-changed-files.mjs` to package filters.

## Emergency path

`CI Success` gates `cd.yml` (push to `main` only). If a flaky floor or a
`hygiene` regression blocks a needed deploy, fix or lower the floor in a PR; the
supervised manual path is `infra/vps/deploy.sh` (see `docs/core/deploy.md`). The
ruleset has admin bypass, so `CI Success` is not an absolute barrier.
