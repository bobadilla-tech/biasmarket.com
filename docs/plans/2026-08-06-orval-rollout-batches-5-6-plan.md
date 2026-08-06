# Orval client rollout — Batches 5–6 (`CustomerAuth`/`CustomerAccount`/`Customers`, `ProductSearch`/`Stats`/`Users`)

Batches 1–4 are done and landed: `Products`; `Categories`/`Notifications`/
`Contact`/`Suggestions`/`StoreSections`; `DeliveryConfig`/
`PublicDeliveryConfig`/`PaymentConfig`/`PublicPaymentConfig`/`PickupPoints`/
`PublicPickupPoints`/`Stores`/`MyStores`; `Order`/`Checkout`. This doc is the
focused handoff for the last two batches —
`docs/plans/2026-08-05-orval-rollout-batches-3-6-plan.md` is now fully
historical (superseded for "what's left" by this doc and the Batch 4 doc); its
per-module recipe and gotcha list are still correct and still worth reading
once.

**If `docs/plans/2026-08-06-order-payment-precision-bug-fix-plan.md` hasn't
landed yet, read its outcome first** (or land it first) if this session touches
`Stats` — `StatsService.getOverview` has the exact same float-precision
`withPaymentSummary` duplicate that fix targets, and `Stats`' response DTO work
in this batch should call whatever shared helper that fix produces, not
reintroduce a fourth copy of the buggy arithmetic. Independent otherwise —
`CustomerAuth`/`CustomerAccount`/`Customers`/ `ProductSearch`/`Users` don't
touch money.

## Read these first, in order — same requirement every batch has had

1. [`2026-08-04-nestjs-openapi-client-generation-plan.md`](2026-08-04-nestjs-openapi-client-generation-plan.md)
   — backend plumbing, money/Decimal-as-string rule, `PluginMetadataGenerator`
   failure modes, the e2e contract-test pattern.
2. [`2026-08-04-typed-sdk-client-followups.md`](2026-08-04-typed-sdk-client-followups.md)
   — why Orval, the `operationName`/reserved-word remap, the `api.schemas.ts`
   collision, the `.js`-extension postprocess step, **and the original
   `CustomerAuth` spec-bug discovery** (see "Batch 5" section below — this is
   the doc that first found it).
3. [`2026-08-04-orval-client-rollout-plan.md`](2026-08-04-orval-client-rollout-plan.md)
   — per-module recipe (steps 1–9), the `CustomerAuth` blocker as originally
   scoped. Read "Batch 1"/"Batch 2 execution notes" at the bottom.
4. [`2026-08-05-orval-rollout-batches-3-6-plan.md`](2026-08-05-orval-rollout-batches-3-6-plan.md)
   — "Batch 3 execution notes" and "Batch 4 execution notes" — real,
   already-fixed gotchas: a `FindAllParams` naming collision
   (`orval.config.ts`'s `operationName` now returns
   `[methodName, operation.operationId]`, permanently fixed, nothing to redo), a
   nullable-object-field gap in `test/schema-assert.ts`'s `resolveSchema`
   (fixed), a repo-wide test-isolation gap in `apps/web/vitest.config.ts`
   (fixed, `NEXT_PUBLIC_API_URL` now set in `test.env`), a `vi.mock`-hoisting
   gotcha (use `vi.hoisted()` when a test file has more than one `vi.mock`
   call).
5. [`2026-08-05-orval-rollout-batch-4-order-checkout-plan.md`](2026-08-05-orval-rollout-batch-4-order-checkout-plan.md)
   — most recent batch, freshest gotchas, same structure this doc follows.
6. `apps/web/AGENTS.md`'s OpenAPI note — current migrated-tags list (as of Batch
   4: `Collections`, `Products`, `Categories`, `Notifications`, `Contact`,
   `Suggestions`, `StoreSections`, `DeliveryConfig`, `PublicDeliveryConfig`,
   `PaymentConfig`, `PublicPaymentConfig`, `PickupPoints`, `PublicPickupPoints`,
   `Stores`, `MyStores`, `Order`, `Checkout`) and the `[methodName, typeName]`
   `operationName` convention.

`apps/web/features/contact/` (Batch 2 — platform-level, no `storeId`,
admin-gated endpoints needing `role: "admin"` seeded via Prisma) is the closest
reference point for `Users`' one admin-gated endpoint in Batch 6.
`apps/web/features/orders/` (Batch 4) is the closest reference for `Stats`,
which shares `Order`'s money-summary computation.

## Batch 5 — `CustomerAuth`, `CustomerAccount`, `Customers` — blocked, ask first

**Do not touch the `CustomerAuth` spec bug without the user's explicit
go-ahead.** This has been the standing instruction since the original rollout
plan doc and every batch since — it's repeated here because this is the batch
where it actually matters.

### The bug, confirmed by reading the controller

`apps/api/src/modules/customer-auth/customer-auth.controller.ts`'s
`changePassword` and `logout` methods:

```ts
@Post("change-password")
async changePassword(
  @CustomerSession() session: { id: string; storeId: string },
  @Body() dto: ChangeCustomerPasswordDto,
  @Res({ passthrough: true }) res: Response,
) { ... }

@Post("logout")
logout(@Res({ passthrough: true }) res: Response) { ... }
```

Both live under the class-level `@Controller("stores/:slug/account")` route (so
`POST /stores/:slug/account/change-password` and `/stores/:slug/account/logout`
are real, working routes at runtime — Nest resolves `:slug` from the path
regardless), but **neither method signature declares a `@Param("slug")`**,
unlike every sibling method in the same controller (`register`, `login`, `me`,
`updateMe`, `forgotPassword` all take `@Param("slug") slug: string`).
`@nestjs/swagger`'s plugin infers a path parameter's existence from the method
signature, not the route string — so the emitted OpenAPI spec is missing `slug`
as a declared parameter for these two operations specifically. Orval's spec
validator hard-fails the _entire_ generation over this (any tag, not just
`CustomerAuth`) — that's why `packages/types/orval.config.ts` has carried
`input.unsafeDisableValidation: true` since the very first Orval spike (Batch
0/pilot), and why `CustomerAuth` has never been in `filters.tags`.

### The fix, if the user approves it

Smallest possible change: add `@ApiParam({ name: "slug" })` from
`@nestjs/swagger` to both methods — pure Swagger metadata, zero behavior change
(the route already works today; `slug` isn't even read by `changePassword`'s
body, since the customer session already carries `storeId`). Do **not** add an
unused `@Param("slug") slug: string` to the method signature instead unless
`@ApiParam` alone turns out insufficient for the plugin to pick it up — verify
by regenerating the spec and checking
`spec.paths["/stores/{slug}/account/change-password"].post.parameters` includes
`slug` before assuming either approach worked.

Once fixed, `input.unsafeDisableValidation: true` in `orval.config.ts` should be
revisited too — the comment there says it's carried "for this one known gap," so
removing the gap should mean removing the flag, unless generation now fails
validation for some _other_ reason discovered in the process (check before
removing it blindly).

### If the user says no / defers

Keep `unsafeDisableValidation: true`, keep `CustomerAuth` out of `filters.tags`,
migrate `CustomerAccount` and `Customers` only (see below — neither has this
bug), and leave `features/customer-auth/api/customer-auth.api.ts` on
`apiFetch` + zod. Note in this doc's execution notes which path was taken.

### `CustomerAccount` — small, no blocker

`apps/api/src/modules/orders/infrastructure/customer-account.controller.ts` —
one endpoint, `GET /stores/:slug/account/confirm` (`@Public()`, `ConfirmDto` via
`@Query("token")`). Backing service: `CustomerAccountService.confirmAccount`.
Frontend: `features/account/api/account.api.ts`, one function (`confirm`),
already confirmed in Batch 3's "already covered" notes. Give it a real response
DTO (read `confirmAccount`'s return shape first, don't guess), migrate
`account.api.ts`, drop `confirm-result.schema.ts`'s zod for a type alias per the
established convention.

### `Customers` — small, but touches the money-precision bug's territory

`apps/api/src/modules/orders/infrastructure/customers.controller.ts` — two
endpoints: `findAll` (`GET /stores/:storeId/customers`) and `findOne`
(`GET /stores/:storeId/customers/:customerId`). Backing service:
`CustomersService` (same file directory as `Order`'s application layer —
`apps/api/src/modules/orders/application/customers.service.ts`, DDD-lite
layering, same as `Order`).

- `findAllForStore`'s row shape: read the service, don't guess (it wasn't read
  in depth for this plan doc — do that first).
- `findOneForStore` returns `{ customer: {...}, orders: [...] }` where `orders`
  is every order for that customer run through the module's own private
  `withPaymentSummary` (structurally-typed, same bug as `Order`'s — see the
  money-precision fix doc). **This response DTO's `orders` field should end up
  with the identical shape to `Order`'s own `OrderResponseDto`** (same fields:
  `paidAmount`/`pendingAmount`/ `paidPercentage`/`items` with product+variant
  joins/`payments`, no `proofs`) — confirmed structurally identical by reading
  both services side by side in Batch 4's investigation. Consider whether this
  DTO can literally reuse `OrderResponseDto` from
  `apps/api/src/modules/orders/dto/order-response.dto.ts` (cross-module import,
  unusual for this rollout's established "each module owns its nested shapes"
  convention, but the shapes are genuinely identical here, not just similar) or
  whether a local duplicate DTO is cleaner — this is a judgment call the
  rollout's prior batches haven't needed to make yet (first real case of two
  tags sharing an _entire_ response shape, not just a nested piece of one).
  Either choice is defensible; document which one and why in this doc's
  execution notes.
- Frontend: `features/customers/api/customers.api.ts` (`list`/`getOne`),
  `features/customers/schemas/customer.schema.ts`. That schema file currently
  has a **local copy** of `Order`'s old zod schema (copied there during Batch 4,
  see that batch's execution notes, because `orders` dropped its own zod export
  when it migrated) — once `Customers` migrates to the generated client, delete
  that local copy entirely and alias onto the generated DTO instead, same as
  every other migrated feature.

## Batch 6 — `ProductSearch`, `Stats`, `Users` — the small remainder

No blockers. Genuinely small, as the original rollout plan always said.

- **`ProductSearch`**
  (`apps/api/src/modules/products/product-search.controller.ts`) — one endpoint,
  `GET /products/search` (`@Public()`, `q`/`page`/`limit` query params via
  `parsePublicListQuery`, same helper `Stores.findDirectory`/ `findFeatured` use
  — those needed `@ApiQuery` decorators added in Batch 3, check whether this
  controller already has them or needs the same treatment). Backing service:
  `ProductSearchService.search`. Frontend:
  `features/discovery/api/discovery.api.ts`'s `searchProducts` function — the
  _only_ remaining function in that file on `apiFetch`
  (`getFeaturedStores`/`getStoreDirectory` already migrated in Batch 3, see that
  file's current state before assuming it's untouched).
  `features/discovery/schemas/product-search.schema.ts`'s
  `productSearchResultSchema`/`searchProductSchema` drop for type aliases, same
  pattern as every prior batch.
- **`Stats`** (`apps/api/src/modules/stats/stats.controller.ts`) — two
  endpoints, `getOverview` and `getAnalytics` (`range` query param —
  `30d`/`90d`/`12m`, validated in the controller already via a
  `BadRequestException`, check whether it also needs an `@ApiQuery` decorator or
  whether the existing validation is enough for Orval's generated params type to
  be useful). `getOverview` is the one that depends on the money-precision fix
  doc — read `StatsService.getOverview` in full (not just the
  `withPaymentSummary` copy already found) before drafting its response DTO; it
  aggregates revenue/order-count/top-products and may have more
  `Number(...)`-on-Decimal spots than the ones already flagged in the fix doc.
  `getAnalytics` returns a bucketed time-series (`buildBuckets`,
  `analytics-buckets.ts`) — read that helper's output shape too. Frontend:
  `features/stats/api/stats.api.ts` (`getOverview`/`getAnalytics`),
  `features/stats/schemas/{stats-overview,analytics}.schema.ts`.
- **`Users`** (`apps/api/src/modules/users/users.controller.ts`) — one endpoint,
  `GET /admin/users/store-counts` (`@Roles(["admin"])`, same
  admin-gated-with-no-public-become-admin-flow shape `Contact` had in Batch 2 —
  seed `role: "admin"` directly via Prisma in the e2e spec). Frontend:
  `features/admin/api/admin-users.api.ts` — **only** `getStoreCounts`; the
  file's own comment already documents that `listUsers`/`banUser`/`unbanUser` go
  through `authClient.admin.*` directly (better-auth's own typed admin client)
  and correctly stay untouched, not migrated to this tag. Confirm that comment
  is still accurate before relying on it, but it matches the original rollout
  plan's scoping exactly.

`App` and `Health` tags still have no corresponding `apps/web` feature — skip,
as every prior batch's doc has noted.

## Per-module recipe (unchanged)

Steps 1–9 in `2026-08-04-orval-client-rollout-plan.md`: read the service → write
response DTOs (Decimal-as-string, literal unions not Prisma enums,
`additionalProperties` on open JSON, `@ApiQuery` on query filters) →
regenerate + diff → e2e contract test → add the tag to `orval.config.ts`'s
`filters.tags` + regenerate `@biasmarket/types` → check generated method names
for collisions → rewrite the feature's `api/`/`queries/`/`mutations/` → drop
response-shape zod for pass-through reads → verify.

## Verification (unchanged)

`pnpm --filter api test && pnpm --filter api test:e2e`,
`pnpm --filter @biasmarket/types typecheck && build`,
`pnpm --filter web
typecheck && test && build`, plus a real dev-server smoke
test for at least `Customers` (money-adjacent) and `CustomerAuth` if it gets
unblocked (auth-adjacent — worth extra care regardless of money). Remember the
env vars every `generate:openapi`/`test:e2e`/dev-server run needs:

```bash
set -a && source apps/api/.env && set +a
export S3_ENDPOINT=http://localhost:9000 S3_PUBLIC_URL=http://localhost:9000 \
  S3_ACCESS_KEY=admin S3_SECRET_KEY=password123 S3_BUCKET=products S3_LOGO_BUCKET=logos
```

## Non-goals

- Not touching `CustomerAuth`'s spec bug without asking first — repeated because
  this is the batch it finally matters for, not a hypothetical.
- Not applying the DDD-lite `domain/application/infrastructure` layering
  anywhere it doesn't already exist (`orders` — which `Customers` already lives
  under — is still the only module using it).
- Not fixing the money-precision bug as a side effect of `Stats`'/ `Customers`'
  DTO work if the dedicated fix doc hasn't landed yet — either land that fix
  first, or give `Stats`/`Customers` response DTOs honest `number` types
  matching _current_ (buggy) behavior and note the known-imprecise arithmetic in
  a comment, same posture Batch 4 took (document, don't silently fix
  mid-migration). Prefer landing the fix first if there's room in the session.
- This is very likely the **last batch** — after `Users`, every `apps/web`
  feature with a real backend tag should be migrated (barring `App`/`Health`,
  which have none). Confirm this by grepping every remaining
  `features/*/api/*.ts` file for `apiFetch(` calls once done, not by assuming
  the list above is exhaustive — if something's left over, note it as a real
  Batch 7 rather than silently leaving it stale.

## Execution notes

Append here once this batch (or a meaningful chunk of it) lands — what matched
this plan, what diverged, and whether `CustomerAuth` got unblocked or deferred.
Update `apps/web/AGENTS.md`'s migrated-tags list at the same time, same
convention every prior batch used. If this really is the last batch, say so
plainly and point future readers at `apps/web/AGENTS.md` directly instead of a
"what's left" doc that no longer has anything left.
