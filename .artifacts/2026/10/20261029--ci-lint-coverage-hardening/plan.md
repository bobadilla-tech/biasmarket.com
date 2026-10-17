# Plan: lint, coverage and CI trust for every workspace

Status: ready (rev 4; final readiness review passed, see `review-log.md` for the
review history and the caveat on the number of consecutive clean rounds)

Date: 2026-10-29. Facts were verified against `origin/main` at `61ba2f82` in a
scratch worktree (see "Probes"). `origin/main` has since moved (`deb62002`: 50
files, new web tests, regenerated `packages/types`, `mobile-release.yml`,
`scripts/ci/mobile-release-changes.sh`). **All numeric baselines (lint finding
counts, coverage figures, floors) must be re-measured on the implementer's fresh
`origin/main` at the start of PR 1 and PR 3**; acceptance criteria compare
against that re-measurement, not against the figures in this document.
Everything else is labeled "assumption". A working reference for the root ESLint
config is saved next to this plan: `eslint.config.reference.mjs`.

## 1. Context and outcome

Request: the user believes not every app uploads coverage, CI is weaker for some
apps/packages than for the "well supported" ones (api, web), and mobile may have
no linting. Improve lint and CI trustworthiness for the rest.

Outcome, for every one of the 13 workspaces
(`apps/{api,mobile,sanity,web,workers}`,
`packages/{db,design-tokens,i18n,query,queue,types,utils,validation}`):

1. a `lint` task exists and really executes (today it is a silent no-op for most
   packages);
2. every test suite that exists runs in CI;
3. coverage is measured honestly (counts files no test loads), uploaded to
   Codecov with a per-workspace flag, and cannot silently regress: floors in the
   vitest config fail the CI job, hence `CI Success` (Codecov statuses are not
   required checks and are not relied on);
4. a small guard makes it hard to add a workspace or test suite that CI ignores.

Explicitly **not** covered: mobile bundling. `expo export` fails on main today
(G9) and the `mobile` job stays green because lint, typecheck and unit tests
cannot see it; the Q3 default leaves it out. `docs/core/ci.md` states this too.

Honest framing: the shared ESLint config (`eslint:recommended` without
`no-undef`/`no-unused-vars`, no type-aware rules) finds almost nothing today (0
findings in most workspaces). Its value is (a) making `lint` actually execute
everywhere, (b) running the existing Prettier changed-files gate in every
workspace, and (c) giving a place to add rules later. It is not a substitute for
`tsc`.

The user's local checkout was stale and dirty at session start (`main` at
`d17af399`, 2 modified files in `apps/mobile`; later observed clean). The
implementer must work from a fresh worktree off `origin/main` and never touch
the user's checkout.

## 2. Current behavior (facts)

Reference setup, "well supported":

- `api` job (`.github/workflows/ci.yml`): lint, typecheck, build, OpenAPI drift
  check, `test:cov`, Codecov upload flag `api`. `web` job: lint, typecheck,
  build, `test:cov`, upload flag `web`. Plus API E2E and Web E2E (a11y).
- `api` "lint" is only `node ../../scripts/lint-changed-files.mjs apps/api`
  (Prettier on files changed vs `origin/main`; **no ESLint**). `web` lint is
  that plus `eslint .` with a jsx-a11y-only config
  (`apps/web/eslint.config.mjs`; react-hooks plugin registered, no rules
  enabled).
- Required check is only `CI Success` (ruleset "Merge Rule": deletion,
  non_fast_forward, required status `CI Success`, integration 15368). The
  ruleset has admin bypass. `scripts/ci/check-ci-success.sh` hard-codes the
  package list (`package_names`/`package_keys`, lines ~35-36) and requires
  `success` when `X_CHANGED=true`, `skipped` when `false`.
- CI triggers: `pull_request: branches: [main]`, `push: main` (with
  `paths-ignore` for `*.md`). Stacked PRs (base != main) get **no CI** today;
  this is a trigger limitation (`ci.yml` line 11), not a design choice, and PR 0
  below removes it. Only two things in CI assume `main` as the PR base: that
  trigger and `lint-changed-files.mjs` (`BASE_REF` defaults to `origin/main`).
  `migration-safety` already uses `github.event.pull_request.base.sha`, and
  `dorny/paths-filter` compares against the PR base on `pull_request` events.
  `cd.yml` deploys only on `workflow_run` success of a `push` CI run on `main`;
  a red `CI Success` blocks the deploy (existing behavior).
- `migration-safety` is a job outside `ci-success.needs` (existing).

Gaps (evidence):

| #   | Gap                                                                                                                                                                                                                                                                                                                         | Evidence                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| G1  | `turbo run lint --filter=<pkg>` is a **no-op** for workers, db, i18n, queue, types, design-tokens, utils, query, validation: no `lint` script. The `workers` and `validation` CI jobs have a "Lint" step that passes checking nothing.                                                                                      | P1                                   |
| G2  | Mobile: lint is `eslint .` with react-hooks only (0 findings), no Prettier gate, shallow checkout. 3 test files / 9 tests exist but the job never runs them or measures coverage.                                                                                                                                           | `ci.yml` job `mobile`; P2            |
| G3  | `design-tokens` (3 files, 11 tests) and `types` (`http.test.ts` only; `test:cov` exists) have tests; their jobs run only build + typecheck.                                                                                                                                                                                 | `ci.yml`; P3                         |
| G4  | Coverage is inflated: no `coverage.include`. Measured statements: web 70.7 -> **50.2**, api 87.2 -> **62.8**, workers 66.7 -> **62.2** once unloaded source files are counted.                                                                                                                                              | P4                                   |
| G5  | Codecov uploads exist only for api, web, workers, utils, validation; `codecov.yml` defines flags only for api/web/utils; `patch: off`; `fail_ci_if_error: false`. `CODECOV_TOKEN` exists. No `codecov/*` status appears on PR #390, so Codecov may not post statuses (unverified; human check). Not a required check.       | `gh pr checks 390`, `gh secret list` |
| G6  | `apps/sanity` (package name `project-cerise-globe`) has no CI job, no `lint`/`typecheck` script. Its `eslint.config.mjs` uses `@sanity/eslint-config-studio` (TS 5). `eslint .` and `tsc --noEmit` pass.                                                                                                                    | P7                                   |
| G7  | `typescript-eslint` cannot load: it throws on TypeScript 7 (root + most workspaces pin `^7.0.2`). api/workers/types/sanity pin TS 5. web/mobile already use `@babel/eslint-parser` for this reason.                                                                                                                         | P5                                   |
| G8  | `--passWithNoTests` in `validation` and `types` test scripts lets a deleted/mis-globbed suite pass.                                                                                                                                                                                                                         | package.json                         |
| G9  | Mobile does not bundle on `origin/main`: `expo export --platform android` fails (`Unable to resolve module ../features/auth/session-context.js`; Metro does not map `.js` to `.tsx`, `tsc` accepts it). `Mobile Release` run 40883868046 (v0.27.0) failed at "Build APK" (cause unconfirmed, log unavailable when checked). | P8                                   |
| G10 | No lint of CI itself (actionlint, shellcheck on `scripts/ci/*.sh`; only DeepSource, not required).                                                                                                                                                                                                                          | repo                                 |

Out-of-scope findings (recorded for the human; see Follow-ups): code scanning
not configured, secret scanning + push protection disabled (repo is public, so
free), no `dependabot.yml` while `dependabot-automerge.yml` auto-merges
patch/minor Dependabot PRs, repo default workflow permissions are `write`,
tag-pinned (not SHA-pinned) actions everywhere including
`codecov/codecov-action` which receives `CODECOV_TOKEN`.

Overlap / collision:

- Open PR #236 (`codex/phase10-beta`, base `codex/phase9-links`, stacked, no CI)
  edits the same `mobile` job in `ci.yml` (adds
  `turbo run test --filter=mobile`, jest + `jest-expo` `test:components`) and
  `apps/mobile/package.json`. Other mobile PRs (#232-#237) touch `cd.yml`,
  release workflows. None are on main.
- `origin/main` recently gained `mobile-release.yml` and `packages/i18n/**` in
  the `mobile` path filter.

## 3. Design

### Lint: one root config, Babel parser

- Root `eslint.config.mjs`, start from `eslint.config.reference.mjs` in this
  folder (ESLint 9 resolves the nearest config from the cwd upward, so packages
  with no local config pick it up; a reviewer verified this from `apps/api`,
  `apps/workers`, `packages/utils`, `packages/db`, and that `metadata.ts` is
  ignored from a package dir). The root `.eslintrc.json` (`root: true`) is
  ignored by flat config; leave it untouched (non-goal to delete). The config is
  `@babel/eslint-parser` with `typescript`, `jsx`, `importAttributes`,
  `decorators-legacy` parser plugins (verified to parse api/workers/packages),
  `@eslint/js` recommended rules with `no-undef`, `no-unused-vars`,
  `no-redeclare`, `no-dupe-class-members` **off**, node+es2025 globals, and
  ignores: `**/dist/**`, `**/coverage/**`, `**/node_modules/**`,
  `**/generated/**`, `**/.next/**`, `**/.expo/**`, `apps/api/src/metadata.ts`,
  `apps/api/openapi.json` (mirror `.prettierignore`; metadata.ts is tracked, 152
  KB, generated, and carries its own `eslint-disable` header that would
  otherwise warn). Also a named export (`baseConfig`) for frontends to reuse.
- Workspaces with local config keep it: **web** (a11y block; add base +
  react-hooks `rules-of-hooks: error`, `exhaustive-deps: warn`; a trial on the
  probe tree gave 0 `rules-of-hooks` findings and 19 `exhaustive-deps` warnings,
  so error is safe; if the fresh measurement finds any `rules-of-hooks`
  findings, keep it at `warn`), **mobile** (react-hooks; add `coverage/**` to
  ignores, adopt base), **sanity** (keep `@sanity/eslint-config-studio`; add
  only `lint`/`typecheck` scripts, do not apply the base).
- `lint` script for backend and packages:
  `node ../../scripts/lint-changed-files.mjs <pkgDir> && eslint . --max-warnings 0`.
  Frontends: same without `--max-warnings 0` (existing 11 `exhaustive-deps`
  findings in web stay warnings; do not fix them in this work).
- Parser plugins by extension (probe: `jsx` on a `.ts` file mis-parses
  `<number>a` assertions with "Unterminated JSX contents"): a `**/*.ts` block
  with `typescript` + `decorators-legacy` + `importAttributes`, and a
  `**/*.{tsx,jsx}` block with `typescript` + `jsx` (+ `importAttributes`);
  `.js/.mjs/.cjs` without `typescript`. State `files` globs explicitly; ESLint
  silently skips unmatched extensions. `eslint.config.reference.mjs` carries the
  joint `typescript+jsx` shape that was measured; split it as described and
  re-run the baselines. The `debugger;` negative check goes into a `.ts` file.
- Prettier gate baseline: `lint-changed-files.mjs` checks only changed files,
  but once it runs in a package the next unrelated edit of a dirty file goes
  red. Currently dirty (reviewer `prettier --check` on tracked files):
  `packages/i18n/{en,es}/marketing.json`,
  `apps/workers/src/jobs/mailer/mailer.core.ts`, `apps/mobile/tsconfig.json`,
  and 5 files in `apps/sanity` (sanity has its own `prettier` key in
  `package.json`: no semicolons, single quotes). Run `prettier --write` on those
  in the PR that adds the gate (i18n, workers: PR 1; mobile: PR 2); re-run
  `prettier --check` on fresh main first. Sanity `lint` is plain `eslint .` (no
  changed-files gate).
- Baseline with the base config (P5/P6): all packages 0 findings except api (10:
  8 are "rule not found" for stale `eslint-disable @typescript-eslint/*`
  directives, 2 real `no-misleading-character-class`) and validation (1 real
  `no-control-regex`). web's 14 (11 `exhaustive-deps`, 2 a11y tabindex, 1
  `security/*`) are unregistered-plugin "rule not found" noise from a probe that
  did not register those plugins; the real web count is whatever the implementer
  measures with web's own config (authoritative; the 14 is not).
- Turbo: `lint` inputs must include the root config and the changed-files script
  for **both** the generic `lint` task and the existing `web#lint` override
  (which replaces, not extends, the generic one). Literal target JSON:
  ```json
  "lint": {
    "inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/eslint.config.mjs",
               "$TURBO_ROOT$/scripts/lint-changed-files.mjs"]
  },
  "web#lint": {
    "inputs": ["$TURBO_DEFAULT$", "eslint.config.mjs",
               "$TURBO_ROOT$/eslint.config.mjs",
               "../../scripts/lint-changed-files.mjs"]
  }
  ```
  (`$TURBO_DEFAULT$` must stay or default file hashing is lost; `$TURBO_ROOT$`
  is valid on turbo 2.11.8, verified.) Check: edit only the root config, lint
  must re-run, not replay.

Rejected: `typescript-eslint` / type-aware lint (G7); oxlint/Biome (new
toolchain, no precedent; revisit when TS 7 plugin support exists); one config
file per workspace (11 near-identical files).

### Guard: `scripts/ci/check-workspace-scripts.mjs` (about 40 lines, no deps)

For each dir in `apps/*`, `packages/*` that has a `package.json` (skip others),
read the real package `name` (sanity is `project-cerise-globe`, not `sanity`):

1. fail if `lint` or `typecheck` script is missing (**ships in PR 1**);
2. fail if a `test` script exists and no non-comment single-line `run:` line in
   `.github/workflows/ci.yml` matches `--filter[ =]<name>(\s|$)` together with
   `\btest(:cov)?(\s|$)` and no `exec` token and not `test:e2e`. Strip `#`
   comments first. It proves the text exists, not that the job can trigger, and
   it misses multi-line `run: |` blocks; both limitations are documented
   (**ships in PR 3**, together with the wiring it checks);
3. fail if any `test`/`test:cov` script contains `--passWithNoTests` (**ships in
   PR 3**, together with its removal).

Rules 2 and 3 cannot ship in PR 1: on main, mobile/design-tokens/types have no
test invocation in CI and types/validation still use `--passWithNoTests`, so
`hygiene` (and `CI Success`) would go red on merge.

Waivers (no `test` script required): `db`, `i18n`, `queue`, `query`, `sanity`,
listed in the script with a reason. Tested with `node --test` and three fixture
trees: PR 1 ships `missing-lint` and `healthy`; PR 3 adds `uncalled-test` and
`pass-with-no-tests` together with rules 2 and 3 (an "uncalled test" check or
fixture in PR 1 would turn `hygiene` red on main). Not implemented (dropped
after review): grep for `coverage.include`, YAML cross-check of
`detect-changes.outputs` vs `ci-success.needs` (no YAML parser dependency; the
wiring list below goes in docs instead).

### Coverage

- Every vitest config: literal `coverage.include` scoped to source only:
  api/workers/utils/validation/design-tokens `src/**/*.ts`; web
  `{app,components,features,hooks,lib}/**/*.{ts,tsx}`; **types has no `src/`**:
  `["http.ts", "index.ts"]`; mobile see below. `coverage.exclude` for
  tests/specs (`**/*.test.*`, `**/*.spec.*`), `*.d.ts`, generated code, test
  dirs, config files. A sloppy `**/*.ts` on api yields 30.8% (pulls in
  test/e2e/config), so exclusions matter. web already has a `coverage` block (no
  include/exclude): extend it.
- `coverage.thresholds` at `floor(measured - 3)` per metric. Local numbers are
  deterministic (two identical runs per app, P9) and reproduce the indicative
  floors (statements/branches/functions/lines): web 47/45/42/48, api
  59/72/31/59, workers 59/32/63/60. CI-vs-local variance is untested, so **set
  the final floors from the first CI run on the PR** and note them in the PR
  body.
- `apps/mobile`, `packages/design-tokens`, `packages/types`,
  `packages/validation` have **no vitest config today**: create them (utils,
  api, workers, web already have one). Mobile and design-tokens also get
  `@vitest/coverage-v8@^4.1.11` (types, validation, utils already have it) and a
  `test:cov` script.
- Per-workspace scoping (reviewer-measured, P10):
  - types: exclude `generated/**` and `orval.config.ts` (generated code is
    deliberately unmeasured; including it gives 4.6%). What remains is `http.ts`
    (35 statements, ~3 points per statement), so use a `lines` floor only.
  - mobile: `src/**/*.{ts,tsx}` measures about 10% (16 files, UI untested), so a
    `floor-3` gate is meaningless. Scope `include` to the tested logic files
    (`src/features/auth/session-storage.ts`,
    `src/features/cart/cart-storage.ts`, `src/features/catalog/pagination.ts`;
    the three test files are `*.test.ts` beside them) and label the floor "no
    regression" in the PR body and `docs/core/ci.md`. Revisit when #236's
    component tests land.
  - design-tokens: unmeasured (plugin not installed in the probe worktree);
    measure after install.
- turbo: add `"test:cov": {"dependsOn": ["^build"], "outputs": ["coverage/**"]}`
  (without `outputs`, a cache hit replays logs but never restores `lcov.info`,
  and the upload silently finds no file). Mobile (needs built
  `@biasmarket/utils`, P2), design-tokens and types jobs run
  `pnpm turbo run test:cov --filter=<name>` (design-tokens and types have no
  workspace deps, so `^build` is a harmless no-op that keeps the jobs uniform).
  Each new upload step is preceded by a `test -f <path>/coverage/lcov.info` step
  so a missing report fails loudly even with `fail_ci_if_error: false`. Existing
  api/web/workers/utils/validation steps stay unchanged.
- Codecov uploads (flags `mobile`, `design-tokens`, `types`); `codecov.yml`
  defines all 8 flags with `paths`, `carryforward: true`, per-flag project
  status (`target: auto`, `threshold: 1%`), informational patch status.
- Remove `--passWithNoTests` from `validation` and `types`.
- `fail_ci_if_error` stays `false`.

### CI wiring

A new **path-filtered** job (sanity) must be added in seven places: (1) the
`detect-changes` job `outputs`, (2) its `filters:` block, (3) the job itself,
(4) `ci-success.needs`, (5) the `X_RESULT` env entry, (6) the `X_CHANGED` env
entry, (7) the `package_names`/`package_keys` arrays in
`scripts/ci/check-ci-success.sh`. The always-run `hygiene` job has no changed
output, so it gets its own branch in the script (`HYGIENE_RESULT` must be
`success`; added to `needs` and env, not to the arrays). Wiring for a job lands
in the same PR as the job, never staged across PRs. A typo in a filter key makes
the output empty and the script fails every run, so verify with the
synthetic-env matrix (Test strategy).

- Every job whose `lint` script calls `lint-changed-files.mjs` needs
  `fetch-depth: 0` (it diffs against `origin/main` and exits 1 without a base
  ref): db, i18n, queue, types, design-tokens, utils, query **and the existing
  `workers` and `validation` jobs** (their Lint steps are no-ops today on a
  shallow checkout and would go red once the script exists). Same PR as the lint
  script. Mobile's Prettier gate and `fetch-depth: 0` ship together in PR 2; PR
  1 must not give mobile a Prettier gate.
- Path filters: add `eslint.config.mjs` and `scripts/lint-changed-files.mjs` to
  every **package** filter (api, web, workers, db, i18n, queue, types,
  design-tokens, utils, validation, query, mobile, and the new `sanity`),
  otherwise a rule change that touches no package merges without any package
  being linted. Decision: **not** to `web_e2e`/`api_e2e` (a lint-config edit
  should not boot the Playwright/API E2E stacks).
- `sanity` exact wiring: `detect-changes` output `sanity`; filter paths
  `apps/sanity/**`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`,
  `package.json`, `.github/workflows/ci.yml`, `eslint.config.mjs`,
  `scripts/lint-changed-files.mjs`; job key `sanity`, name `Sanity`,
  `timeout-minutes: 15`; env keys `SANITY_RESULT`, `SANITY_CHANGED`; label
  `"Sanity"` / key `SANITY` in the script arrays. Scripts in
  `apps/sanity/package.json`: `"lint": "eslint ."` (no Prettier gate there, so
  no `fetch-depth: 0`) and `"typecheck": "tsc --noEmit"` (sanity is the only
  workspace missing `typecheck`).
- `hygiene` exact commands: `pnpm install --frozen-lockfile` is not needed (the
  script and `node --test` are dependency-free); steps are `actions/checkout`,
  `actions/setup-node`, then `node scripts/ci/check-workspace-scripts.mjs` and
  `node --test scripts/ci/check-workspace-scripts.test.mjs` (fixtures in
  `scripts/ci/fixtures/workspace-scripts/{missing-lint,uncalled-test,healthy}/`).
  The root script `check:workspaces` = the first command. Escape regex
  metacharacters in package names (`@biasmarket/utils`).
- Root `eslint.config.mjs` applies to web/mobile/sanity files if ESLint is run
  from the repo root; do not add a root `lint` script calling `eslint .`.
  Documented in `docs/core/ci.md`.
- `sanity` job: lint + `tsc --noEmit` (no `sanity build`, it needs project env).
- `hygiene` job (always run, `permissions: contents: read`, no secrets): guard
  script + its `node --test`. Later (PR 4) actionlint + shellcheck.

### Workflow lint (PR 4, small, optional)

actionlint pinned by version with a **committed sha256** and fetched with
`curl --proto '=https' --tlsv1.2 -fsSL` (no piping an install script into bash);
shellcheck (preinstalled on ubuntu-latest) over `scripts/ci/*.sh` only. Not
`infra/vps/*.sh`: those are the production deploy scripts; any fix there is
behavioral and needs its own supervised PR (deploy.md). Findings in scope are
fixed or silenced with `# shellcheck disable=SCxxxx # reason`, never logic
changes.

### Mobile bundle smoke (PR 5, conditional on Q3)

`expo export --platform android --dev false` step in the `mobile` job; fails
today on main (G9). Only ships together with the fix.

### Non-goals

Rewriting tests, raising coverage beyond floors, tests for db/i18n/queue/query,
type-aware lint, switching linters, changing "Prettier on changed files only",
making Codecov or CodeQL required, merge queue, branch protection, jest/native
component tests/Maestro (PR #236), `cd.yml`/`mobile-release.yml`/`infra/vps`,
CodeQL / `security.yml` / `dependabot.yml` (Follow-ups).

## 4. Files

Add: `eslint.config.mjs` (root); `scripts/ci/check-workspace-scripts.mjs` and
its `.test.mjs` + fixtures; `docs/core/ci.md`; `vitest.config.ts` in
`apps/mobile`, `packages/design-tokens`, `packages/types`,
`packages/validation`.

Change: root `package.json` (devDeps `eslint`, `@eslint/js`,
`@babel/eslint-parser`, `globals`; script `check:workspaces`); per-workspace
`package.json` (`lint`, `typecheck`, `test:cov`, devDeps); vitest configs of
api, workers, web, utils; `apps/web/eslint.config.mjs`,
`apps/mobile/eslint.config.mjs`; `turbo.json`; `codecov.yml`;
`.github/workflows/ci.yml`; `scripts/ci/check-ci-success.sh`; `pnpm-lock.yaml`;
about 12 source lines (3 real findings, stale directives); `CLAUDE.md` (docs
link and the CI wiring rule).

Remove: nothing.

## 5. PR stack

PR 0 first: make CI run for every pull request, so the rest of the stack can be
**stacked normally** (each PR based on the previous one) and still gets full CI.
Until PR 0 is merged to `main`, PRs 1+ must base on `main`; after it merges,
stack freely. Merge in order; when a lower PR is squash-merged, retarget and
rebase the next one (`gh pr edit <n> --base main`,
`git rebase --onto origin/main <old-base>`). `ci.yml` conflicts between PRs are
expected and small.

| PR | Branch                                 | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Must not change                                     |
| -- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 0  | `ci/run-on-all-prs`                    | in `ci.yml`: `pull_request:` without `branches: [main]` (all base branches); lint steps set `BASE_REF: origin/${{ github.base_ref }}` on `pull_request` events (default `origin/main` on push) so a stacked PR is Prettier-checked only on its own diff; `fetch-depth: 0` already fetches the base branch; verify `check-ci-success.sh` event logic unchanged (E2E expectation depends on `pull_request` + `api_e2e` only). `concurrency` group is per ref, fine. No required-check change (ruleset targets `main` only). | gating logic, `cd.yml` (still push-to-main only)    |
| 1  | `ci/lint-everywhere`                   | root eslint config; lint/typecheck scripts for all workspaces; fix 3 findings + stale directives; guard script with **rule 1 only** + tests; `sanity` and `hygiene` jobs with full wiring; Lint steps + `fetch-depth: 0` (incl. workers, validation); path-filter additions; turbo lint inputs; **lockfile** (root devDeps)                                                                                                                                                                                               | web/mobile eslint rules, vitest configs, mobile job |
| 2  | `ci/lint-frontends`                    | web + mobile adopt base/react-hooks; mobile Prettier gate + `fetch-depth: 0`; mobile `coverage/**` ignore                                                                                                                                                                                                                                                                                                                                                                                                                 | backend/package lint                                |
| 3  | `ci/coverage-everywhere`               | vitest configs (create 4, extend 4) with include/exclude/thresholds; `test:cov` turbo task with `outputs`; mobile/design-tokens/types test+upload (+ lcov-exists check); `codecov.yml`; drop `--passWithNoTests`; guard rules 2 and 3; lockfile; `docs/core/ci.md` (matrix, wiring list, floors, Codecov caveat, emergency manual deploy path) + CLAUDE.md link                                                                                                                                                           | lint config                                         |
| 4  | `ci/workflow-lint`                     | actionlint + shellcheck in `hygiene`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | existing gating logic                               |
| 5  | `ci/mobile-bundle-smoke` (conditional) | `expo export` step + `.js`-specifier fix, only if Q3 = yes                                                                                                                                                                                                                                                                                                                                                                                                                                                                | anything outside `apps/mobile` and the mobile job   |

PRs 2-4 are independent of each other. Deviation from the skill's "docs first"
rule: the only doc is `docs/core/ci.md`, which describes the final state and has
no verification value on its own, so it ships in PR 3. No skills/tooling PR is
needed.

## 6. Steps and completion signals

Per PR: `git worktree add ../bm-<slug> -b <branch> origin/main`;
`pnpm install --frozen-lockfile` (PR 1 and PR 3 change dependencies: run
`pnpm
install` and commit `pnpm-lock.yaml` in the same PR, or every CI job fails
on `--frozen-lockfile`). The committed lockfile is Prettier-formatted (double
quotes) but pnpm 10.11.0 rewrites it single-quoted (about 29.6k changed lines in
the probe): after `pnpm install` run
`pnpm exec prettier --write pnpm-lock.yaml`, require the lockfile diff to be
small (about 160 lines) and limited to the intended deps, then re-run
`pnpm install --frozen-lockfile` to confirm.

PR 1:

1. Root devDeps + `eslint.config.mjs`. Signal: `pnpm exec eslint packages/utils`
   from root and from `packages/utils` both exit 0 (cwd-lookup verified).
2. Per workspace `lint`/`typecheck` scripts. Signal: `pnpm turbo run lint`
   prints "Tasks: 13 successful, 13 total" (13 = count of `package.json` in
   `apps/*` and `packages/*`; never "No tasks were executed").
3. Fix the 3 real findings (2 `no-misleading-character-class` in api, 1
   `no-control-regex` in validation) without changing matching behavior (inline
   disable with reason if the pattern is intentional); delete stale
   `@typescript-eslint/*` directives. Re-run the baseline with the final config
   (ESLint 9 also reports _unused_ `eslint-disable` directives as warnings,
   which fail `--max-warnings 0`). Signal: lint clean with 0 warnings on backend
   and packages; the touched validators' tests still pass.
4. Guard script + `node --test`; `sanity` + `hygiene` jobs and all wiring.
   Signal: synthetic-env matrix for `check-ci-success.sh` behaves.
5. Negative checks in scratch only: remove a `lint` script -> guard fails;
   inject `debugger;` (rule `no-debugger`) into a `.ts` file of a package ->
   lint fails; unformatted changed file -> Prettier gate fails; edit only the
   root config -> turbo re-runs lint.

PR 2: measure web's true finding count first. Signal: web lint exit 0 with
warnings allowed; mobile lint exit 0; Prettier gate active.

PR 3: set provisional floors from local numbers, push, read CI's reported
numbers, finalize `floor(ci - 3)`. Signal: every `test:cov` green; setting any
floor to measured+1 (scratch) turns the job, and so `CI Success`, red; Codecov
upload steps green for all 8 flags.

PR 4: Signal: `hygiene` green on main-equivalent tree; a deliberate `${{ foo }}`
typo in a scratch workflow turns it red.

PR 5: re-confirm failure on fresh main; fix; `expo export` exits 0 locally and
in CI.

## 7. Test strategy

- Guard: `node --test` with three fixture trees (see above).
- `check-ci-success.sh`: run with synthetic env for every package including the
  new `sanity`: changed+success, changed+failure, unchanged+skipped,
  unchanged+success; and `hygiene` success/failure; empty `*_CHANGED` fails.
- Lint: baselines above; negative injections named in Steps.
- Coverage: floors, negative check, and a double run for determinism.
- Workflows: new `hygiene`/`sanity` jobs use `permissions: contents: read`, no
  secrets, no `pull_request_target`; any new third-party action is pinned by
  commit SHA (existing tag pins are not changed here).
- Regression, in each PR worktree: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm build` from the repo root (label planned vs run in the PR body).
- Tenant isolation / PII: no data paths touched; N/A.

## 8. Risks and edge cases

- **Wiring typos wedge everything.** A bad `detect-changes` key or env entry
  makes `check-ci-success.sh` fail on every PR and push, so CD never fires.
  Mitigation: wiring + script + synthetic matrix land together.
- **CI Success now gates CD more tightly.** A coverage floor or `hygiene`
  regression on a push to `main` blocks the deploy; `workflow_dispatch` CI runs
  are not accepted by the CD gate. Emergency path is manual
  `infra/vps/deploy.sh` (documented in `docs/core/ci.md`). Keep new jobs
  deterministic and offline after install; floors keep a 3-point margin.
- **Lint cache** (turbo inputs for generic and `web#lint`, see Design). The
  Prettier changed-files gate depends on the git diff against the base, which is
  not a turbo input, so turbo can replay a stale Prettier result; api already
  behaves this way (existing behavior, accepted).
- **Unnamed consumer: `scripts/ci/mobile-release-changes.sh`** reads the
  `mobile` path filter out of `ci.yml` with `yq`
  (`.jobs."detect-changes".steps[] | select(.id=="filter") | .with.filters | .mobile[]`).
  Adding the lint-config paths to that filter (PR 1) makes a lint-config-only
  change count as a mobile change for release builds. Small effect (root
  `package.json`/`turbo.json` are already in the filter). Keep the yq path
  valid; add a line to `docs/core/mobile-release.md`.
- **PR 0 cost and noise.** CI now runs for every PR base branch (more runner
  minutes; stacked-PR pushes cancel only their own earlier runs via the existing
  per-ref concurrency group). `CODECOV_TOKEN` is unchanged for same-repo PRs.
  Prettier on a stacked PR is checked against its own base, so lower-PR files
  are not re-flagged. Rollback: re-add `branches: [main]`. _PR 0 was added after
  the last full review round (user feedback) and has not been re-reviewed by
  subagents; the implementer's first PR review should cover it._
- **Open Dependabot queue.** New floors/guards can leave Dependabot PRs red or
  stalled (auto-merge waits); announce the merge.
- **Fork PRs / secrets.** `CODECOV_TOKEN` unavailable to forks and Dependabot;
  upload tolerates failure; floors still gate.
- **Flaky floors.** Lower the floor; never add retries.
- **Mobile collision with #236** (same job, `package.json`, a jest/vitest
  split): whichever lands second keeps both steps;
  `apps/mobile/vitest.config.ts` must exclude jest component tests. Note in both
  PR bodies.
- **Stale local checkout**, **`packages/ui`** (untracked local dir without
  `package.json`; guard skips such dirs).
- **Blue/green:** no runtime code or migrations touched (PR 5's fix is
  build-time).
- **Rollback:** every PR is independently revertible; reverts only loosen CI.
- Admin bypass on the ruleset means `CI Success` is not an absolute barrier;
  recorded in docs, no change.

## 9. Acceptance criteria

1. `pnpm turbo run lint` prints `Tasks: N successful, N total` where N equals
   the number of `package.json` files in `apps/*` and `packages/*` (13 today),
   and never "No tasks were executed".
2. `node scripts/ci/check-workspace-scripts.mjs` exits 0 on the tree and
   `node --test` passes, with the negative fixtures that exist at that PR (PR 1:
   missing lint; PR 3: also uncalled test and `--passWithNoTests`).
3. Every workspace with a `test` script is run in a CI job (guard rule 2 green);
   in the PR 3 CI log each new upload step shows its `lcov.info` found
   (`test -f` step green) and the Codecov action step green for flags `mobile`,
   `design-tokens`, `types`. Seeing the flags in the Codecov UI is an extra
   manual check, not an acceptance gate.
4. `coverage.include` set in each vitest config; local totals for
   web/api/workers match the "include-scoped" baseline the implementer
   re-measured on fresh `origin/main` **with the final include/exclude lists
   applied** at the start of PR 3 (within 1 point; G4 numbers are indicative,
   from `61ba2f82`, and move once generated/excluded files are removed); PR 3
   body lists the measured and floor values for all 8 workspaces (mobile, types,
   design-tokens included).
5. Raising any floor to measured+1 fails its job: evidence is the red job and
   the resulting red `CI Success` URL from a scratch PR (or local exit code).
6. `sanity`/`hygiene` are wired in all places listed under CI wiring; the
   synthetic-env matrix passes locally. After merge, a scratch docs-only PR
   passes `CI Success` (PRs have no `paths-ignore`; pushes do).
7. `grep -r passWithNoTests apps packages --include=package.json` is empty (PR
   3).
8. (PR 4) actionlint and shellcheck pass on the tree.
9. (PR 5, conditional) `expo export --platform android` exits 0 in CI.

## 10. Open questions (defaults)

- **Q1. Coverage floors as hard gate?** Default yes, `floor(CI-measured - 3)`.
- **Q2. CodeQL, secret scanning, `dependabot.yml`, `pnpm audit`?** Default: not
  in this work; see Follow-ups.
- **Q3. Fix the mobile `.js`-specifier bundle failure (G9)?** It is product code
  in `apps/mobile`, a scope change; PRs 1-4 are unaffected by the answer.
  Default: **no**, PR 5 is not started; the implementer's final message reports
  the finding and run link. If the user answers yes: minimal mechanical fix
  (drop `.js` from relative imports of `.ts`/`.tsx` files under
  `apps/mobile/src`), verified with `expo export`, mobile tests and typecheck.
- **Q4. PR 4 (workflow lint) at all?** Default yes if findings are trivial
  (under ~15 total across `.github/workflows/*.yml` and `scripts/ci/*.sh`, which
  now includes `mobile-release-changes.sh`); else skip and report counts.
- **Q5. Stale local checkout / earlier dirty mobile files.** Default: untouched.

## Follow-ups (not in this plan, for a human or a later plan)

- Enable secret scanning + push protection (free for public repos); set repo
  default workflow permissions to read; choose CodeQL via UI default setup
  **or** a workflow, never both.
- Before adding any `github-actions` Dependabot config: gate
  `dependabot-automerge.yml` on `package-ecosystem != github_actions` (a
  `cd.yml` bump merging on a near-empty green CI would deploy unreviewed);
  SHA-pin `codecov-action` and `dorny/paths-filter`.
- Shellcheck on `infra/vps/*.sh` with supervised deploy testing.
- Confirm Codecov GitHub App installed and statuses/comments appear.

## Probes

Scratchpad:
`/private/tmp/claude-501/-Users-ultirequiem-ulti-biasmarket-com/52b58e59-f0fe-456d-9cd9-4a28637637b0/scratchpad/`
(worktree `wt` at `origin/main` 61ba2f82; `wt/eslint.probe.mjs`,
`wt/eslint.probe2.mjs`; uncommitted; worktree removed at session end).

- **P1** `turbo run lint` over 8 packages: "No tasks were executed".
- **P2** `pnpm --filter mobile test` unbuilt fails
  (`Cannot find package
  '@biasmarket/utils/cart'`); after `turbo build` 3
  files / 9 tests pass, coverage 82.69% stmts (loaded files only). Changed:
  mobile must go through turbo.
- **P3** design-tokens 11 tests pass; types `test:cov` 76.47%.
- **P4** `test:cov` as configured vs with `--coverage.include`: api
  87.15->62.78, web 70.7->50.23, workers 66.66->62.22; utils 99.6. Durations api
  3.8 s, web 11.1 s.
- **P5** root `typescript-eslint` 8.67 throws on TS 7; Babel-parser baseline
  counts as in Design. Verified by a reviewer: Babel config parses api/workers
  decorators.
- **P6** web 14 / mobile 0 findings.
- **P7** sanity `eslint .` and `tsc --noEmit` pass.
- **P8** `expo export --platform android` on main fails in ~5 s with the `.js`
  specifier error; Mobile Release run 40883868046 failed at "Build APK".
- **P9** (reviewer) two identical coverage runs per app with `src`-scoped
  include reproduce the floors; cross-OS variance untested.
- A first eslint probe hung on a stray `cat > file` in my script; discarded.
