# Implementation handoff: lint, coverage and CI trust for every workspace

## Mission

Make lint and CI trustworthy for all 13 workspaces of the Bias Market monorepo:
`lint` really runs everywhere, every existing test suite runs in CI, coverage is
measured honestly and uploaded per workspace, and floors in the vitest configs
fail CI on regression. Deliver as PR 0 plus 4 PRs (a 5th is conditional). Do not
merge anything.

## Context

- Read first: `CLAUDE.md` (hard rules: pnpm only, ESM only, no tenant data
  paths), then the plan folder
  `.artifacts/2026/10/20261029--ci-lint-coverage-hardening/` : `plan.md` (the
  authority, with probes and facts), `review-log.md` (44 findings already
  resolved), `eslint.config.reference.mjs` (starting point for the root config).
  If `.artifacts/` is untracked in your checkout, read it from the path the user
  gives you.
- Base: `origin/main`. Facts in the plan were verified at `61ba2f82`;
  `origin/main` has moved. **Re-measure every baseline you rely on** (lint
  counts, coverage totals, Prettier-dirty files) on your fresh `origin/main`
  before using it.
- The user's main checkout may be stale or dirty. Do **not** work there. Create
  a worktree per PR: `git worktree add ../bm-<slug> -b <branch> origin/main`.
- CI (`.github/workflows/ci.yml`) today runs only for PRs targeting `main`; PR 0
  fixes that. Open PR 0 first against `main`. Until PR 0 is merged, base PRs 1+
  on `main` (and rely on local scripts for verification); once PR 0 is on
  `main`, PRs 1-4 may be stacked and will get full CI. Stacked or not, never
  push to a branch you did not create.
- Open PR #236 (mobile jest component tests, base `codex/phase9-links`) edits
  the same `mobile` CI job and `apps/mobile/package.json`; do not touch its
  branch.

## Decisions already made

- Single root `eslint.config.mjs`, `@babel/eslint-parser` (typescript-eslint
  cannot load on TypeScript 7). `no-undef`/`no-unused-vars` off; `tsc` is the
  authority.
- Parser plugins per extension: `.ts` gets `typescript`+`decorators-legacy`, no
  `jsx`; `.tsx/.jsx` get `jsx`.
- Backend/packages lint:
  `node ../../scripts/lint-changed-files.mjs <dir> && eslint . --max-warnings 0`.
  web/mobile: no `--max-warnings 0`; `exhaustive-deps` stays `warn`. Sanity
  keeps `@sanity/eslint-config-studio` and `lint` = `eslint .`.
- Coverage floors = `floor(CI-measured - 3)` per metric as a hard gate; set
  provisionally from local runs then finalized from the PR's CI numbers.
  `fail_ci_if_error` stays `false`.
- Lint-config path filters go on package filters only, not `web_e2e`/`api_e2e`.
- Guard rules: rule 1 in PR 1; rules 2 and 3 only in PR 3.
- Out of scope: CodeQL, `security.yml`, `dependabot.yml`, `infra/vps/*.sh`
  shellcheck, `cd.yml`, `mobile-release.yml`, fixing web `exhaustive-deps`,
  mobile bundling.

## Reviewed plan

Follow `plan.md` sections 3, 5, 6 exactly. Summary:

0. **PR 0 `ci/run-on-all-prs`** : `pull_request:` trigger without
   `branches: [main]`; `BASE_REF: origin/${{ github.base_ref }}` for the lint
   steps on `pull_request` events; confirm with a scratch stacked PR (base =
   another branch) that all jobs run and `CI Success` reports. Plan section 5.
1. **PR 1 `ci/lint-everywhere`** : root eslint config; `lint` + `typecheck`
   scripts in all 13 workspaces (sanity gets `typecheck`); fix 3 real findings +
   stale directives; guard script (rule 1) + `node --test` with fixtures
   `missing-lint` and `healthy`; `sanity` + `hygiene` jobs wired in all 7
   places + the separate `HYGIENE_RESULT` branch in
   `scripts/ci/check-ci-success.sh`; `fetch-depth: 0` (including existing
   `workers` and `validation` jobs); lint-config paths in package filters; turbo
   `lint` / `web#lint` inputs; format the dirty files in i18n/workers; lockfile
   (prettier it, small diff).
2. **PR 2 `ci/lint-frontends`** : web + mobile adopt base + react-hooks; mobile
   Prettier gate + `fetch-depth: 0`; mobile `coverage/**` ignore; format
   `apps/mobile/tsconfig.json`.
3. **PR 3 `ci/coverage-everywhere`** : create vitest configs for mobile,
   design-tokens, types, validation; extend api/workers/web/utils; literal
   `include`/`exclude`/`thresholds`; turbo `test:cov` with
   `outputs: ["coverage/**"]`; mobile/design-tokens/types
   `pnpm turbo run test:cov --filter=<name>` + `test -f` lcov check + Codecov
   upload; `codecov.yml` flags for all 8; remove `--passWithNoTests`; guard
   rules 2 and 3 + fixtures; `docs/core/ci.md` and the CLAUDE.md link; lockfile.
4. **PR 4 `ci/workflow-lint`** : actionlint (pinned version + committed sha256,
   no curl-pipe) and shellcheck over `scripts/ci/*.sh` in `hygiene`. Only if
   findings are trivial (under ~15); otherwise skip and report counts.
5. **PR 5 `ci/mobile-bundle-smoke`** : **do not start** unless the user said yes
   to Q3. If yes: re-confirm `expo export --platform android --dev false` fails
   on fresh main, drop `.js` from relative imports of `.ts/.tsx` files under
   `apps/mobile/src`, add the step.

## Review findings to preserve

- A bad `detect-changes` key or env entry makes `check-ci-success.sh` fail on
  every PR/push and blocks CD: wiring + script + synthetic-env matrix land
  together.
- `pnpm turbo run lint` must print `Tasks: 13 successful, 13 total` (13 =
  `package.json` count in `apps/*`, `packages/*`), never "No tasks were
  executed".
- `test:cov` turbo task needs `outputs`, else lcov is not restored on cache hit.
- Mobile tests need built workspace deps: always via turbo.
- `lint-changed-files.mjs` needs `origin/main` (shallow checkout fails).
- Don't add a root `lint` calling `eslint .` (would apply base to
  web/mobile/sanity).
- New third-party actions pinned by commit SHA; new jobs
  `permissions: contents: read`, no secrets.

## Verification

Planned (label as run only if you ran them):

- PR 0: open a scratch PR whose base is another branch and check the Actions run
  (all path-filtered jobs, `CI Success`); confirm lint's changed-file list
  contains only that PR's files.
- Per PR from repo root: `pnpm install --frozen-lockfile`, `pnpm lint`,
  `pnpm typecheck`, `pnpm test`, `pnpm build`
  (`DATABASE_URL=postgresql://build:build@localhost:5432/build` is the repo
  default; root scripts set it).
- PR 1: `pnpm turbo run lint` (13/13);
  `node scripts/ci/check-workspace-scripts.mjs`;
  `node --test scripts/ci/check-workspace-scripts.test.mjs`; synthetic-env
  matrix for `bash scripts/ci/check-ci-success.sh` (each package:
  changed+success, changed+failure, unchanged+skipped, unchanged+success;
  hygiene success/failure; empty `*_CHANGED` fails); negative checks in scratch
  (remove a `lint` script; `debugger;` in a `.ts` file; unformatted changed
  file; edit only root eslint config and confirm turbo re-runs lint).
- PR 3: each `test:cov` green; floor set to measured+1 fails (scratch); double
  run deterministic; lcov present for all 8 flags.
- PR 4: deliberate `${{ foo }}` typo in a scratch workflow turns actionlint red.

## Acceptance criteria

`plan.md` section 9 (9 numbered criteria; 8 and 9 are PR 4 / conditional PR 5).

## Constraints and blockers

- Do not edit the user's main checkout, `cd.yml`, `mobile-release.yml`,
  `infra/vps/*`, or anyone else's open PR branches. Do not push to `main`.
- Stop and ask the user if: a baseline differs a lot from the plan (for example
  web true lint count above ~30, coverage floors that would be below 20%), the
  guard or `check-ci-success.sh` change needs a design that differs from the
  plan, or PR 4 findings exceed ~15.
- Unconfirmed defaults (use these if the user did not answer): Q1 floors hard
  gate: yes; Q2 security/dependabot: out of scope; Q3 mobile bundle fix: no; Q4
  PR 4: yes if trivial; Q5 stale local checkout: untouched.

## Stack base policy

PR 0 bases on `main`. PRs 1-4 base on `main` until PR 0 has merged; afterwards
they may stack (each on the previous). Never push to `main`, `codex/*`, or
another author's branch. When a lower PR merges: `git fetch origin`,
`git rebase --onto
origin/main <old-base-branch>`, `gh pr edit <n> --base main`;
resolve `ci.yml` conflicts.

## PR instructions

Open PRs in order 0, 1, 2, 3, 4 (5 only if approved), titled `ci: <summary>`
(conventional commits as in `git log`), each body: what changed, the exact
commands run with results, the measured baselines and final floors (PR 3), which
CI jobs the PR touches, and a note about the #236 overlap (PRs 2, 3). End commit
messages and PR bodies with the attribution lines from your session's system
reminder. Do not merge. No separate skills/tooling PR is needed.

## First action

Read `CLAUDE.md`, `plan.md`, `review-log.md`, `eslint.config.reference.mjs`. Run
`git status`, `git fetch origin`, record `git rev-parse origin/main`. Create the
PR 1 worktree, run `pnpm install --frozen-lockfile`, re-measure the baselines
(`pnpm turbo run lint --filter=...` no-op check, ESLint counts with the
reference config split by extension, `prettier --check` on the packages that
gain a gate), then start PR 1 step 1.
