# Fix CI typecheck failure: `Temporal` is not a real global or TS lib

## Context

CI (`api#typecheck`) fails on `main`-bound branch work:

```text
src/common/filters/all-exceptions.filter.ts:52:17 - error TS2304: Cannot find name 'Temporal'.
```

`Temporal.Now.instant()` was introduced in `AllExceptionsFilter` by commit
`1b2887d` ("refactoring: catch all and logging"), replacing a plain
`console.error` with structured logging (`this.logger.error`) plus a
`Temporal`-based timestamp on the JSON error body. To make `tsc` accept the bare
`Temporal` global, `apps/api/tsconfig.json:22` was set to
`"lib": ["ES2023", "ESNext.Temporal"]`.

**Root cause, confirmed by direct investigation, not assumption:**

1. `"ESNext.Temporal"` is not a real TypeScript `lib` value. Running `tsc`
   directly reproduces a _second_, more informative error the CI log above
   truncated past:
   ```text
   tsconfig.json(22,23): error TS6046: Argument for '--lib' option must be:
   'es5', 'es6', ... 'esnext.float16', 'esnext.error', 'esnext.sharedmemory',
   'decorators', 'decorators.legacy'.
   ```
   No TypeScript version — not `apps/api`'s pinned `typescript@^5.9.3`, not the
   workspace-root `typescript@7.0.2` ("Corsa") — has ever shipped a `Temporal`
   lib or ambient global type. This was never going to typecheck by fixing
   versions; the lib name is invented.
2. **Node 26 does not fix this either.** The instruction that came with this
   task assumed Node 26 ships `Temporal` as a global, so the plan should be
   "bump to Node 26." Checked directly against the actual local runtime
   (`node -v` → `v26.5.0`, already matching CI's pinned `NODE_VERSION: "26"` in
   `.github/workflows/ci.yml:25` — no version bump is even possible here without
   going pre-release):
   ```console
   $ node -e "console.log(typeof Temporal)"
   undefined
   $ node --harmony-temporal -e "console.log(typeof Temporal)"
   undefined
   ```
   V8 has a `--harmony-temporal` flag (visible in `--v8-options`), but it does
   not expose a global `Temporal` in this Node build. As of this Node/V8
   combination, `Temporal` is not available without a userland polyfill, full
   stop. Node/TS version bumps are not part of this fix.
3. `Temporal` is used in exactly one place in the repo
   (`apps/api/src/common/filters/all-exceptions.filter.ts:52`). Everywhere else
   the codebase already uses `new Date()` / `Date.now()` for timestamps (e.g.
   `notifications.service.ts`, `stats/analytics-buckets.ts`,
   `orders/application/expire-orders.usecase.ts`) — this is a green-field usage,
   not a pattern already relied on elsewhere.

The task instruction is explicit that the codebase should **keep using
`Temporal`** (not revert to `Date`), so the fix is a real, typed polyfill — not
swapping back to `Date.now()`.

## Approach

1. Add `@js-temporal/polyfill` as a dependency of `apps/api` (the TC39 reference
   implementation of the Temporal spec). Both it and the lighter
   `temporal-polyfill` alternative are spec-compliant with types present —
   bundle size doesn't distinguish them for a backend service either way, so the
   pick is a judgment call, not a hard technical requirement.
   `@js-temporal/polyfill`'s latest release (0.5.1) is from 2025-03-31; not a
   red flag given the spec itself is stable, but worth knowing it isn't under
   active weekly development.
2. In `all-exceptions.filter.ts`, replace the bare global with an explicit
   import: `import { Temporal } from "@js-temporal/polyfill";` — consistent with
   the repo's "ESM only, explicit imports" rule (no ambient ESLint/global config
   lives in this repo for `Temporal`, and every other file imports what it
   uses).
3. Remove `"ESNext.Temporal"` from `apps/api/tsconfig.json:22`'s `lib` array,
   leaving `"lib": ["ES2023"]`. The polyfill package ships its own `.d.ts`, so
   no `lib` entry is needed or valid for it.
4. Re-run `pnpm --filter api typecheck` locally to confirm both the TS2304 and
   TS6046 errors are gone, then `pnpm turbo run typecheck --filter=api` to
   mirror the CI invocation exactly (it runs `pretypecheck` →
   `generate:swagger-metadata` → `tsc --noEmit` in that order, per the failing
   log).
5. No other file references `Temporal` or the invalid lib name (confirmed via
   repo-wide grep), so no other files need touching for this fix.

## Non-goals

- Not bumping Node or TypeScript versions — both are already current and neither
  ships `Temporal`.
- Not touching the other `new Date()`/`Date.now()` call sites in `apps/api` —
  out of scope, this fix only concerns the one already-broken `Temporal` call
  site.

## Status: implemented

- `@js-temporal/polyfill@^0.5.1` added to `apps/api/package.json`
  (`pnpm-lock.yaml` updated by the same `pnpm add` invocation). **Changes are
  made in the working tree but not yet committed** — this doc was corrected on
  review after initially claiming otherwise; commit `apps/api/package.json`,
  `pnpm-lock.yaml`, `apps/api/tsconfig.json`, and
  `apps/api/src/common/filters/all-exceptions.filter.ts` together to land this
  fix (the working tree also has an unrelated, separately-landable fix to
  `store-sections.service.ts` from the drag-drop-preview plan's review — keep
  that in its own commit rather than bundling it here).
- `import { Temporal } from "@js-temporal/polyfill";` added to
  `all-exceptions.filter.ts`; `"ESNext.Temporal"` removed from
  `apps/api/tsconfig.json`'s `lib` array.
- Verified via `pnpm exec tsc --noEmit -p tsconfig.json` from `apps/api`: clean,
  zero errors (confirms both the TS2304 and TS6046 errors are gone).
  `pnpm turbo run typecheck --filter=api` wasn't runnable end-to-end in this
  environment (fails earlier, at `@biasmarket/db`'s `prisma generate` step, on a
  missing local `DATABASE_URL` — unrelated to this fix, a local-env gap CI's
  secrets already cover) — the direct `tsc` run is the actual typecheck step
  that was failing and is the one confirmed fixed.
- No repo-wide `esnext`-only API usage in `apps/api/src` found, so dropping
  `ESNext.Temporal` and keeping only `ES2023` in `lib` doesn't remove anything
  else in use.
- Runtime response-contract test added on review:
  `apps/api/src/common/filters/all-exceptions.filter.spec.ts` passes an unknown
  exception and a known `HttpException` through `catch()` and verifies the
  response shape, the timestamp's serialized ISO-8601 wire format, and the
  logger invocation — kept as a separate validation step from the typecheck
  commands above. Writing this test also surfaced the `getNext<Request>()` bug
  (it returns the middleware `next` function, so `request.method`/`request.url`
  were `undefined` in logs and the JSON body) — fixed to
  `context.getRequest<Request>()` in the same pass.
