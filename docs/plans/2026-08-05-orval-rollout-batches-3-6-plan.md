# Orval client rollout — Batches 3–6 (continuation)

Batches 1 (`Products`) and 2 (`Categories`, `Notifications`, `Contact`,
`Suggestions`, `StoreSections`) are done — landed 2026-08-05. This doc
supersedes `2026-08-05-orval-rollout-batches-2-6-plan.md` as the handoff pointer
(that doc is now historical; don't re-read it for "what's left", its Batch 3-6
section is duplicated and updated here). The per-module recipe and original
batch list still live in `2026-08-04-orval-client-rollout-plan.md` — this doc
doesn't replace that either, it's a distilled starting point plus what's new
since Batch 2.

## Read these first, in order — real bugs already hit and fixed, don't rediscover

1. [`2026-08-04-nestjs-openapi-client-generation-plan.md`](2026-08-04-nestjs-openapi-client-generation-plan.md)
   — backend plumbing: swagger metadata under SWC, spec emission, the
   money/Decimal-as-string rule, `PluginMetadataGenerator` self-poisoning and
   Prisma-type-resolution failure modes, per-module e2e contract test pattern.
   "Phase 0/1 execution notes" is the important section.
2. [`2026-08-04-typed-sdk-client-followups.md`](2026-08-04-typed-sdk-client-followups.md)
   — why Orval over hey-api, the `operationName`/reserved-word remap, the
   `api.schemas.ts` untyped-response collision, the `.js`-extension postprocess
   step, the `CustomerAuth` spec bug, why TanStack Query hook generation was
   rejected.
3. [`2026-08-04-orval-client-rollout-plan.md`](2026-08-04-orval-client-rollout-plan.md)
   — the actual rollout plan: per-module recipe (steps 1–9), the original batch
   list, the `CustomerAuth` blocker. **Read both "Batch 1 execution notes" and
   "Batch 2 execution notes"** at the bottom of that file — every gotcha hit so
   far lives there. Condensed below so you don't have to cross-reference
   constantly, but the full doc has more detail/examples for each:
   - `@ApiProperty({ type: "object" })` alone doesn't compile for a
     `Record<string, X>`-typed field; needs `additionalProperties` too
     (`{ type: "string" }` for a known value type, `true` for genuinely
     open/`unknown` JSON like Batch 2's `content`/`metadata`/`bodyParams`
     fields).
   - Giving a controller an honest `Promise<Dto>` return type is a real
     correctness check on the service underneath — read every return statement
     (not just the happy path) before writing the DTO; Batch 1 found a real bug
     this way (`ProductsService.findAllForStore`'s inconsistent empty-array
     branch).
   - Multiple response shapes per controller are normal — model as a DTO
     extension chain (`BaseDto` → `WithXDto extends BaseDto` →
     `DetailDto extends WithXDto`), matching what each service method actually
     returns.
   - Query-string filters need explicit `@ApiQuery()` decorators or Orval's
     generated client silently drops them — no compile error, the filter just
     does nothing at runtime. `Notifications.findAll` (Batch 2) is the only
     example in the repo right now; several Batch 3 endpoints have the same
     shape (see below) and need the same treatment.
   - The `FindAllParams` (and similar `<Method>Params`) types Orval generates
     for query params live in the single shared `api.schemas.ts`, unnamespaced
     by tag — a second tag adding a query-param'd method with the same name will
     collide. Hasn't happened yet; watch for it.
   - `Contact`-style tags with no `storeId` and admin-gated endpoints
     (`@Roles(["admin"])`) need `role: "admin"` seeded directly via Prisma in
     e2e specs/smoke scripts — there's no public "become admin" flow.
   - Local-infra: multipart e2e tests need `S3_ENDPOINT=http://localhost:9000`
     against a standalone
     `docker compose -f infra/docker/docker-compose.dev.yml
     up -d minio minio-init`,
     plus `set -a && source apps/api/.env && set +a` before running e2e directly
     (the harness doesn't run `main.ts`'s `dotenv/config` import). Also export
     `S3_PUBLIC_URL`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET=products`,
     `S3_LOGO_BUCKET=logos` — every `generate:openapi`/`test:e2e`/dev-server run
     in this repo needs all of these set or `StorageService`'s constructor
     throws immediately (`Missing required env var: S3_BUCKET`), even for
     endpoints that don't touch storage.
   - **`apps/api/vitest.config.e2e.ts` now sets `fileParallelism: false`**
     (added in Batch 2) — every e2e spec signs its own user up, and running spec
     files in parallel trips better-auth's real rate limiter (3 sign-in/sign-up
     requests per 10s) with a `403`, not a `429`. This is already fixed at the
     config level; `pnpm --filter api test:e2e` with no flags just works now.
     Don't re-add parallelism.
   - The e2e specs' own duplicated `assertMatchesSchema` helper must treat
     `additionalProperties: true` as "any key allowed" (check
     `resolved.additionalProperties` before throwing on an undeclared property)
     — copy the Batch-2 version of the helper (`store-sections.e2e-spec.ts` or
     `suggestions.e2e-spec.ts`), not the original `collections.e2e-spec.ts` one,
     into any new spec touching an open JSON field.
   - Existing controller/service unit test mocks that don't set a return value
     need real fixture objects once a controller's methods become `async` and
     dereference fields on the resolved value before returning — an un-awaited
     delegate-only test will throw via unhandled rejection.
   - e2e `afterAll` cleanup order matters per module — delete rows with FK
     dependencies on `Store` (categories, sections, notifications,
     payment/delivery method configs) before `store.deleteMany`, or the store
     delete 500s on a constraint. `Store` creation itself auto-creates a
     `DeliveryMethodConfig` row and several `PaymentMethodConfig` rows (see
     `StoresService.create`) — every e2e spec that creates a store already needs
     to clean those up regardless of which module it's testing (all 7 existing
     specs do this).
   - A **node-script smoke test against the real dev server needs an
     `Origin: http://localhost:3001` header** on every request or better-auth's
     origin check 403s state-changing calls with `MISSING_OR_NULL_ORIGIN` —
     `curl` without an `Origin` header works (no browser-like default to
     violate), but plain Node `fetch` doesn't get a free pass. Not needed in the
     real app (the browser sets `Origin` automatically) — only for standalone
     verification scripts.

4. `apps/web/AGENTS.md`'s OpenAPI note — current, authoritative description of
   the pattern (migrated tags: `Collections`, `Products`, `Categories`,
   `Notifications`, `Contact`, `Suggestions`, `StoreSections`).

`apps/web/features/products/` and `apps/web/features/sections/` are useful
reference points beyond `collections`: `products` for multi-shape DTOs and the
multipart carve-out; `sections` for what happens when a zod **discriminated
union** response schema (`content` shape varies by `type`) gets replaced by a
flat generated DTO (`content: Record<string, unknown>`) — same situation likely
recurs for `PickupPoints`/`DeliveryConfig` if their config shapes vary by method
type.

## What's left

- **Batch 3** — `Stores` + `MyStores`, `DeliveryConfig` +
  `PublicDeliveryConfig`, `PaymentConfig` + `PublicPaymentConfig`,
  `PickupPoints` + `PublicPickupPoints`. **Read this whole section before
  starting** — `Stores` specifically is bigger and riskier than Batch 2's
  framing ("moderate size, no money/uploads") suggests; the other three tags in
  this batch really are small.

  **`Stores` (`apps/api/src/modules/stores/stores.controller.ts` +
  `my-stores.controller.ts`) — do this one carefully:**
  - 13 endpoints across two controllers/tags (`StoresController` → `Stores`,
    `MyStoresController` → `MyStores`), backed by 14 service methods in
    `stores.service.ts`. This is a bigger DTO-authoring job than `Products`
    (Batch 1's money/upload gate module) was.
  - Includes a **file upload** (`POST :storeId/logo`, `FileInterceptor` + manual
    JPEG/PNG magic-byte sniffing) — same carve-out pattern as `Products`' image
    uploads: give the response side a real DTO, leave the request side alone,
    keep the frontend call on `apiFetch`/raw `fetch` + `FormData` (see
    `features/store-settings/mutations/use-upload-store-logo.ts`, already
    following this pattern against `settingsApi`, not `stores.api.ts` — confirm
    which wrapper actually owns that call before touching either).
  - Several methods return **deeply nested joined shapes**, not flat rows — read
    each one before guessing from the Prisma schema:
    - `findPublicBySlug` — store + sections (each possibly a `COLLECTION`
      section nested with its collection + collection's products) + more. This
      is the **exact same content-shape problem** Batch 2's
      `StoreSections.content` ran into, except here it's load-bearing: the live
      storefront page
      (`apps/web/app/[locale]/(storefront)/store/[slug]/page.tsx`) currently
      reads `section.content.imageUrl`/`.alt`/`.body` off a `section: any` —
      untyped specifically because nothing has given this endpoint's response a
      real shape yet. Giving `findPublicBySlug` a real DTO means either (a)
      keeping `content` as `Record<string, unknown>` and leaving the storefront
      page's `any` in place (matches what Batch 2 concluded for
      `StoreSectionsController` itself — narrow at the read site, don't fight
      OpenAPI's inability to express "shape varies by sibling field"), or (b)
      something fancier. Recommendation: (a) — don't scope-creep into fixing the
      storefront page's typing as part of this migration; that page isn't a
      "migrated feature" and giving it real types is a separate, bigger decision
      (would touch `oneOf`/discriminated-schema modeling this repo hasn't needed
      yet). Flag it as a known follow-up, don't silently leave it worse than
      before either — a one-line comment pointing at the new DTO is enough.
    - `findFeatured` — joins store + computed revenue/order-count aggregates
      (see the `Map` accumulation in the service, lines ~131–180) — this is
      derived/aggregated data, not a straight Prisma row; the DTO needs to match
      the computed shape, not the `Store` model.
    - `findDirectory`, `findCollectionsPublic`, `findCategoriesPublic`,
      `findPublicProduct` — more public storefront/discovery reads, each with
      their own join shape. Read all of them before starting, the same "read the
      service, don't guess" step 1 discipline as every prior module, just with
      more surface area than usual.
    - `findAllForAdmin`, `findAllForUser` (via `MyStores`), `findBySlugForOwner`
      — simpler, closer to flat `Store` rows, but still read them
      (money-adjacent fields like store settings/plan flags may be present).
  - `apps/web/features/stores/api/stores.api.ts` and
    `apps/web/features/admin/api/admin-stores.api.ts` both front this one tag
    (the rollout plan's "already covered by earlier batches" list already says
    `admin-stores.api.ts` → `Stores`) — migrate both together, don't do one and
    leave the other on `apiFetch`.
  - `features/checkout/api/checkout.api.ts` calls the **public**
    `PublicDeliveryConfig`/`PublicPaymentConfig`/`PublicPickupPoints` endpoints
    (not `Stores` itself) — those three tags' migration will touch this file
    too, even though `Checkout` itself is a separate, Batch-4 tag. Don't skip
    `checkout.api.ts`'s delivery/payment/pickup calls just because `Checkout`
    feels like "someone else's batch" — confirm exactly which functions in that
    file map to which tag before editing, and leave anything that calls the
    actual `Checkout` tag/endpoints alone for Batch 4.

  **`DeliveryConfig`/`PaymentConfig`/`PickupPoints` — genuinely small, as
  originally described:**
  - Each is a private CRUD controller (`stores/:storeId/...`) + a tiny public
    read-only sibling controller (`stores/:slug/public/...`, `@Public()`, one
    `findEnabled`/`findEnabledForSlug` endpoint) — 6 tags total but each private
    controller has 2–4 methods and each public one has exactly 1.
  - `PaymentConfig.findAll` branches on an `enabled` query param (`?enabled=1`)
    to call a different service method — same `@ApiQuery` treatment
    `Notifications.findAll` needed in Batch 2, second real example in the repo.
  - `DeliveryConfig.remove`'s `:type` param is a `"PICKUP" | "COURIER"` literal
    union, not a free string — model it the same way response DTOs model literal
    unions elsewhere (not the Prisma enum type directly, a matching hand-written
    literal union, per the money/enum convention).
  - `features/store-settings/` (`api/settings.api.ts`,
    `queries/use-delivery-settings.ts`, `queries/use-payment-methods.ts`,
    `mutations/use-save-delivery.ts`, `mutations/use-save-payment-methods.ts`)
    is the frontend consumer for the private sides; `checkout.api.ts` (see
    above) for the public sides. `PickupPoints` doesn't appear to have a
    dedicated `store-settings` section yet — grep for `pickup-points` call sites
    in `apps/web` before assuming there's a UI for it; if there isn't, the
    migration is still worth doing (keeps the tag consistent with its siblings)
    but there may be no `queries`/`mutations` file to touch, only
    `checkout.api.ts`'s public read.

- ~~**Batch 4** — `Order`, `Checkout`~~ — done, see
  `docs/plans/2026-08-05-orval-rollout-batch-4-order-checkout-plan.md`'s
  execution notes for the full writeup, including a **real, pre-existing
  money-precision bug found and confirmed live** (not fixed as part of this
  migration — flagged to the user): `OrderRepository.withPaymentSummary`
  computes `pendingAmount`/`paidPercentage` via plain JS float arithmetic, not
  Decimal-safe, and the `addPayment` guard using that same imprecise value means
  a seller entering the _exact_ amount the UI shows as owed can get rejected as
  "exceeds pending balance."
- **Batch 5** — `CustomerAuth`, `CustomerAccount`, `Customers`
  (`features/customer-auth`, `features/customers`). **Blocked**: two
  `CustomerAuthController` endpoints (`changePassword`, `logout`) are missing
  their `slug` path param in the emitted spec, which is why
  `unsafeDisableValidation: true` is set in `orval.config.ts` today. Migrating
  `CustomerAuth` itself requires actually fixing that Swagger annotation gap (or
  confirming Orval still has no per-operation filter) rather than continuing to
  paper over it — **ask the user before touching this fix**, per the rollout
  plan doc's explicit instruction, don't just do it.
- **Batch 6** — `ProductSearch` (`features/discovery`), `Stats`
  (`features/stats`), `Users` (`features/admin/api/admin-users.api.ts` — just
  `getStoreCounts`; `listUsers`/`banUser`/`unbanUser` go through
  `authClient.admin.*`, not this tag, and stay as-is).

Already covered by earlier/this batch, not separate tags — confirmed by reading
each wrapper's actual endpoints, don't re-derive: `admin-stores.api.ts` →
`Stores` (Batch 3), `inquiries.api.ts` → `Contact` (done, Batch 2),
`account.api.ts` → `CustomerAccount` (Batch 5), the
delivery/payment/pickup-point calls in `checkout.api.ts` →
`PublicDeliveryConfig` /`PublicPaymentConfig`/`PublicPickupPoints` (Batch 3),
the rest of `checkout.api.ts` → `Checkout` (Batch 4).

`App` and `Health` tags have no corresponding `apps/web` feature — skip.

## Per-module recipe (unchanged — steps 1–9 in `2026-08-04-orval-client-rollout-plan.md`)

1. Read the service — every method, every branch, not just the happy path.
2. Write response DTO classes matching what the service actually returns
   (Decimal/Date fields as `string`, literal unions not Prisma enums,
   `additionalProperties` on any open/`Record<string, unknown>` field,
   `@ApiQuery` on any query-string filter).
3. Regenerate the spec (`pnpm --filter api generate:openapi`) and manually diff
   the new schemas against the service.
4. Add an e2e contract test per module (copy an existing Batch 2 spec, not
   `collections.e2e-spec.ts`, if the module has any open JSON fields).
5. Add the tag(s) to `packages/types/orval.config.ts`'s `filters.tags`,
   regenerate (`pnpm --filter @biasmarket/types generate`), export the new
   namespace(s) from `packages/types/index.ts` and `apps/web/lib/api-client.ts`.
6. Check generated method names for collisions/reserved words (`delete` →
   `remove`, already handled generically in `orval.config.ts`).
7. Rewrite the feature's `api/`, `queries/`, `mutations/` to call
   `apiClient.<tag>.*` directly; keep multipart calls on `apiFetch`/raw `fetch`.
8. Drop response-shape zod for plain pass-through reads; keep it for real
   request/form validation and client-side derived parsing.
9. Verify (see below).

## Verification per module/batch

`pnpm --filter api test && pnpm --filter api test:e2e` (no special flags needed
now that `fileParallelism: false` is set),
`pnpm --filter
@biasmarket/types typecheck && pnpm --filter @biasmarket/types build`
(**build, not just typecheck** — `apps/web` imports the compiled
`dist/index.js`, so a `typecheck`-only pass can miss a stale build; this bit
Batch 2 once),
`pnpm --filter web typecheck && pnpm --filter web test &&
pnpm --filter web build`.

Remember, every time, before `generate:openapi`/`test:e2e`/running the dev
server:

```bash
set -a && source apps/api/.env && set +a
export S3_ENDPOINT=http://localhost:9000 S3_PUBLIC_URL=http://localhost:9000 \
  S3_ACCESS_KEY=admin S3_SECRET_KEY=password123 S3_BUCKET=products S3_LOGO_BUCKET=logos
```

For `Stores` specifically (and at least one other module in a fresh session),
also smoke-test against the real running `apps/api` dev server: a plain Node
script importing `packages/types`'s built `dist/index.js`, signup → verify (read
the token out of `apps/api/.mailer-dev/`) → sign-in (remember the
`Origin: http://localhost:3001` header) → create-store → exercise the module's
real endpoints. Clean up any rows created (`Store`, `user`, and anything
FK-dependent on `Store`) from the local Postgres afterward — check
`DATABASE_URL` in `apps/api/.env` for which database that is.

## Non-goals (unchanged)

Not doing all remaining tags in one session — batch-by-batch, stop wherever the
session runs out of room and append execution notes to this doc (or to
`2026-08-04-orval-client-rollout-plan.md`, matching where Batches 1/2's notes
live) describing what landed and what diverged.

## Batch 3 execution notes (2026-08-05)

All of Batch 3 landed: `DeliveryConfig`/`PublicDeliveryConfig`,
`PaymentConfig`/`PublicPaymentConfig`, `PickupPoints`/`PublicPickupPoints`, and
`Stores`/`MyStores`. Matches the per-module recipe; notes below are what
diverged or came up that prior batches hadn't hit.

- **Pre-existing broken state found before any new code was written**: an
  uncommitted, half-finished refactor was already sitting in the working tree (a
  new `apps/api/test/schema-assert.ts` extracting the duplicated
  `assertMatchesSchema`/`waitForNewMailerFile` helpers out of
  `collections.e2e-spec.ts`/`products.e2e-spec.ts`, plus a broken
  `products.e2e-spec.ts` edit calling a `StorageService.deleteImage` method that
  didn't exist yet). The shared-helper extraction was legitimate and reused for
  every new e2e spec this batch added; the broken `deleteImage` call was
  resolved when the user added the real method to `StorageService` mid-session.
  Worth checking `git status`/running `generate:openapi` once at the very start
  of a session before assuming the tree is clean — this one would have silently
  blocked the first `generate:openapi` run otherwise.
- **The three config tags were as small as advertised** — flat CRUD, no Decimal
  fields, one `@ApiQuery` needed (`PaymentConfig.findAll`'s `?enabled=1` branch,
  second real example after `Notifications` in Batch 2).
- **A real `FindAllParams` collision, predicted but not yet hit in Batch 2's
  notes, actually happened this batch**: `PaymentConfig.findAll` and
  `Notifications.findAll` (Batch 2) both derive a `FindAllParams` type in the
  single shared `api.schemas.ts` — a genuine `TS2300: Duplicate identifier` the
  moment both tags were generated together. Root-caused via `@orval/core`'s
  source (`getQueryParams`/`buildVerbOption` in
  `node_modules/.pnpm/@orval+core@.../dist/index.mjs`): Orval's `operationName`
  override can return `[methodName, typeName]`, not just a bare string —
  `typeName` drives every internally-generated type name (query-param types,
  mainly), independent of the actual generated function's name. Fixed once, in
  `orval.config.ts`, by returning `[methodName, String(operation.operationId)]`
  — method names stay short and clean per tag (`findAll`), type names become the
  already-unique raw operationId (`PaymentConfigController_findAll`). This is a
  permanent fix, not a per-tag workaround — resolves the collision class for
  every tag added from here on, including `Stores`' own
  `findFeatured`/`findDirectory` query params in the same batch.
- **`Stores` really was the bigger, riskier module the handoff doc said it'd
  be**: 14 endpoints (13 in `StoresController`, 1 in `MyStoresController`), 9
  new response DTO classes (`store-response.dto.ts`), a `stores.mapper.ts`
  extracted for the `toStoreDto`/`StoreRow` pair shared between both controllers
  (the first module in this rollout with more than one controller file needing
  the same row-to-DTO mapping — collections/ products/etc. only ever had one
  controller each). `findPublicBySlug` (the section→collection→products nested
  join) took the recommended path from the handoff doc's Batch 3 section:
  `content` stayed `Record<string, unknown>`, the live storefront page's `any`
  typing was left untouched, one-line comment pointing at the new DTO.
  `findFeatured`'s `revenue` field is a plain `number`, not the usual
  Decimal-as-string convention — the service already reduces every payment's
  Decimal through `Number(...)` into a summed JS float before the DTO ever sees
  it (a display/ranking aggregate, not a stored money value), so typing it
  `string` would have been a type lie, not adherence to the convention. Two more
  `@ApiQuery`-needing endpoints turned up here too: `findFeatured`'s `limit` and
  `findDirectory`'s `q`/`page`/`limit` — neither had ever been annotated before
  this migration, another pair of Orval would've silently dropped.
- **A real, pre-existing `apps/api` bug found while giving
  `DELETE
  /stores/:storeId` a response DTO, not fixed as part of this
  migration**: every store — even a brand-new one with zero products — gets a
  `DeliveryMethodConfig` row and 4 `PaymentMethodConfig` rows auto-created by
  `StoresService.create`'s `$transaction`. Neither relation has
  `onDelete:
  Cascade` in `schema.prisma`, and `StoresService.delete` never
  cleans them up before calling `prisma.store.delete` — so the raw FK constraint
  always rejects the delete, and the service's catch block turns that into a 400
  ("tiene productos u órdenes asociadas") for literally every store, not just
  ones with real associated data. Nothing in this rollout had ever exercised a
  real delete before (only mocked in unit tests). `test/stores.e2e-spec.ts`
  documents the actual current behavior (asserts the 400, cleans up the
  throwaway store's rows directly via Prisma since the API call never actually
  deletes it) rather than asserting an aspirational 200 — flagged here and in
  `apps/web/AGENTS.md`, left for a separate fix, per the DTO-authoring scope
  this rollout is doing.
- **`schema-assert.ts`'s `resolveSchema` needed a real fix, not a one-off
  workaround**: a `nullable`, class-typed response field
  (`@ApiProperty({ type: SomeDto, nullable: true })` —
  `StoreSectionWithCollectionResponseDto.collection` in this batch) emits
  `{ nullable: true, type: "object", allOf: [{ $ref }] }` instead of a bare
  `$ref`, because OpenAPI 3.0 forbids sibling keywords next to `$ref` — first
  time this rollout hit a nullable object-typed field. `resolveSchema` now
  unwraps a single-entry `allOf` and carries `nullable` down onto the resolved
  schema; fixed in the shared helper so every future spec with the same shape
  doesn't have to rediscover it.
- **`stores.api.ts`/`admin-stores.api.ts` migrated together**, per the handoff
  doc's instruction — confirmed `use-upload-store-logo.ts` actually calls
  `storesApi.uploadLogo` (not `settingsApi`, which the handoff doc's Batch 3
  section flagged as needing confirmation one way or the other), so the
  multipart carve-out landed in `stores.api.ts` unchanged, on plain `fetch` +
  `FormData`.
- **Two frontend call sites the "already covered" list didn't mention, found by
  grepping every `apiFetch` call to a `/stores`-shaped path before declaring the
  batch done**: `features/store-settings/api/settings.api.ts`'s
  `updateProfile`/`updateAppearance`/`updateStockAlerts` all
  `PATCH
  /stores/:storeId` (the `Stores.update` endpoint) — migrated alongside
  the delivery/payment/pickup-point functions already planned for this file, not
  left half-migrated. `features/discovery/api/discovery.api.ts`'s
  `getFeaturedStores`/`getStoreDirectory` call `Stores.findFeatured`/
  `findDirectory` — migrated too; `searchProducts` in the same file
  (`ProductSearch` tag) stayed on `apiFetch`, Batch 6. Two root `app/` route
  files (`app/sitemap.ts`, the storefront product detail page) also call
  `Stores` public endpoints via raw `fetch`, outside any `features/<name>/api/`
  wrapper — left untouched, same as the storefront `store/[slug]/page.tsx` the
  original handoff doc already called out as out of scope (these aren't
  "migrated features" in the feature-sliced sense, and giving them the generated
  client is a separate decision, not a byproduct of a tag's DTO work).
- **A real, repo-wide test-isolation gap found via an unrelated test failure,
  fixed once at the config level**: `apps/web/lib/api-client.ts` calls
  `configureApiClient()` eagerly at module load, throwing if
  `NEXT_PUBLIC_API_URL`/`INTERNAL_API_URL` is unset. `features/customers`'s test
  files (untouched by this batch, mocking only `@/lib/api`) started failing once
  `store-settings/api/settings.api.ts` began importing `@/lib/api-client` —
  reached transitively through `customer.schema.ts` → `@/features/orders` barrel
  → `use-enabled-payment-methods.ts` → `settingsApi`, three hops away, no direct
  import of the client in the failing test file at all. Fixed by adding
  `NEXT_PUBLIC_API_URL` to `apps/web/vitest.config.ts`'s `test.env` (matching
  the real `.env.local` value dev/build already use), not by chasing down every
  transitive import site — the per-test-file `vi.mock("@/lib/api-client", ...)`
  pattern every migrated feature's own tests already use still takes precedence
  over this fallback, so nothing about existing mocked tests changed.
- **Verification performed**: `pnpm --filter api test` (283 tests, all green —
  `stores.controller.spec.ts`'s one real test needed a realistic fixture, same
  "async controller now dereferences the resolved value" reason as every prior
  batch's controller-spec fixes). `pnpm --filter api
  test:e2e` (13 spec files,
  26 tests, all green, including new `delivery-config.e2e-spec.ts`,
  `payment-config.e2e-spec.ts`, `pickup-points.e2e-spec.ts`,
  `stores.e2e-spec.ts` — the last one builds a real
  category/product/collection/section graph so `findPublicBySlug` exercises the
  real nested-join path, not just the "no sections yet" orphan fallback).
  `pnpm --filter @biasmarket/types typecheck`/`build`,
  `pnpm --filter web typecheck`/`test` (49 files, 156 tests)/`build`, all green.
  Standalone Node scripts against the real running `apps/api` dev server
  exercised both groups of new endpoints end to end (signup → verify → sign-in →
  create-store → every new tag's real methods, including
  `stores.findPublicBySlug`'s nested shape and `stores.update`/
  `findBySlug`/`findAllPublic`/`findDirectory`/`findFeatured`/
  `findCategoriesPublic`), confirming runtime shapes match; smoke-test rows
  cleaned up from the local dev database afterward. Not browser-verified, same
  caveat as every prior batch.

Batch 4 (`Order`, `Checkout`) is also done now — see
`2026-08-05-orval-rollout-batch-4-order-checkout-plan.md`'s own execution notes.
Batches 5–6 are unstarted; Batch 5 is blocked on a spec-bug fix the user must
approve first (below).
