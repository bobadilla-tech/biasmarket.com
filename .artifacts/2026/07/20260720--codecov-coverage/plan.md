# Codecov coverage reporting in CI

## Context

User pasted a Go project's CI workflow (test + `go tool cover` summary +
`codecov/codecov-action@v7` upload) as a template and asked for an equivalent in
this repo: send coverage reports to Codecov, and run lint/tests on PRs and
merges to `main`.

The lint/test-on-PR-and-main part was already fully built —
[2026-07-16-modern-ci.md](./2026-07-16-modern-ci.md) put a path-filtered,
per-package `ci.yml` in place that runs on both `push: [main]` and
`pull_request: [main]`. Nothing to add there. The actual gap was Codecov: no
package had ever generated an `lcov` file, and no workflow step uploaded
anything.

Auditing which packages could even support this: only `apps/api` had
`@vitest/coverage-v8` installed and a `test:cov` script. `apps/web` and
`packages/utils` have real test suites (`__tests__/page.test.tsx`,
`src/strings`/`src/whatsapp` specs) but no coverage tooling wired at all.
`packages/db`, `i18n`, `types`, `ui` have no tests in CI to begin with (their
jobs only build/typecheck) — nothing to instrument there.

## Decisions

- **Coverage only where tests exist.** Wired `api`, `web`, and
  `@biasmarket/utils` — skipped `db`/`i18n`/`types`/`ui` since they have no test
  step in CI and inventing one would be unrequested scope creep.
- **`lcov` reporter explicitly, not left to Vitest's default.** Vitest's
  v8-provider defaults to `text`/`html`/`clover`/`json`, none of which is the
  format Codecov's uploader expects by default. Added
  `reporter: ['text',
  'lcov']` to each package's `vitest.config.ts` instead of
  relying on Codecov to parse `clover.xml`.
- **Matched `@vitest/coverage-v8` version to each package's own `vitest` version
  (`^3.2.4`)**, not just whatever `^latest` resolves to — avoids a
  provider/runner mismatch across the three packages.
- **Per-package `flags` on the Codecov upload** (`api`/`web`/`utils`) so
  Codecov's dashboard attributes coverage deltas to the right package instead of
  one blended number.
- **No `if: always()` on the upload step.** Matches the pasted template's actual
  behavior (upload only ran after tests, template's `always()` was on the
  _summary_ step, not upload) — an `always()` upload would try to send a
  `lcov.info` that was never generated if an earlier step (lint/typecheck/
  build) failed first.
- **`coverage/` added to root `.gitignore`** rather than per-package —
  `apps/web` already had its own `/coverage` ignore; `api` and `utils` had none,
  so a single root entry covers all current and future packages instead of
  chasing this per-directory.

## What changed

**New:**

- `packages/utils/vitest.config.ts` — package had no vitest config file at all
  before this; added just enough to declare the `v8`/`lcov` coverage config.

**Edited:**

- `apps/api/vitest.config.ts` — `coverage.reporter: ['text', 'lcov']` added
  (provider/include already existed).
- `apps/web/package.json` — added `@vitest/coverage-v8` devDependency and a
  `test:cov` script (`vitest run --coverage`).
- `apps/web/vitest.config.ts` — added
  `coverage: { provider: 'v8', reporter:
  ['text', 'lcov'] }`.
- `packages/utils/package.json` — added `@vitest/coverage-v8` devDependency and
  a `test:cov` script.
- `.github/workflows/ci.yml` — in the `api`, `web`, and `utils` jobs, replaced
  the plain `Test` step with a `Test with coverage` step running `test:cov`,
  followed by a `codecov/codecov-action@v7` step uploading that package's
  `coverage/lcov.info` under its own `flags` value. Requires a `CODECOV_TOKEN`
  repo secret (not yet added — user needs to set this in GitHub repo settings).
- `.gitignore` — added `coverage/`.

## Verification

Ran both newly-wired packages locally, clean:

```
pnpm --filter @biasmarket/utils test:cov   # 13/13 tests pass, 100% coverage, lcov.info generated
pnpm --filter web test:cov                 # suite passes, lcov.info generated (uneven coverage across app routes, expected — most page.tsx files have no tests yet)
```

Confirmed `coverage/lcov.info` produced in both `packages/utils/` and
`apps/web/`, then deleted the generated directories before committing (now
gitignored).

Not yet verified: the actual Codecov upload succeeding on a real GitHub Actions
run — this needs the `CODECOV_TOKEN` secret set on the repo first, and should be
checked on the next push/PR.
