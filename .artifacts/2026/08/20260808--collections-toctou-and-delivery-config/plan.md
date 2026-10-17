# Collections reorder TOCTOU fix + delivery-config test coverage

**Status:** Implemented 2026-08-08. The pre-implementation content below
(problem analysis, revised fix scope, severity classification) is historical and
stands as written; see the "Post-implementation notes" section at the bottom for
what actually landed, the divergences, and the learnings.

**Source:** `docs/audits/audit-2026-08-08.md` §12 (important findings #8, #10),
§16 (#9).

## Context

Two small, unrelated, already-diagnosed items bundled together because they're
both cheap, both already have the investigation work done (by the audit and, for
the first one, by the team's own prior Codacy-review pass), and both touch
modules no other concurrent plan touches — lowest collision risk in this whole
batch.

## Problem 1 — `collections.service.ts` `reorderProducts` robustness gap

(**not** an identical TOCTOU — corrected below, see Severity Classification)

**Verified against current code**
(`apps/api/src/modules/store-sections/store-sections.service.ts` `reorder()`, as
shipped): the fix wraps the whole thing in
`this.prisma.$transaction(async (tx) => { ... })`, and inside the loop over
`dto.sectionIds` runs

```ts
const result = await tx.storeSection.updateMany({
  where: { id: sectionId, storeId },
  data: { position },
});
if (result.count !== 1) {
  throw new BadRequestException(
    "Una o más secciones no pertenecen a esta store",
  );
}
```

then re-reads the rows tenant-scoped for the return value. The preflight
`findMany` ownership check from before the fix is _kept_ (not removed) — the fix
added tenant-scoping to the write, on top of the existing preflight, not instead
of it. This confirms the earlier plan description of the store-sections fix was
accurate.

**What's inaccurate in the original version of this plan:
`collections.service.ts`'s `reorderProducts` does _not_ have the identical
pattern.** Current code:

```ts
async reorderProducts(collectionId, storeId, userId, dto) {
  await this.findOwnedCollection(collectionId, storeId, userId);
  return this.prisma.$transaction(
    dto.productIds.map((productId, position) =>
      this.prisma.collectionProduct.update({
        where: { collectionId_productId: { collectionId, productId } },
        data: { position },
      })
    ),
  );
}
```

Two concrete differences from store-sections' pre-fix bug:

1. **There is no preflight `findMany` over `productIds` at all.** Only
   `findOwnedCollection` runs first, and it only validates that `collectionId`
   belongs to `storeId` — it says nothing about whether the individual
   `productIds` are members of that collection.
2. **The write is not "unscoped" the way store-sections' was.**
   `CollectionProduct`'s primary key in `packages/db/prisma/schema.prisma` is
   the compound `@@id([collectionId, productId])` — there is no separate
   surrogate `id`. The `update()` call's
   `where: { collectionId_productId: { collectionId, productId } }` is keyed on
   that compound primary key, and `collectionId` has already been
   ownership-verified by `findOwnedCollection` before the transaction runs.
   Because the compound key embeds the verified `collectionId`, this write can
   **never** match a `CollectionProduct` row belonging to a different
   collection/store — there's no bare-`id`-only write like store-sections had.

**The actual defect is narrower:** if `dto.productIds` contains a value that
isn't a member of this collection (typo, stale client state, or a non-owning
caller probing with a foreign `productId`), Prisma's singular `.update()` throws
`PrismaClientKnownRequestError` P2025 ("record not found") instead of resolving
to zero affected rows. Nothing in
`apps/api/src/common/filters/all-exceptions.filter.ts` special-cases Prisma
errors (confirmed — no `PrismaClientKnownRequestError`/`P2025` handling anywhere
in `apps/api/src`), so this falls into the filter's generic `catch()` branch: an
unhandled 500, with the raw error logged, instead of a clean 400. That's an
error-handling/robustness gap, not a tenant-isolation breach — see Severity
Classification below for why.

**Revised fix scope:** bring `reorderProducts` in line with the store-sections
pattern for consistency and to turn the opaque 500 into a proper 400 — swap the
per-item `collectionProduct.update()` for
`collectionProduct.updateMany({ where: { collectionId, productId, data:
{ position } })`
inside the `$transaction`, asserting `result.count === 1` per item and throwing
`BadRequestException` otherwise (mirroring store-sections'
`if (result.count !== 1) throw new BadRequestException(...)` shape exactly).
`storeId` scoping is additionally enforced at the database boundary, not just
transitively: both write predicates carry `collection: { storeId }` and
`product: { storeId }` relation filters alongside `collectionId`/`productId`
(`CollectionProduct` has no `storeId` column of its own, so the store scope goes
through its relations), so a cross-store collection/product pair is rejected by
the write itself (count 0 → 400), not only by the preflight
`findOwnedCollection` check. The regression spec asserts exactly this: a
`productId` belonging to a different store's product is rejected even when
`collectionId` is the owner's.

## Problem 2 — `delivery-config` has zero test coverage

`apps/api/src/modules/delivery-config/` is the only api module with no
`.spec.ts` files at all (confirmed: `ls` on the module directory shows only
`delivery-config.module.ts`, `delivery-config.service.ts`,
`delivery-config.controller.ts`, and `dto/*` — no `*.spec.ts`). Add unit tests
matching the coverage depth and style of
`apps/api/src/modules/payment-config/payment-config.service.spec.ts`, the
closest analog (same shape: per-store config, `enabled` toggle, `details` JSON,
unique on `[storeId, type/method]`) — mock `PrismaService` the same way
(`store.findUnique`/upsert-style mocks via `vi.fn()`, no real DB).

**Confirmed while reviewing `delivery-config.service.ts`: there is no
service-layer pickup/courier validation to test** — `type` is constrained to
`"PICKUP" | "COURIER"` entirely via `@IsIn(["PICKUP", "COURIER"])` on
`UpsertDeliveryMethodDto` (class-validator, DTO layer), not in the service. So
"whatever delivery-config-specific validation exists" in the original wording
resolves to: none beyond what payment-config already demonstrates how to test.
Cover:

- `findAllForStore` — ownership checks (`NotFoundException` on missing store,
  `ForbiddenException` on non-owner), happy path.
- `upsert` — create path (defaults: `enabled` defaults to `true`, `details`
  defaults to `{}`, mirroring payment-config's `upsert` tests), update path
  (partial `enabled`/`details` merge, matching the conditional spread in
  `upsert`'s `update:` object).
- `remove` — ownership check, happy path (payment-config has no `remove` method,
  so this one has no direct template — write it from `assertOwnership` +
  `prisma.deliveryMethodConfig.delete` shape).
- `findEnabledForSlug` — the untenanted public-storefront path (no
  `userId`/ownership check at all, looks up by `slug` instead of `storeId`,
  throws `NotFoundException` when the slug doesn't resolve to a store, filters
  `enabled: true`). This is meaningfully different from anything in
  `payment-config.service.spec.ts` and is easy to accidentally skip if copying
  that file too literally — don't skip it, it's the one method here that's
  reachable by an unauthenticated caller.

## Files touched

- `apps/api/src/modules/collections/collections.service.ts` (Problem 1)
- `apps/api/src/modules/collections/collections.service.spec.ts` (Problem 1 —
  add/extend a test asserting the scoped-update behavior, mirroring whatever
  test was added for `store-sections` in the same cleanup)
- `apps/api/src/modules/delivery-config/delivery-config.service.spec.ts`
  (Problem 2 — new file)

## Verification

- `pnpm --filter api test` — both modules' spec suites pass.
- For Problem 1: write a test that calls `reorderProducts` with a `productId`
  that isn't a member of the given `collectionId` and asserts a clean
  `BadRequestException` (via the new `count !== 1` check), not the current
  unhandled `PrismaClientKnownRequestError`/500. This is a
  robustness/error-contract regression test, not a cross-tenant-mutation test —
  see Problem 1 above for why there's no cross-tenant mutation to reproduce here
  (the existing `findOwnedCollection` + compound-PK write already prevent it).

## Definition of done

`collections.service.ts`'s `reorderProducts` uses the same `updateMany` +
count-assertion shape already applied to `store-sections.service.ts`'s
`reorder`, replacing the unhandled-500 failure mode with a clean 400;
`delivery-config` has real test coverage comparable to its sibling config
modules, including the untenanted `findEnabledForSlug` path.

## Severity Classification

**Problem 1 — `collections.service.ts` `reorderProducts`: LOW.** Not exploitable
for cross-tenant data mutation. An authenticated-but-non-owning seller cannot
reach another store's data through this endpoint: `findOwnedCollection` throws
`NotFoundException` before the transaction runs unless the caller's session
actually owns the `storeId`/`collectionId` pair in the URL, and even a caller
who _does_ own the collection can't smuggle a foreign `productId` into an actual
write — `CollectionProduct`'s compound primary key
(`@@id([collectionId, productId])`) means an update keyed on
`{ collectionId, productId }` where `collectionId` is already ownership-verified
can only ever match rows already scoped to that collection. The worst outcome
today is a caller (who does own the collection) supplying a `productId` not in
it and getting an unhandled 500 instead of a 400 — a robustness/error-contract
nit, not a security hole. The shipped fix keeps this at LOW but closes the
residual "scoping relies on the preflight ownership check alone" gap: the write
predicates now scope both the `collection` and `product` relations to `storeId`
at the database boundary, so even a caller who somehow got past
`findOwnedCollection` (or a future refactor that weakened it) could not match a
row outside the caller's store. Worth fixing for consistency with the shipped
store-sections pattern and for a better error contract, but it is not a TOCTOU
tenant-isolation bug the way the original version of this plan (and the
codacy-cleanup doc's "same shape" note) implied. Downgrade from the audit's
presumed severity.

**Problem 2 — `delivery-config` test coverage: MEDIUM.** No active incident and
the current implementation is simple and, on inspection, correct — mirrors the
already-tested `payment-config` shape closely, and `assertOwnership` is shared
boilerplate already exercised elsewhere. It's MEDIUM rather than LOW because
`delivery-config` is genuinely the _only_ api module with zero test coverage, it
does perform real tenant-boundary enforcement (`assertOwnership` gates
`findAllForStore`/`upsert`/`remove`), and it has one untenanted public path
(`findEnabledForSlug`) that's easy to regress silently since nothing currently
asserts its `enabled: true` filter or its slug-not-found handling. It's MEDIUM
rather than HIGH because there's no evidence of a live bug — this is preventive
coverage closing a gap, not a fix for something currently broken.

## Post-implementation notes

### What landed

**Problem 1 — `reorderProducts` (`collections.service.ts`).** Implemented per
the revised fix scope, with one hardening added during execution: the reorder
now runs inside `this.prisma.$transaction(async (tx) => { ... })`, iterating
`dto.productIds.entries()`, issuing
`tx.collectionProduct.updateMany({ where: { collectionId, productId,
collection: { storeId }, product: { storeId } }, data: { position } })`
per item, asserting `result.count === 1`, and throwing
`BadRequestException("Uno o más productos no pertenecen a esta colección")` on a
mismatch. The opaque P2025/unhandled-500 path is gone — a non-member `productId`
now surfaces as a clean 400. **Both write predicates are scoped to `storeId` at
the database boundary via their `collection`/`product` relation filters** (not
only reached transitively through the already-ownership-verified
`collectionId`): `CollectionProduct` has no `storeId` column of its own, so the
store scope goes through its relations — the `updateMany` where-clause cannot
match a row whose collection or product belongs to another store, and the same
scoping applies to the post-write re-read `findMany`.

`collections.service.spec.ts` updated to match the new shape:

- Mock surface: `collectionProduct.update` replaced by
  `collectionProduct.updateMany`, `collectionProduct.findMany` added; the
  `$transaction` mock switched from the array form
  (`vi.fn((ops) => Promise.all(ops))`) to the interactive form
  (`vi.fn((fn) => fn(prisma))`) — same as `store-sections.service.spec.ts`.
- The existing happy-path test now asserts the two `updateMany` calls (each
  carrying `collection: { storeId }`/`product: { storeId }` alongside
  `collectionId`/`productId`) and the re-read `findMany`, and checks the
  resolved return value.
- New regression test: `updateMany` resolving `{ count: 0 }` →
  `BadRequestException`. This is the error-contract test the plan's Verification
  section called for.
- New cross-store test: a `productId` that belongs to a different store's
  product (i.e. whose `product.storeId !== collection.storeId`) is rejected —
  the store-scoped `updateMany` predicate resolves `{ count: 0 }` and the call
  throws `BadRequestException`. This asserts the DB-boundary scoping, not just
  the preflight `findOwnedCollection` guard, blocks cross-store
  collection/product pairs.

**Problem 2 — `delivery-config.service.spec.ts` (new file, 11 tests).** Coverage
matches the payment-config template plus the plan's two additions:

- ownership checks — 404 on missing store, 403 on non-owner (via
  `findAllForStore`).
- `findAllForStore` happy path (asserts the `{ where: { storeId } }` call).
- `upsert` — create with both defaults (`enabled: true`, `details: {}`),
  explicit `enabled`/`details` create, `enabled`-only update merge, and
  `details`-only update merge.
- `remove` — 404 on missing store (no direct payment-config template; written
  from `assertOwnership` + `deliveryMethodConfig.delete`), happy path asserting
  `{ where: { storeId_type: { storeId, type: "PICKUP" } } }`.
- `findEnabledForSlug` — slug-not-found → 404 (and asserts `findMany` is never
  reached), and the happy path asserting the lookup goes by `slug` (not
  `storeId`) and that only `enabled: true` rows are returned for the resolved
  store. The untenanted path the plan flagged as easy to skip was covered.

Neither module's DTOs, controllers, nor `delivery-config.service.ts` logic
changed — the delivery-config work was purely additive test coverage.

### Divergences from the plan

- **Return-value re-read (Problem 1).** The revised fix scope says only "swap
  the per-item `collectionProduct.update()` for `collectionProduct.updateMany()`
  - count assertion". `updateMany` resolves to `{ count }`, not rows, while
    `collections.controller.ts`'s `reorderProducts` endpoint is typed
    `Promise<CollectionProductResponseDto[]>` — so a bare swap would have broken
    the response contract. Following the store-sections pattern in full, the
    transaction re-reads the rows tenant-scoped
    (`tx.collectionProduct.findMany({ where: { collectionId, productId: { in:
  dto.productIds } }, orderBy: { position: "asc" } })`)
    and returns them. The plan underspecified this; "same shape as
    store-sections" implied it.
- **`upsert` details-only branch (Problem 2).** payment-config's `upsert`
  conditionally spreads only `enabled`; delivery-config's also conditionally
  spreads `details`. A literal copy of the payment-config spec would have left
  that branch untested, so an extra details-only merge test was added.

### Learnings

- **A "swap to `updateMany`" plan note hides a return-contract decision.** The
  load-bearing part of the store-sections pattern is the whole shape — scoped
  write, `count === 1` assertion, and a tenant-scoped re-read to preserve the
  response type — not just the `updateMany` call. When mirroring it, check what
  the endpoint promises to return.
- **The `$transaction` mock in specs is form-coupled to the service.** Moving a
  method from `$transaction(opsArray)` to `$transaction(async (tx) => ...)`
  breaks the `vi.fn((ops) => Promise.all(ops))` mock shape; it must become
  `vi.fn((fn) => fn(prisma))`. The spec caught this immediately, but it's the
  kind of coupling worth knowing before editing either side.
- **Full-suite green is not a safe signal in a shared working tree.** This plan
  touched no orders code, yet `pnpm --filter api test` reported 4 failures in
  `order.controller.spec.ts` / `create-order.usecase.spec.ts`. They trace to
  mid-flight changes from the concurrent `orders-module-hardening` work in the
  same tree: `git stash` back to HEAD baseline makes those specs pass 37/37.
  When the tree hosts concurrent plans, scope verification to the touched
  modules and attribute out-of-module failures to the shared state before
  treating them as regressions.
- **`pnpm --filter api typecheck` regenerates `apps/api/src/metadata.ts`** (its
  `pretypecheck` runs `generate:swagger-metadata`). In a shared tree where other
  plans are changing DTOs/controllers, this can surface a `metadata.ts` diff
  that isn't yours — leave it alone unless the plan says to regenerate.
- **No `lint` script exists in any package yet** (turbo's `lint` task is an
  empty passthrough), matching the note in
  `2026-08-08-codacy-review-cleanup.md`. `tsc --noEmit` + vitest are the
  effective checks for this change set.

### Verification (as run)

- Targeted: `collections.service.spec.ts` (8), `delivery-config.service.spec.ts`
  (11), plus the `payment-config.service.spec.ts` template (6) → 25/25 pass.
- `pnpm --filter api typecheck` → clean.
- Full `pnpm --filter api test` → 360 pass; the 4 failures are all in the orders
  module from concurrent in-progress work, confirmed unrelated via the stash
  check above.
