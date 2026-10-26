# Modern CI: path-filtered, per-package GitHub Actions

## Context

Repo had no `.github` directory at all — zero CI. The ask was a modern setup
that uses path filtering to know what to lint/typecheck/build/test per push (so
a PR touching only `apps/web` doesn't run `apps/api`'s suite), with **one job
per package/app** so a failure is immediately attributable to the exact part
that broke, not a single monolithic "CI failed" status. Modeled on the sibling
repo `../requiems-api`'s pattern (a `detect-changes` job using
`dorny/paths-filter` → per-app jobs gated on its output → a terminal
`ci-success` gate job for branch protection), adapted here for a homogeneous
pnpm + Turborepo workspace instead of requiems-api's polyglot Go/Rails/Bun
setup.

Turbo only had `build`/`dev`/`lint`/`db:generate` tasks defined — no `test` or
`typecheck` task existed, so CI couldn't have run either even if a workflow file
existed. Root `package.json`'s `test` script was a broken placeholder
(`exit 1`). No Node version was pinned anywhere (only
`packageManager:
pnpm@10.11.0`).

Setting this up surfaced a chain of real, pre-existing bugs that would have made
the new CI red for reasons unrelated to the CI plumbing itself — each confirmed
by actually running the pipeline locally, not just inspecting code, and fixed as
part of this work (user confirmed, each time, that surfacing a new blocker
should be fixed rather than left red):

- 4 broken `apps/api` Jest specs — `ProductsService`/`StoresService` inject
  `PrismaService`, but their specs only provided `[ProductsService]` /
  `[StoresService]` with no `PrismaService` mock, so Nest's DI failed at
  `should be defined`.
- `packages/i18n` had a `"build": "tsc"` script but no `typescript`
  devDependency at all.
- `packages/ui` had no `tsconfig.json`, no `typescript`/`@types/react` deps, and
  its one source file referenced the bare `React` namespace without importing it
  — a real type error once a tsconfig existed to catch it.
- `packages/db`'s `tsconfig.json` had `verbatimModuleSyntax: true` +
  `module: nodenext` with no `"type"` field in its `package.json` — under
  nodenext, TS decides ESM-vs-CJS output per-file based on the nearest
  `package.json`, so this combination made plain `tsc --noEmit` fail outright
  (TS1295). First attempted fix (`"type": "module"`) traded that error for a
  worse one — it made `prisma generate`'s output genuinely ESM, which then broke
  `apps/api`'s Jest suite at runtime
  (`SyntaxError: Unexpected token
  'export'`) since ts-jest/CJS Jest can't load
  an ESM package. Corrected by instead turning `verbatimModuleSyntax` off,
  keeping the package CJS (its default, matching how `apps/api` actually
  consumes it).
- `packages/db/prisma.config.ts` (Prisma-generated) had
  `url: process.env["DATABASE_URL"]`, `string | undefined` against a `string`
  field — passed unnoticed because nothing had ever typechecked this package
  before.
- Jest's default `transformIgnorePatterns` (`/node_modules/`) was silently
  matching `@biasmarket/db`'s resolved path (pnpm symlinks workspace packages
  under `node_modules`), so ts-jest never transformed its raw ESM-flavored `.ts`
  source — same `SyntaxError: Unexpected token 'export'` symptom as above,
  different cause. Fixed with a `transformIgnorePatterns` override scoped to
  allow `@biasmarket/*`.
- `@thallesp/nestjs-better-auth` ships ESM-only (`.mjs`, no CJS build) —
  `apps/api`'s CJS Jest runtime can never `require()` it directly. The two
  controller specs that import it (indirectly, via the controller) needed an
  explicit `jest.mock(...)` stub for `AuthGuard`/`Session`, since real auth
  behavior isn't under test in these unit specs.
- `apps/web` lint had never been run (no CI ever existed) and failed on real
  application code: two `catch (e: any)` blocks, and Next 16's new
  `react-hooks/set-state-in-effect` rule flagging the classic
  fetch-in-`useEffect` pattern on the products page.

## Decisions

- **Dependency-aware path filters, not just per-directory.** `apps/api` depends
  on `packages/db`, `i18n`, `types`, `utils` via `workspace:*`; a change to any
  of those needs to re-run `api`'s job too, not just the package's own job. Same
  for `apps/web` → `i18n`/`types`/`ui`. Every filter also watches root config
  (`pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, root `package.json`,
  the workflow file itself) so a root-level change always triggers full CI.
- **One job per package, not a matrix.** Unlike requiems-api's genuinely
  polyglot jobs, everything here is the same pnpm/Node toolchain — a matrix
  would have been the "clever" choice, but named jobs per package keep
  `needs:`/`if:` wiring and the `ci-success` gate simple to read, and each
  package's step list differs slightly (not every package has `lint`, `ui` has
  no `build`).
- **Added `typecheck` as a first-class CI step everywhere**, even though no
  package had one before — chosen over scoping the CI down to only pre-existing
  scripts, since type-checking a TypeScript monorepo with zero typecheck
  coverage defeats the point of a "modern" CI.
- **Unit tests only for `apps/api`, no e2e in CI.** `test:e2e` needs a real
  Postgres; wiring a service container plus migrations was judged out of scope
  for this pass — `jest` (unit, already mocked) is what CI runs.
- **`packages/ui` gets no `build` script.** It ships raw `index.tsx` as its
  `main`/`types` and `apps/web` consumes it as source directly (standard Next.js
  monorepo pattern) — inventing a `tsc`-to-`dist` pipeline nothing currently
  needs would have been unrequested scope creep. It only gets `typecheck`.
- **`packages/db#typecheck` needs a Turbo self-override.** `packages/db`'s
  `index.ts` re-exports `@prisma/client`, so its own typecheck depends on its
  own `build` (`prisma generate`) having run first — not just its upstream deps'
  builds. Turbo's `<workspace>#<task>` override syntax
  (`"@biasmarket/db#typecheck": { "dependsOn": ["^build", "build"] }`) covers
  this; no other package needed it.
- **Fixed every blocker rather than let CI ship red.** Each new blocker (jest
  specs, i18n/ui deps, db's tsconfig, the ESM/CJS mismatches, web's lint errors)
  was confirmed by user before fixing, since several touched real application
  code/config rather than pure CI plumbing.

## What changed

**New:**

- `.github/workflows/ci.yml` — `detect-changes` job (`dorny/paths-filter@v4`) →
  7 per-package jobs (`api`, `web`, `db`, `i18n`, `types`, `ui`, `utils`), each:
  checkout → `pnpm/action-setup@v6` (pinned `10.11.0`) → `actions/setup-node@v6`
  (Node 22, pnpm cache) → `pnpm install
  --frozen-lockfile` → `.turbo/cache`
  restore → named Lint/Typecheck/Build/Test steps (only the ones the package
  actually has) → terminal `ci-success` gate job aggregating all results.
- `packages/ui/tsconfig.json`.

**Edited:**

- `turbo.json` — added `typecheck` and `test` tasks (`dependsOn: ["^build"]`)
  and the `@biasmarket/db#typecheck` override.
- Root `package.json` — fixed the broken `test` script to `turbo run test`,
  added `typecheck: turbo run typecheck`.
- `apps/api/package.json` — added `typecheck`, added
  `transformIgnorePatterns: ["/node_modules/(?!@biasmarket/)"]` to the Jest
  config.
- `apps/web/package.json`, `packages/{db,i18n,types,utils,ui}/package.json` —
  added `typecheck` scripts; `packages/db` also got a
  `"build": "prisma
  generate"` script and an `@types/node` devDependency;
  `packages/i18n` got a `typescript` devDependency; `packages/ui` got
  `typescript`/`@types/react` devDependencies and a `react` peerDependency.
- `packages/db/tsconfig.json` — `types: ["node"]` (was `[]`, blocking `process`
  global); `verbatimModuleSyntax: false` (was `true`, incompatible with the
  package's CJS default).
- `packages/db/prisma.config.ts` — non-null assertion on
  `process.env["DATABASE_URL"]`.
- 4 `apps/api` spec files — added `PrismaService`/service mocks; the 2
  controller specs also got a `jest.mock('@thallesp/nestjs-better-auth', …)`.
- `apps/api/src/modules/products/products.service.ts` — removed an unused
  `BadRequestException` import (real pre-existing lint error).
- `apps/web/app/(dashboard)/dashboard/[storeId]/products/page.tsx` — typed the
  two `catch` blocks as `unknown` instead of `any`; restructured the mount-time
  fetch to an in-effect async IIFE with an `ignore` flag instead of calling the
  shared `loadProducts` directly from `useEffect`.

## Verification

Ran the full pipeline locally, clean (no cache), matching what CI runs:

```
DATABASE_URL=postgresql://ci:ci@localhost:5432/ci?schema=public \
  pnpm turbo run lint typecheck build test --force
```

Result: **16/16 tasks successful** across all 7 packages — only a pre-existing
non-blocking `no-floating-promises` warning in `apps/api/src/
main.ts` and
Turbo's benign "no output files" notice for `db`'s prisma-generate step remain.
`pnpm --filter api test` individually confirmed all 7 Jest suites (previously 4
failing) now pass.

Not yet verified: the workflow actually running on GitHub Actions (path filters
triggering the right subset of jobs on a real push/PR) — the repo's Actions
history should be checked after the first push that includes this workflow.
