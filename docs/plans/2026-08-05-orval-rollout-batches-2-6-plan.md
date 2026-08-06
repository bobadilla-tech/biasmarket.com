# Orval client rollout — Batches 2–6 (continuation)

**Batch 2 (`Categories`, `Notifications`, `Contact`, `Suggestions`,
`StoreSections`) landed 2026-08-05** — see
`2026-08-04-orval-client-rollout-plan.md`'s "Batch 2 execution notes" section
for what actually happened (a new `@ApiQuery` pattern for
`Notifications.findAll`'s query-string filters, an e2e-parallelism gotcha with
better-auth's rate limiter, a test-helper fix for `additionalProperties: true`
fields, and the `Contact` tag's no-`storeId`/admin-role-seeding quirk). Batches
3–6 below are still forward-looking, not yet executed.

Batch 1 (`Products`) landed 2026-08-05 — see
`docs/plans/2026-08-04-orval-client-rollout-plan.md`'s "Batch 1 execution notes"
section. This doc is a handoff pointer for whoever picks up next, not a
replacement for that doc — the per-module recipe and batch list live there and
aren't duplicated here.

## Read these first, in order — real bugs already hit and fixed, don't rediscover

1. [`2026-08-04-nestjs-openapi-client-generation-plan.md`](2026-08-04-nestjs-openapi-client-generation-plan.md)
   — backend-side plumbing (swagger metadata under SWC, spec emission,
   money/Decimal-as-string rule, the `PluginMetadataGenerator` self-poisoning
   and Prisma-type-resolution failure modes, per-module e2e contract test
   pattern). "Phase 0/1 execution notes" section is the important part.
2. [`2026-08-04-typed-sdk-client-followups.md`](2026-08-04-typed-sdk-client-followups.md)
   — why Orval over hey-api, the `operationName`/reserved-word remap, the
   `api.schemas.ts` untyped-response collision (why a tag can't be added before
   its controller has real response DTOs), the `.js`-extension postprocess step,
   the `CustomerAuth` spec bug, why TanStack Query hook generation was rejected.
3. [`2026-08-04-orval-client-rollout-plan.md`](2026-08-04-orval-client-rollout-plan.md)
   — the actual rollout plan: per-module recipe (steps 1–9), the batch list, the
   `CustomerAuth` blocker. **Read its "Batch 1 execution notes" section
   specifically** — that's where the newest gotchas live:
   - `@ApiProperty({ type: "object" })` alone doesn't compile for a
     `Record<string, string>`-typed field; needs
     `additionalProperties: { type: "string" }` too.
   - Giving a controller an honest `Promise<Dto>` return type can surface a
     real, pre-existing type hole in the service underneath it (an unannotated
     method with an inconsistent union return across its branches) — read the
     service's every return statement, not just the happy path, before writing
     the DTO.
   - Multiple response shapes per controller (e.g. `create()` returning less
     than `findAll()`) are normal — model them as a DTO extension chain
     (`BaseDto` → `WithXDto extends BaseDto` → `DetailDto extends WithXDto`),
     matching what each service method actually returns, not one flat DTO reused
     everywhere.
   - Local-infra: multipart e2e tests need `S3_ENDPOINT=http://localhost:9000`
     against a standalone
     `docker compose -f infra/docker/docker-compose.dev.yml
     up -d minio minio-init`
     (the `minio` hostname only resolves inside that compose network) — plus
     `set -a && source apps/api/.env && set +a` before running
     `vitest -c vitest.config.e2e.ts` directly, since the e2e harness boots
     `AppModule` without `main.ts`'s `dotenv/config` import.
   - Running the dedicated `customer-auth-rate-limit.e2e-spec.ts` alongside
     other e2e specs in the same process 429s everyone else's sign-in calls — a
     pre-existing test-isolation gap, not a regression; run it separately or
     ignore that specific combination when verifying.
   - Existing controller/service unit test mocks that don't set a return value
     will need real fixture objects once a controller's methods become `async`
     and dereference fields on the resolved value (e.g. `.price.toString()`)
     before returning — an un-awaited delegate-only test that used to just check
     `service.method` was called will start throwing via unhandled rejection
     once the controller does more than pass the value straight through.
   - e2e `afterAll` cleanup order matters per module: check what side effects a
     mutation has (e.g. `updateVariant` →
     `NotificationsService
     .syncStockAlerts` writes a `Notification` row
     keyed by `storeId`) and delete those before `store.deleteMany`, or the
     delete 500s on an FK constraint. Don't assume `collections.e2e-spec.ts`'s
     delete order is complete for every future module — it wasn't for
     `products`.

4. `apps/web/AGENTS.md`'s OpenAPI note and migration roadmap section — current
   state of what's migrated (`collections`, `products`) and the split-decision
   rules (zod drop for pass-through reads, multipart carve-out, query/mutation
   hooks stay hand-written).

`apps/web/features/products/` (not just `collections/`) is now a second
reference implementation — useful specifically for: a controller with more than
one response shape, a feature that keeps a shrunk `api/*.ts` file for
multipart-only calls, and a mutation test that mocks `apiClient.<tag>.*`
directly (`use-update-product.test.tsx` — the first example of that pattern in
this repo, `collections` has no mutation tests at all).

## What's left

Follow `2026-08-04-orval-client-rollout-plan.md`'s "Suggested batches" section
and its per-module recipe (steps 1–9) for each tag. In order:

- ~~**Batch 2** — `Categories`, `Notifications`, `Contact`, `Suggestions`,
  `StoreSections`~~ — done 2026-08-05, see that doc's "Batch 2 execution notes".
- **Batch 3** — `Stores` + `MyStores` (`features/stores`), `DeliveryConfig` +
  `PublicDeliveryConfig`, `PaymentConfig` + `PublicPaymentConfig`,
  `PickupPoints` + `PublicPickupPoints` (all under `features/store-settings`).
  Store configuration surface — moderate size, no money/uploads.
- **Batch 4** — `Order` (`features/orders` — money + upload again, plus the
  sensitive fulfillment-transition/optimistic-undo logic in
  `use-optimistic-status-change.ts`; that hook's business logic doesn't change,
  only its calls into `apiClient` do — read it before touching), `Checkout`
  (`features/checkout`). Do this carefully; it's the second money-bearing module
  after `Products` and touches the manual-payment state machine
  `docs/core/security-payments.md` describes.
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

Already covered by earlier batches, not separate tags (per the rollout plan doc
— don't re-derive, just confirm before skipping): `admin-stores.api.ts` →
`Stores` (Batch 3), `inquiries.api.ts` → `Contact` (Batch 2), `account.api.ts` →
`CustomerAccount` (Batch 5).

`App` and `Health` tags have no corresponding `apps/web` feature — skip, as
before.

## Verification per module (recipe step 9, unchanged)

`pnpm --filter api test && pnpm --filter api test:e2e`,
`pnpm --filter
@biasmarket/types typecheck`,
`pnpm --filter web typecheck && pnpm --filter
web test && pnpm --filter web build`.
For the first 2–3 modules in a fresh session, also smoke-test against the real
running `apps/api` dev server via a plain Node script importing
`packages/types`'s built `dist/index.js` (same shape as
`Batch 1 execution notes` describes) — once the recipe feels mechanical again,
later modules in the same session can lean on typecheck/test/build alone.

## Non-goals (unchanged from the original plan)

Not doing all remaining tags in one session — batch-by-batch is fine, stop
wherever the session runs out of room and update this doc's own execution notes
(or append to the original rollout doc's) with what landed and what diverged,
same convention as Batch 1.
