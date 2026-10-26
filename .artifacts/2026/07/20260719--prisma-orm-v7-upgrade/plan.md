# Upgrade to Prisma ORM v7

## Context

`packages/db` was on Prisma 6.19.3 with the legacy Rust-based `prisma-client-js`
provider. Prisma v7 replaces it with a Rust-free, **ESM-only** `prisma-client`
provider that requires an explicit driver adapter (no more implicit query
engine) and a required `output` path — `prisma-client-js` still works in v7 but
is deprecated. User's call: do the full modern migration now (new provider +
`@prisma/adapter-pg` + ESM) rather than a version-only bump, since deferring
just means paying the ESM-conversion cost later anyway.

The only real consumer of `@biasmarket/db` is `apps/api` (NestJS 11), which was
CommonJS. An ESM-only Prisma client can't be `require()`'d from a CJS app, so
`apps/api` and its workspace deps (`packages/i18n`, `packages/types`,
`packages/utils`) needed converting to native ESM (`"type": "module"`) alongside
the Prisma bump. `apps/web` doesn't import any of these packages, so it was out
of scope.

This session ran concurrently with two other changes to the same packages
(documented separately): the [TypeScript 7 bump](2026-07-19-typescript-7.md)
(which is why `apps/api` ended up building via SWC instead of `nest build`'s
default `tsc`-based compiler, and why Jest got replaced with Vitest — both
already in flight when this session touched the same files) and the
[pnpm-lock.yaml corruption fix](2026-07-19-pnpm-lockfile-corruption.md) (the
Homebrew pnpm 11 vs. pinned 10.11.0 issue — hit repeatedly while verifying this
change, worked around locally each time, root-caused and fixed properly in that
session).

## Decisions

- **New `prisma-client` provider + `@prisma/adapter-pg`**, not a
  `prisma-client-js` version-only bump. `packages/db/prisma/schema.prisma`'s
  `datasource` block dropped its `url` (no longer valid in v7 schemas — Prisma's
  own IDE diagnostic flagged this immediately); the connection string now lives
  only in `prisma.config.ts` (for the CLI/Migrate) and is passed to `PrismaPg`
  in `apps/api/src/prisma/prisma.service.ts` (for the app). Set
  `connectionTimeoutMillis: 5000` on the adapter explicitly — the `pg` driver
  defaults to no timeout, v6 defaulted to 5s, and preserving that behavior
  seemed safer than silently changing it.
- **Prisma output path is `packages/db/generated/prisma`, not
  `packages/db/prisma/generated/prisma`.** The schema's `output` is relative to
  `schema.prisma`'s own location (`prisma/schema.prisma`), so
  `output =
"./generated/prisma"` would land one level too deep; used
  `output =
"../generated/prisma"` instead to match the path
  `packages/db/.gitignore` already expected (`/generated/prisma`) and what
  `index.ts` imports from.
- **`packages/db/index.ts` re-exports the generated client via a literal `.ts`
  extension** (`from "./generated/prisma/client.ts"`), not the `.js` extension
  TypeScript's own `nodenext` convention would suggest. Root cause:
  `packages/db`'s `package.json` `"main"` points straight at `index.ts` — this
  package is never compiled, it runs via Node's native TypeScript execution in
  production. Node's native TS stripping requires the import specifier to
  literally match an existing file; it does not reimplement tsc's "a `.js`
  specifier resolves to a sibling `.ts` file" resolution trick. This only
  surfaced when actually running the built Docker image
  (`node
apps/api/dist/main.js` → `ERR_MODULE_NOT_FOUND`) —
  `vitest`/`tsc --noEmit` both silently tolerated the `.js` version because Vite
  and tsc _do_ implement that convenience mapping. Paired with
  `"allowImportingTsExtensions": true` + `"noEmit": true` in
  `packages/db/tsconfig.json` (required by TS whenever you import a literal
  `.ts` file) — and the same two flags in `apps/api/tsconfig.json`, since
  `apps/api`'s own `tsc --noEmit` pulls `packages/db/index.ts` into its single
  compilation using `apps/api`'s compiler options, not `packages/db`'s.
- **`.swcrc` needed an explicit `"module": { "type": "es6" }`.** Without it, SWC
  (the concurrent TS7 session's build tool, replacing `nest build`'s default
  `tsc` builder) compiled `dist/main.js` as CommonJS
  (`Object.defineProperty(exports, ...)`) despite `apps/api/package.json`
  declaring `"type": "module"` — Node refused to run it
  (`ReferenceError: exports is not defined in ES module scope`). Matches the
  `module: { type: 'es6' }` already used in `apps/api/vitest.config.ts`.
- **`apps/api`'s own `typescript` stayed pinned to `^5.9.3`**, not the `^7.0.2`
  the rest of the workspace moved to (see the TS7 plan) — `@nestjs/cli`'s
  default builder needs the real compiler API TS7 doesn't ship yet. Superseded
  mid-session when the TS7 plan's SWC-builder change landed (`nest-cli.json` →
  `builder: "swc"`), which removes that constraint, but the pin was never
  reverted since it's harmless either way.
- **`packages/utils` got a wildcard subpath `exports` map**
  (`"./*": { "types": "./dist/*/index.d.ts", "default": "./dist/*/index.js" }`)
  instead of a single `main` entry point. The package was mid-restructure into
  per-topic subdirectories (`src/strings/`, more to follow like `src/math/`)
  when this session found its `package.json` still pointing `main` at the old
  flat `./dist/index.js` — a real dangling reference, not something either
  concurrent session had gotten to yet. User's explicit ask: importers should
  write `@biasmarket/utils/strings`, not go through a barrel — the wildcard
  export makes every future `src/<topic>/index.ts` addition work automatically
  with no `package.json` edit. `apps/api`'s one consumer (`stores.service.ts`)
  updated from `from '@biasmarket/utils'` to `from '@biasmarket/utils/strings'`.
- **Unit tests never touch the real Prisma client.**
  `apps/api/test/mocks/
biasmarket-db.ts` stubs `@biasmarket/db` with a bare
  `class PrismaClient {}`, aliased in for `vitest.config.ts` (unit tests) only —
  every `*.service.spec.ts` already injects a fake `PrismaService` via
  `useValue`, so the stub only needs _something_ for
  `class PrismaService extends PrismaClient` to extend. `vitest.config.e2e.ts`
  does **not** alias it, since `test/app.e2e-spec.ts` boots the real `AppModule`
  end-to-end against a real database.
- **Fixed a pre-existing, unrelated `test/app.e2e-spec.ts` bug while here**:
  `import { App } from 'supertest/types'` doesn't exist in the installed
  `supertest@7.2.2` (no bundled types, no `exports` map for that subpath) —
  blocked `typecheck` outright. Simplified to `let app: INestApplication;`
  (drops the unnecessary generic) rather than chasing the right import path,
  since the type parameter wasn't adding anything here.

## What changed

**Edited:**

- `packages/db/prisma/schema.prisma` — `prisma-client` provider,
  `output = "../generated/prisma"`, dropped `datasource.url`.
- `packages/db/prisma.config.ts` — `url: env("DATABASE_URL")` instead of
  `process.env["DATABASE_URL"]!`.
- `packages/db/package.json` — `"type": "module"`; `@prisma/client`/`prisma` →
  `^7.8.0`; added `@prisma/adapter-pg`.
- `packages/db/index.ts` — re-exports from `./generated/prisma/client.ts`.
- `packages/db/tsconfig.json` — `allowImportingTsExtensions` + `noEmit`.
- `apps/api/src/prisma/prisma.service.ts` — constructs `PrismaPg` from
  `DATABASE_URL`, passes `{ adapter }` to `super()`.
- `apps/api/package.json` — added `@prisma/adapter-pg`, `@swc/cli`.
- `apps/api/tsconfig.json` — `allowImportingTsExtensions` + `noEmit`.
- `apps/api/.swcrc` — `"module": { "type": "es6" }`.
- `apps/api/test/app.e2e-spec.ts` — dropped the broken `supertest/types` import.
- `packages/{i18n,types,utils}/package.json` — `"type": "module"`.
- `packages/{i18n,types,utils}/tsconfig.json` — `module`/`moduleResolution` →
  `NodeNext`.
- `packages/i18n/index.ts` — JSON re-exports now use `with { type: "json" }`
  import attributes (required under real ESM).
- `packages/utils/package.json` — wildcard subpath `exports` map, replacing the
  stale flat `main`.
- `packages/utils/tsconfig.json` — `include`/`exclude` widened to `src/**/*.ts`
  (any topic subdirectory), excluding `*.test.ts` from emit.
- `apps/api/src/modules/stores/stores.service.ts` — import path →
  `@biasmarket/utils/strings`.
- All 42 relative imports across `apps/api/src` — added explicit `.js`
  extensions (mechanical, required by `nodenext` module resolution once
  `apps/api/package.json` declared `"type": "module"`).

**Added:**

- `apps/api/test/mocks/biasmarket-db.ts` — unit-test stub for `@biasmarket/db`.

## Verification

- `pnpm turbo run typecheck build test --filter=@biasmarket/db
--filter=@biasmarket/i18n --filter=@biasmarket/types --filter=@biasmarket/utils
--filter=api`
  — all green.
- `docker build -f infra/docker/api.Dockerfile .` — production image builds
  clean (SWC compile, `prisma generate`, multi-stage prod install).
- Ran the built image against a real Postgres
  (`docker compose -f
infra/docker/docker-compose.dev.yml up db`, prod image on
  the same network): `prisma migrate deploy` applied cleanly, Nest booted,
  `better-auth` initialized against the real DB, and `GET /api/health` returned
  `{"status":"ok","db":"ok"}` — confirms the `PrismaPg` driver adapter actually
  connects and queries in the compiled ESM production build, not just under test
  tooling.
- `test:e2e` (native ESM Vitest, real `AppModule`, real DB) reached the same
  "connects and boots" state; the one route test failing on `401` is
  pre-existing (`AppController`'s root route was never marked `@Public()`) and
  unrelated to this change — `test:e2e` isn't wired into CI, so left as-is.
