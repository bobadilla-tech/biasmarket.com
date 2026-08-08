# Collections reorder TOCTOU fix + delivery-config test coverage

**Status:** Pre-implementation plan (written ahead of the work, per audit
follow-up request).

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
`collectionProduct.updateMany({ where: { collectionId, productId }, data:
{ position } })`
inside the `$transaction`, asserting `result.count === 1` per item and throwing
`BadRequestException` otherwise (mirroring store-sections'
`if (result.count !== 1) throw new BadRequestException(...)` shape exactly).
`storeId` scoping is reached transitively through the already-verified
`collectionId` — `CollectionProduct` has no `storeId` column of its own, so
there's nothing further to add to the `where`.

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
nit, not a security hole. Worth fixing for consistency with the shipped
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
