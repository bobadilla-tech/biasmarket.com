# Real unit tests for business logic (apps/api + packages/utils)

## Context

The CI setup landed earlier this session (`2026-07-16-modern-ci.md`) made
`apps/api` run `pnpm turbo run test` in a real job, but green CI doesn't mean
the tests catch anything. A follow-up audit (research only, no code changed yet)
found: **all 7 existing `apps/api` specs were pure smoke tests** — every one
mocked its dependency to `{}` / `useValue: {}` (or had no dependencies at all)
and asserted only `toBeDefined()`. Not one spec called a method with real input
and checked a returned value or a thrown exception.

Meanwhile `products.service.ts` and `stores.service.ts` hold the only real
business logic in the repo — ownership checks, slug validation, soft-delete /
publish status transitions — with zero coverage of any of it. And
`packages/utils`' `slugify()`, a pure dependency-free function used directly by
`stores.service.ts`'s slug validation, had no tests at all despite being the
cheapest possible unit-test target.

Goal: replace the smoke tests with real assertions on that logic, and add a
first test suite for `packages/utils`. Scoped down after discussion — `apps/web`
has zero test infrastructure today (no vitest/jest, no test script, no
`components/` directory, only thin page files); bootstrapping that is a
separate, larger decision left for a follow-up. `packages/i18n` (static JSON
re-exports), `packages/db` (re-exports the generated Prisma client, no custom
logic), and `packages/ui` (one zero-logic `Button`) were confirmed to have no
logic worth testing.

## Decisions

- **Jest stays for `apps/api`, Vitest is new for `packages/utils`.** No reason
  to introduce a second framework into `apps/api` — Jest was already wired up
  and working (including the `transformIgnorePatterns` fix from the CI session).
  `packages/utils` had no runner at all; Vitest was chosen over Jest there
  specifically to avoid the CJS/ESM/ts-jest transform friction hit repeatedly
  during the CI setup — Vitest handles ESM/TS natively with zero config for a
  package this small.
- **Mock at the Prisma boundary, not the whole service.** Previous specs mocked
  `PrismaService`/`ProductsService`/`StoresService` to `{}` — the approach here
  mocks only the individual Prisma methods each service call actually uses
  (`store.findUnique`, `product.create`, etc.) as `jest.fn()`s, so assertions
  can check exactly what got persisted and under what conditions a real
  exception is thrown.
- **`slugify()` is exercised for real in `stores.service.spec.ts`**, not mocked
  — it's cheap, pure, and this is the exact integration point
  `stores.service.ts` depends on for its slug-validation branches.
- **Controller specs assert argument-forwarding**, not just "is defined" — each
  controller method's call into its (now-mocked) service is checked for argument
  identity and order, since that was previously unverified once the service was
  stubbed to `{}`.
- **`users.service.spec.ts` / `users.controller.spec.ts` were left as smoke
  tests.** `UsersService`/`UsersController` are genuinely empty stub classes
  with no methods — a smoke test is the right amount of test for an empty class;
  inventing coverage for non-existent logic would be busywork.

## What changed

**Rewritten (real assertions replacing `toBeDefined()`-only smoke tests):**

- `apps/api/src/modules/products/products.service.spec.ts` — ownership checks
  (`NotFoundException`/`ForbiddenException`), cross-store product access
  prevention via `findOwnedProduct`, `create`/`findAllForStore` (soft-delete
  filter + `include: variants`), `publish` → `PUBLISHED`, `softDelete` →
  `deletedAt` **and** forced `status: 'DRAFT'`, `addVariant`/ `listVariants`.
- `apps/api/src/modules/products/products.controller.spec.ts` — each endpoint's
  call into the (mocked) service checked for argument order.
- `apps/api/src/modules/stores/stores.service.spec.ts` — all three branches of
  `create()`: reserved slug rejected, duplicate slug rejected, valid slug
  created via the real `slugify()`.
- `apps/api/src/modules/stores/stores.controller.spec.ts` — argument forwarding
  for `create()`.

**New:**

- `packages/utils/index.test.ts` — first test suite for the package, 8 cases for
  `slugify()`: lowercasing/hyphenation, trimming, collapsing runs of symbols,
  stripping leading/trailing hyphens, empty input, symbols-only input,
  already-hyphenated input, accented/unicode input (matches real usage — slugs
  come from free-text store names).
- `packages/utils/package.json` — `"test": "vitest run"` script, `vitest`
  devDependency.

**Edited:**

- `.github/workflows/ci.yml` — added a `Test` step to the `utils` job (mirrors
  `api`'s existing `Test` step); no other CI changes needed since `apps/api`'s
  job already ran `test`.
- `apps/api/src/app.controller.spec.ts` — unrelated app code landed mid-session
  (a new `@Public()`-guarded `/probe` route using `@thallesp/nestjs-better-auth`
  and `slugify`), which broke this smoke test's import chain the same way the
  products/stores controller specs were broken before the CI session's fix —
  added the same `jest.mock('@thallesp/nestjs-better-auth', …)` stub.

## Verification

1. `pnpm --filter api test` and `pnpm --filter @barristore/utils test` — pass
   individually.
2. **Regression check**: temporarily removed the `status: 'DRAFT'` line from
   `products.service.ts`'s `softDelete()` — the corresponding new test failed
   with a clear expected/received diff, proving it exercises real behavior, not
   just structure. Reverted after confirming.
3. `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci?schema=public pnpm turbo
   run lint typecheck build test --force`
   at root — **17/17 tasks green, 0 lint errors** (same command used to verify
   the CI setup itself).

## Follow-ups (not in scope this pass)

- `apps/web` has no test infrastructure — would need Vitest +
  `@testing-library/react` bootstrapped from scratch, plus a CI `Test` step for
  the `web` job. Flagged, not started.
- A handful of pre-existing `@typescript-eslint/no-floating-promises` _warnings_
  (not errors) remain in `apps/api` — one in `main.ts` predating this session,
  plus new ones in the controller specs from calling synchronous-looking
  controller methods without `await`/`void`. Left as-is, consistent with how the
  pre-existing warning was already tolerated.
