# NestJS → OpenAPI → generated web client (proposal)

**Phase 0 and Phase 1 landed 2026-08-04** (this session) — `@nestjs/swagger`
wired under the SWC build, `collections` migrated to real response DTOs, spec
emission working, one e2e contract test in place. See "Phase 0/1 execution
notes" below for what actually happened vs. what this doc assumed going in —
several things (the `PluginMetadataGenerator` import path chief among them)
turned out different from the guess made while writing this proposal. Phase 2–4
are still a forward-looking proposal, not yet executed.

## Context

Asked: how far is this repo from generating a typed client for the NestJS
backend, so `apps/web/features/*/api/*.api.ts` hand-written fetch wrappers can
shrink or disappear. Stated constraint: the installed `typescript@^7.0.2` (root

- `apps/web`) doesn't ship a usable Compiler API yet, and the ask was "add a TS6
  alias for tooling that needs it, without touching the TS7 pin used for the
  rest of the repo."

This isn't a fresh question — the most recent web migration doc
([`2026-07-31-web-feature-sliced-migration.md`](2026-07-31-web-feature-sliced-migration.md),
"Investigated, deferred" section) already scoped this exact idea and declined it
as "not a quick win." That investigation is correct about the underlying NestJS
gaps and is treated as ground truth below, re-verified against the current tree
rather than re-derived from scratch:

- `@nestjs/swagger` is not installed anywhere in `apps/api`.
- `nest-cli.json` builds via SWC (`builder: "swc"`, `typeCheck: false`). The
  `@nestjs/swagger` CLI plugin — the thing that auto-infers `@ApiProperty` from
  `class-validator` decorators and TS types — hooks into the tsc/webpack
  compiler pipeline and does not run under an SWC build.
- Request DTOs (`apps/api/src/modules/*/dto/*.dto.ts`) are well-decorated with
  `class-validator`/`class-transformer` — good input for schema generation.
- Controller **responses** are almost entirely untyped: all 21 controllers
  (`find apps/api/src/modules -name "*.controller.ts"`) return whatever the
  Prisma-backed service resolves to, no `Promise<T>` return annotations, no
  response DTO classes, no `@ApiResponse`. This is the real size of the gap —
  wiring `@nestjs/swagger` itself is small; giving every response a real shape
  is the actual work.
- Auth is cookie-session (`better-auth`, `credentials: "include"`), not bearer —
  doesn't block client generation, just means the OpenAPI `securityScheme` won't
  be a simple bearer scheme and the generated client's fetch wrapper must set
  `credentials: "include"` itself (same as `lib/api.ts` today).

**What's different this time, and why the "TS6 alias" framing turns out to be
unnecessary:** `apps/api/package.json` already depends on real
`typescript@^5.9.3` as its own devDependency, independent of the root/`web`
`^7.0.2` pin (`apps/api` runs `tsc --noEmit` for `pnpm typecheck` since the SWC
build skips type-checking — see root `CLAUDE.md`, "NestJS build is SWC-based").
Under pnpm's per-package dependency resolution, any script that lives inside
`apps/api` and does `import ts from "typescript"` already gets the real 5.x
Compiler API — no root alias, no version juggling, no risk to the TS7 pin used
everywhere else. The blocker was never "this repo has no classic TypeScript,"
it's "the SWC build doesn't run the Swagger CLI plugin." Different problem,
already-available fix (below).

## Goal

Emit a real OpenAPI spec from `apps/api`, generate types + a typed fetch client
from it into `packages/types`, and use that to replace hand-written
`features/*/api/*.api.ts` + response-shape zod parsing in `apps/web` —
incrementally, module by module, starting from one pilot feature.

## Non-goals

- **Not replacing REST/NestJS with tRPC or ts-rest.** ts-rest is REST under the
  hood but requires a shared contract package imported by both `api` and `web` —
  the same "tight coupling frontend/backend" property
  `docs/core/security-payments.md` §8 explicitly rejected tRPC for. Revisiting
  that call isn't in scope here; this proposal keeps NestJS controllers as the
  source of truth and layers generation on top, non-invasively.
- **Not migrating every feature in one PR.** Same staged-rollout posture as the
  prior feature-sliced migration — prove the pipeline on one module, then work
  through the rest as follow-ups.
- **Not dropping request-side `class-validator` DTOs.** They stay as the
  backend's real validation layer; OpenAPI generation reads them, it doesn't
  replace them.

## Proposal

### Phase 0 — unblock Swagger metadata under the SWC build

NestJS documents exactly this situation (SWC builder + wanting CLI-plugin-style
inference without switching off SWC): call `PluginMetadataGenerator`
programmatically from a plain Node script instead of relying on the webpack/tsc
transformer.

- Add `@nestjs/swagger` to `apps/api` dependencies.
- New `apps/api/scripts/generate-swagger-metadata.ts`: imports
  `PluginMetadataGenerator` — verify the exact import path when implementing
  (likely `@nestjs/swagger/plugin`, not the package root; the package isn't
  installed yet so this couldn't be confirmed against real `node_modules` while
  writing this doc), points it at `apps/api/tsconfig.json`, writes
  `apps/api/src/metadata.ts`. This script runs under `apps/api`'s own
  `typescript@5.9.3` — the Phase-0 fix for the Compiler-API gap described above,
  no root tooling touched. (Separately: `apps/web/package.json` also has
  `@typescript/native-preview` — the `tsgo` Go-native CLI reimplementation. That
  doesn't change the conclusion above: it's a fast standalone binary, not a
  JS-callable `Program`/`TypeChecker` API, so it can't drive
  `PluginMetadataGenerator` either. The real Compiler API this plan needs only
  exists via `apps/api`'s own `typescript@5.9.3`.)
- Wire the script as `apps/api`'s `prebuild`/predev step (or an explicit
  `generate:swagger-metadata` script run before
  `nest build`/`nest start
  --watch`), so it's not a manually-remembered step.
- `main.ts` changes land together, in Phase 0, not split across phases: add both
  the `await SwaggerModule.loadPluginMetadata(metadata)` call (metadata imported
  from the file the script above generates) **and** the
  `SwaggerModule.createDocument`/`.setup()` call in the same edit — the first is
  meaningless without the second already present to consume the registry it
  populates. (An earlier draft of this plan described these as separate-phase
  edits; that was a sequencing bug — `loadPluginMetadata` with no
  `createDocument` after it does nothing.)
- The standalone spec-emission script in Phase 1 (`generate-openapi-spec.ts`)
  runs in its own Node process, separate from the running API — it must also
  call `SwaggerModule.loadPluginMetadata(metadata)` before
  `SwaggerModule.createDocument`, or the emitted `openapi.json` silently loses
  every plugin-inferred field with no error. Easy to miss since the app would
  still boot and the script would still "succeed" with a thinner-than-expected
  spec.

### Phase 1 — response DTOs + spec emission (pilot module only)

Pick **`collections`** as the _first_ pilot (already the file open in-editor
when this was scoped) — but it's a convenience pick, not a representative one,
and that must be said plainly: `collections.controller.ts` actually has **7**
endpoints (`create`, `findAll`, `update`, `delete`, `addProduct`,
`removeProduct`, `reorderProducts`, not 3), and `findAllForStore` returns a
nested shape (collection → collectionProduct join row → product), not a flat row
— real DTO-authoring work, just none of it touches money or file uploads.
`collections` has **no** `Decimal`/money field and no multipart upload, so it
cannot validate the two failure modes this repo cares most about (money
correctness per `CLAUDE.md`; file-upload endpoints exist in `products`). Do not
treat a clean `collections` migration as proof the pattern generalizes.

- `apps/api/src/modules/collections/dto/collection-response.dto.ts` (and a list
  variant if needed) — real classes with explicit fields, matching what
  `CollectionsService` actually returns today (read the service, don't guess).
- `collections.controller.ts` methods get explicit
  `Promise<CollectionResponseDto>` / `Promise<CollectionResponseDto[]>` return
  types so the plugin can infer them; add `@ApiProperty`/`@ApiPropertyOptional`
  only where inference is ambiguous (optional fields, unions).
- **Money/Decimal convention, defined now even though `collections` doesn't need
  it, because every later module does:** Prisma `Decimal` fields serialize over
  HTTP as JSON **strings**, not numbers. A response DTO field declared
  `price: number` makes `@nestjs/swagger` emit `type: number`,
  `openapi-typescript` emit `number`, and every generated-client caller do
  arithmetic on what is actually a string at runtime — a silent bug, not a
  compile error. Convention: money fields on response DTOs are typed `string`
  (`@ApiProperty({ type: "string" })`), matching what actually goes over the
  wire; never `number` or bare `Decimal`. Consumers parse to a decimal-safe type
  client-side same as they must today.
- **Gate before Phase 4 rollout, not optional:** before treating the pattern as
  proven for the remaining 20 controllers, run this same process on a _second_
  module that has a money field (e.g. `products` or `orders`) and, separately,
  one with a multipart upload endpoint (`products` covers both) — confirming the
  Decimal convention above actually round-trips through `openapi-typescript` as
  a string, and that file-upload endpoints (which don't fit a JSON request-body
  schema) are handled sanely in the generated client (likely: excluded from
  codegen, uploaded via plain `fetch`/`FormData` same as `lib/api.ts` does
  today, and documented as such).
- `main.ts`: wrap the `.setup()` call Phase 0 added behind an env flag
  (`SWAGGER_ENABLED`, default on outside `production`, off in `production`
  unless explicitly set — matches the repo's existing cautious-by-default
  security posture: no helmet/CSRF yet per `docs/core/deploy.md`, don't casually
  add more surface area to prod).
- A standalone `apps/api/scripts/generate-openapi-spec.ts`: boots the Nest
  application context (no `listen()`), calls
  `SwaggerModule.createDocument(app, config)`, writes the JSON to
  **`apps/api/openapi.json`** (inside the owning package, not `packages/types` —
  see Phase 2's turbo `outputs` note for why). Exposed as
  `pnpm --filter api generate:openapi`.

Stop here and verify before Phase 2: inspect the emitted `openapi.json` for the
`collections` paths, confirm the response schema actually matches
`CollectionsService` output (catches drift between the DTO and reality before
it's load-bearing for generated web code).

This manual read only catches drift once, at authoring time — it does nothing
for a service field added six months later with the DTO left stale. Add one e2e
test per migrated module (`apps/api`'s existing `vitest.config.e2e.ts` /
`*.e2e-spec.ts` infra, real `AppModule`) that hits the real endpoint and
validates the live response against the corresponding schema in the generated
`openapi.json` — an ongoing contract check, not a one-time eyeball pass. This
lands alongside each module's response DTOs (Phase 1 for `collections`, then
per-module in Phase 4's rollout), not as a separate deferred effort.

## Phase 0/1 execution notes (2026-08-04)

What landed, matching the plan's scope exactly: `@nestjs/swagger` added to
`apps/api`; `scripts/generate-swagger-metadata.ts` wired as `prebuild`/`predev`/
`prestart`/`prestart:dev`/`pretypecheck`; `main.ts` calls `loadPluginMetadata`
immediately before `createDocument`/`.setup()` (one edit, Phase 0's sequencing
requirement); `SwaggerModule.setup()` gated behind `SWAGGER_ENABLED` (default on
outside `production`, off in `production` unless set); `collections` migrated to
real response DTOs (`dto/collection-response.dto.ts`) with explicit
`Promise<...>` controller return types; `scripts/generate-openapi-spec.ts`
writes `apps/api/openapi.json`, exposed as `pnpm --filter api generate:openapi`;
one e2e contract test (`test/collections.e2e-spec.ts`) validates a real
`GET /stores/:storeId/collections` response against the generated schema.
`pnpm --filter api typecheck`, `test`, and `test:e2e` all pass; the generated
`openapi.json`'s `collections` schemas were manually diffed against
`CollectionsService`'s actual Prisma queries (Phase 1's stop-and-verify
checkpoint) and matched once the DTOs below were corrected.

Where reality diverged from the plan's guesses:

- **`PluginMetadataGenerator` is not in `@nestjs/swagger` at all.** The
  installed `@nestjs/swagger@11.4.6`'s `/plugin` subpath only exports the
  `before` tsc-transformer hook and `ReadonlyVisitor` — no generator class,
  confirmed by grepping `node_modules` and the package's own `exports` map. The
  actual class lives at
  `@nestjs/cli/lib/compiler/plugins/plugin-metadata-generator.js` (already a
  devDependency here). `ReadonlyVisitor` does come from `@nestjs/swagger/plugin`
  as the plan guessed — so the plan was right about needing the `/plugin`
  subpath, just wrong about which package the generator itself ships from.
- **`PluginMetadataGenerator.runOnce` (non-watch mode) type-checks the entire
  tsconfig program — including its own previous output — before writing a new
  `metadata.ts`, and calls `process.exit(1)` with zero output on any diagnostic,
  skipping the write.** Two concrete failure modes fell out of this, both
  handled in `generate-swagger-metadata.ts` now:
  - **Bootstrap cycle:** `main.ts` imports `./metadata.js`; on a fresh clone
    (file gitignored) that import doesn't resolve, which fails the whole-program
    check before generation ever runs. Fixed by having the script write a
    trivial `export default async () => ({});` stub first if `metadata.ts`
    doesn't exist yet.
  - **Self-poisoning:** a `metadata.ts` written while some other file had a type
    error you haven't fixed yet becomes part of every future run's whole-program
    check — if that file happens to itself be invalid (see the `Prisma.Decimal`
    case below), regeneration silently stops updating, forever reproducing the
    same stale error. Recovery is deleting `src/metadata.ts` and rerunning.
- **Typing a response DTO field as `Prisma.Decimal` (or importing the
  Prisma-generated `ProductStatus` enum type) breaks the metadata generator**,
  independent of the bug above: the model visitor resolves the type through to
  its physical declaration file inside the pnpm virtual store and embeds that
  absolute path as a dynamic-import specifier in `metadata.ts`, which then fails
  `tsc --noEmit`
  (`Cannot find module '.pnpm/@prisma+client-runtime-utils@.../...'`). This is a
  real, repo-specific gotcha the plan didn't anticipate — the money convention
  below had to become stricter than "declare `type: string` on the DTO" to work
  around it: the response DTO's field itself is typed `string` (not
  `Prisma.Decimal`/`Date`), and `CollectionsController.findAll` does the
  `Decimal`→`string`/`Date`→ISO-string mapping before returning, so the
  controller's `Promise<...ResponseDto>` return type stays structurally honest
  against what it actually returns. Every future module's response DTOs need to
  follow this same pattern for `Decimal`/`Date`/Prisma-enum fields, not just
  declare an `@ApiProperty({ type: String })` override on a
  `Prisma.Decimal`-typed field — see the comment atop
  `dto/collection-response.dto.ts`.
- **`generate-openapi-spec.ts` can't boot `AppModule` via plain
  `node
  script.ts`** the way this repo's other `scripts/*.ts` do (per root
  `CLAUDE.md`): `AppModule`'s whole module graph uses
  `experimentalDecorators`/`emitDecoratorMetadata` (`@Module`, `@Injectable`,
  etc.), and Node's native TypeScript support only strips types — it doesn't
  transform legacy decorators. Resolved by having `generate:openapi` run
  `nest build` first and importing from `../dist/*` (SWC-compiled, decorators
  already transformed) instead of `../src/*`. Those `dist` imports are written
  as runtime-computed `join()` paths rather than static specifiers, so
  `tsc
  --noEmit` doesn't try to resolve `dist/` (a build artifact, not
  something that should gate `pnpm typecheck`) and doesn't get caught by the
  same whole-program-check bootstrap problem described above.
- **`collections` does exercise the money convention after all**, despite the
  plan's claim (line ~131 above) that it "has no money field itself":
  `findAllForStore`'s `include: { product: true }` join pulls in the full
  `Product` row, which has `price: Decimal`. The nested
  `ProductInCollectionResponseDto.price` field is the real, if incidental, first
  exercise of the Decimal-as-string convention — not the dedicated money-module
  pilot Phase 1's gate still requires, but worth knowing the convention wasn't
  entirely untested before that gate.
- **Local dev environment gaps, unrelated to this plan but blocking
  verification:** `apps/api/.env` has no `S3_*` keys and `test:e2e` needs them
  (`StorageService` requires them eagerly at construction, independent of
  Swagger) — every `test:e2e`/`generate:openapi` run in this session needed them
  exported manually from `infra/docker/.env.example`'s dev defaults. Also, this
  machine has both a native Homebrew Postgres and Docker's `postgres:18` both
  willing to answer on `:5432`; `apps/api/.env`'s `DATABASE_URL` (no password,
  OS-user peer auth) matches the native one, not
  `docker compose -f infra/docker/docker-compose.dev.yml up`. Neither is a code
  defect, but worth knowing before assuming `pnpm docker:dev` is required for
  `test:e2e` to pass locally on a machine like this one.
- **e2e apps built via `Test.createTestingModule` + `createNestApplication()`
  never run `main.ts`'s `bootstrap()`** — no `setGlobalPrefix("api")`, no CORS,
  no filters. Regular Nest-routed controllers are reachable at their bare path
  (`/stores/...`, not `/api/stores/...`) in this test harness; only
  better-auth's own endpoints keep their hardcoded `/api/auth/...` base path,
  since those mount directly via `httpAdapter.use()` independent of Nest's
  global prefix. `test/collections.e2e-spec.ts` hits `/stores/...` accordingly —
  worth knowing before copying `/api/...` paths from `lib/api.ts` (the `web`
  fetch wrapper, which does need the real prefix) into a new e2e spec.

### Phase 2 — generated client in `packages/types`

`packages/types` is already the documented destination for this — currently dead
code (two unused hand-written interfaces, zero import sites), not empty (see the
prior migration doc's `AGENTS.md` note: "reserved for a future OpenAPI-codegen
initiative, not to be hand-populated"). Don't create a new package.

- Add `openapi-typescript` (dev) and `openapi-fetch` (runtime) to
  `packages/types`.
- `packages/types/package.json` script:
  `openapi-typescript
  ../../apps/api/openapi.json -o generated/schema.d.ts` —
  reads the spec cross-package (turbo's `dependsOn` below ensures it exists
  first) rather than copying it into `packages/types`, avoiding two copies of
  the same generated file to keep in sync.
- `packages/types/index.ts`: replace the two dead hand-written interfaces
  (`Store`, `Product` — confirmed zero import sites) with a re-export of the
  generated schema types, plus a preconfigured `openapi-fetch` client factory
  (`createClient<paths>({ baseUrl, credentials: "include" })`) so every consumer
  gets the same cookie-session behavior `lib/api.ts` has today instead of
  reimplementing it.
- `turbo.json`: new tasks mirroring the existing `@biasmarket/db#build` shape
  (the task that actually has an `outputs` field — plain `db:generate` doesn't).
  Turbo resolves a task's `outputs` relative to the owning package, so
  `api#generate:openapi` must declare `outputs: ["openapi.json"]` (resolves to
  `apps/api/openapi.json`, matching where Phase 1's script actually writes it —
  an earlier draft of this doc had the script writing into `packages/types`
  while the turbo task pointed at `apps/api`, which would never have matched).
  `@biasmarket/types#generate` — `dependsOn:
  ["api#generate:openapi"]`,
  `cache: false`, `outputs: ["generated/**"]` — not committing generated
  artifacts, same as `packages/db/generated`.
- CI and first-clone friction, addressed **in this phase**, not deferred to
  Phase 4: like `packages/db/generated`, the generated `openapi.json` and
  `packages/types/generated/schema.d.ts` are gitignored — a fresh clone or a CI
  run with a cold turbo cache needs `generate:openapi` (and the `types` generate
  step) to run before `web`/`types` typecheck or build will pass. Add the CI
  step in the same PR that adds the turbo tasks (mirroring the existing `db`
  job's `pnpm turbo run build --filter=@biasmarket/db` before typecheck step),
  and add the command to root `CLAUDE.md`'s Commands section at the same time —
  not held for Phase 4. No new "diff check" pattern needed since nothing is
  committed.

### Phase 3 — migrate the pilot feature off hand-written wrappers

- Rewrite `apps/web/features/collections/api/collections.api.ts` to call the
  generated `openapi-fetch` client instead of `apiFetch` + manual
  `collectionListSchema.parse`.
- Decide, and write down in `apps/web/AGENTS.md`, what happens to
  `features/*/schemas/*.schema.ts` zod parsing: generated types give
  compile-time safety, not runtime safety. Recommendation — drop zod `.parse()`
  for plain pass-through reads once the generated client covers a feature
  (backend `class-validator` + now-real response DTOs are the runtime
  guarantee), but keep zod where `apps/web` does its own derived
  parsing/coercion (e.g. money/Decimal string → number, date formatting) since
  that's real client-side logic, not response-shape validation.
- Keep the existing `queries/`, `mutations/`, `components/` layers unchanged —
  only the `api/` layer's implementation changes, not the feature-sliced
  convention itself.
- **Explicit scope limit: error responses are not part of this generation
  pipeline.** `AllExceptionsFilter`
  (`apps/api/src/common/filters/all-exceptions.filter.ts`) returns different
  untyped shapes depending on exception type (raw `HttpException.getResponse()`,
  a custom shape for domain errors like `InvalidOrderTransitionError`, a generic
  500 shape) — none declared via `@ApiResponse`/`@ApiBadRequestResponse`, and
  adding that is out of scope here. The generated client only gives typed
  success paths; error handling in `apps/web` keeps doing what it does today
  (parsing `res.json()` defensively, `fallbackErrorMessage`-style fallbacks in
  `lib/api.ts`) rather than gaining a "migrate to" target. This matters more
  than it sounds: declined-payment and ownership-check failures in this app's
  manual-payment flow are error paths, so this is the one place the "replace
  hand-written wrappers" goal explicitly does not reach. Typed error responses
  are a real future initiative, not bundled in here.

### Phase 4 — rollout + docs

- Update `apps/web/AGENTS.md`'s roadmap section: replace the old "revisit only
  if `@nestjs/swagger` + response DTOs land" deferred note with the real staged
  list — one controller module at a time, in the same order new features get
  touched, not a dedicated migration sprint.
- Update `docs/core/architecture.md` with the new generation pipeline (one
  paragraph + the two new turbo tasks). (CI wiring and the root `CLAUDE.md`
  Commands-section update happen in Phase 2, not here — see above.)

## Alternatives considered

- **ts-rest** (shared zod contract, `@ts-rest/nest` + `@ts-rest/react-query`,
  full inference, no OpenAPI/codegen step). Rejected primarily because it means
  rewriting all 21 controllers' decorators up front to adopt the contract style,
  instead of layering generation non-invasively on top of what's already there —
  a much bigger, all-or-nothing blast radius than this plan's incremental
  per-module rollout. `docs/core/security-payments.md` §8's tRPC-rejection
  ("tight coupling frontend/backend") is worth noting as directionally
  consistent, but it's three unelaborated bullets written about tRPC
  specifically, not a rigorous case against ts-rest — which is plain
  REST/OpenAPI-compatible under the hood and arguably no more coupled than a
  generated client already is (both make `apps/web` depend on `apps/api`'s exact
  shapes; one does it via codegen, the other via a shared contract package).
  Treat the rewrite-cost argument as the real reason, not §8.
- **Hand-written `@ApiProperty()` on every DTO field, no
  `PluginMetadataGenerator`.** Simpler, zero new script, but verbose and
  duplicates type info already expressed once in TS + `class-validator` — worse
  fit for "high quality example repo" than fixing the SWC/plugin gap properly.
- **Switch `apps/api` off SWC to unblock the CLI plugin directly.** Rejected:
  bigger blast radius (build tooling change across the whole API, not just
  additive), no material benefit over the `PluginMetadataGenerator` script,
  which is Nest's own documented answer for SWC users.

## Open questions

1. `SWAGGER_ENABLED` defaults **off in production** — not left as genuinely
   open. The spec/UI expose _shape_, not tenant _data_ (schemas are per-type,
   `storeId` filtering happens in service logic untouched by this plan — no
   cross-tenant leak vector here, considered and dismissed), but Swagger UI at a
   public path is still a recon/fingerprinting surface (route enumeration,
   internal model field names, confirms which of the 21 modules exist) on an app
   that per `docs/core/deploy.md` has no CSRF/helmet yet — recon surface matters
   more, not less, when other defenses are thin. Non-production environments
   default on. This is a one-line env-flag decision, not a blocker for Phase 1.
2. Full zod-drop-at-the-boundary vs. keep-as-defense-in-depth (Phase 3) — decide
   per-feature or repo-wide?
3. Response DTO rollout order for the remaining ~19 controllers past the two
   required pilots (`collections`, then a money/upload module — see Phase 1's
   gate) — by module risk (auth-adjacent modules last?) or by whichever feature
   `apps/web` touches next (opportunistic, matches the prior migration's stated
   philosophy)?

## Risks

- Response DTOs must be kept honest against what services actually return —
  drift here silently produces a generated client that lies about shapes, and a
  one-time manual read at authoring time doesn't catch a service field added
  later with the DTO left stale. Mitigated by the Phase-1 per-module e2e
  contract test (real endpoint response validated against `openapi.json`), which
  runs on every future change, not just at migration time.
- Money/`Decimal` fields specifically: mistyping a response DTO field as
  `number` instead of `string` produces a generated client that silently does
  arithmetic on a string. Mitigated by the explicit convention in Phase 1 and
  the required money-bearing second pilot before wider rollout — but this is the
  single highest-consequence mistake this plan can make in an app whose own
  `CLAUDE.md` calls out Decimal-never-Float as a hard rule, so it's worth
  flagging here too, not just in Phase 1.
- `openapi-typescript`/`openapi-fetch` add two new runtime/dev dependencies to
  `packages/types`, currently dependency-free.
- Prebuild script (Phase 0) adds a step to `apps/api`'s dev/build loop; needs to
  be fast (it's AST analysis over the DTO/controller files only, not the whole
  program) or it'll be felt on every `nest start --watch` cycle.
- Error responses stay untyped/hand-parsed indefinitely (see Phase 3's explicit
  scope limit) — not a defect introduced by this plan, but a limitation of the
  chosen approach worth remembering before anyone assumes the generated client
  covers "the whole API surface."
