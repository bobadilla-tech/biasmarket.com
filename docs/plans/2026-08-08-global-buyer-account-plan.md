# Global buyer account (one buyer identity across stores)

Written before execution, at the user's explicit request, to allow a review pass
before code is written (deviates from this directory's normal "record after the
work lands" convention — see `docs/plans/README.md`). Fold into a normal
changelog entry after the work ships.

**Explicit deviation from a standing recommendation, flagged for the record:**
`docs/audits/product-engineering-business-audit-2026-08-08.md` §17 lists "Global
buyer identity migration" under "Things we should NOT build yet — real schema
work with no demand signal yet." The user has explicitly asked for this anyway
(multi-store buyer trust, cross-store order tracking, future marketplace
positioning). This plan proceeds on that explicit instruction. Whoever executes
should not silently defer scope back to the audit's recommendation — if this
needs re-litigating, that's a conversation with the user, not a unilateral call
during implementation.

## Context

`Customer` (`packages/db/prisma/schema.prisma:386-403`) is scoped
`@@unique([storeId, phone])` — a buyer who shops at two stores gets two
unrelated `Customer` rows, two separate passwords, two separate sessions. Full
current-state facts (confirmed via investigation, not assumed):

- The _only_ uniqueness constraint on `Customer` is the compound
  `(storeId, phone)` key (migration `20260720175558_add_order_flow_tables`). No
  global uniqueness exists on `phone` or `email` anywhere today.
- `Order.customerId` is a nullable scalar FK to `Customer.id`
  (`onDelete: SetNull`) — **there is no DB-level constraint tying
  `Order.customerId`'s owning `Customer.storeId` to `Order.storeId`**; today
  they happen to line up only because `findOrCreateCustomer`
  (`apps/api/src/modules/orders/application/customer-account.service.ts:95-139`)
  always creates/looks up using the checkout's own `store.id`.
- Every read/write path does a `storeId_phone` compound lookup with no
  cross-store concept: `customer-auth.service.ts` login (126-130),
  forgotPassword (112-115), updateProfile's duplicate-phone check (263), and
  `customer-account.service.ts`'s `findOrCreateCustomer` (103-105).
- Buyer session tokens embed `storeId` and are verified against
  `customer.storeId === verified.storeId`
  (`apps/api/src/modules/customer-auth/customer-session.guard.ts:67`) — this is
  an identity-model assumption baked into the guard, not just a filter.
- The web client's every `apiClient.customerAuth.*` call is `(slug, ...)` shaped
  (confirmed across all 7 mutation/query files in
  `apps/web/features/customer-auth/`), and "am I logged in" is answered by a
  per-slug `GET .../me` call with no shared cross-store client state
  (`apps/web/features/customer-auth/queries/use-customer-profile.ts:5,8-10`).
- **Guest checkout is a real, common case today**: `CreateOrderDto` has no
  `customerId` field; a `Customer` row is only created/linked when
  `customerEmail` is provided at checkout (`create-order.usecase.ts:185-201`) —
  phone-only checkouts stay fully guest (`Order.customerId` null). Any migration
  must treat "orders with no linkable customer" as the norm, not an edge case.

## Decision: schema shape

Two options were on the table (per the audit's §4). **This plan picks (a): a new
global `BuyerAccount` + a `CustomerStoreLink` join**, not collapsing `Customer`
to a bare global-unique-phone table.

Reasoning: option (b) (drop `storeId` from `Customer`, global-unique `phone`) is
superficially simpler but destroys the ability to keep any store-specific buyer
data (per-store display name, marketing consent, notes a seller might one day
attach) and — more importantly — offers no clean migration path for the same
phone number belonging to two _different real people_ who happen to shop at two
different stores (a real possibility this early, with no verified-identity
signal beyond a phone number). Option (a) keeps a **link table** so store-scoped
rows are preserved (nothing about the seller-facing Customers dashboard tab
changes) while giving buyers one global root identity to authenticate against.

### New models

```prisma
model BuyerAccount {
  id            String   @id @default(cuid())
  phone         String   @unique
  passwordHash  String?
  passwordVersion Int    @default(0) // bumped on password change; embedded in
                                      // the session token, see "API / auth
                                      // changes" below — replaces the
                                      // per-Customer version stamp the
                                      // current guard derives today
  email         String?
  emailVerified Boolean  @default(false)
  pendingEmail  String?
  pendingPhone  String?
  name          String?
  createdAt     DateTime @default(now())

  stores CustomerStoreLink[]
  orders Order[]
}

model CustomerStoreLink {
  id             String   @id @default(cuid())
  buyerAccountId String
  storeId        String
  createdAt      DateTime @default(now())

  buyerAccount BuyerAccount @relation(fields: [buyerAccountId], references: [id])
  store        Store        @relation(fields: [storeId], references: [id])

  @@unique([buyerAccountId, storeId])
  @@index([storeId])
}
```

`Order` gains a new nullable `buyerAccountId` column pointing at
`BuyerAccount.id`, added **alongside** the existing `customerId` — not a rename.
`customers.service.ts` (seller-facing Customers dashboard,
`apps/api/src/modules/orders/application/customers.service.ts:49-134`)
groups/aggregates directly on `Order.customerId → Customer.id` today; renaming
or repointing that column in place would break it. `customerId` is dropped only
in a later follow-up migration, once the backfill is verified complete (see
"Migration" below) — this is not an open decision, it's the only option that
doesn't break the seller dashboard mid-migration. `Customer` itself is **not
deleted** in this pass — see "Non-goals."

### What happens to `Customer`

**Recommendation: keep `Customer` as-is for the seller-facing Customers
dashboard tab (`apps/api/src/modules/orders/application/customers.service.ts`,
seller CRUD/listing), decoupled from buyer auth.** Buyer authentication moves
entirely onto `BuyerAccount`; `Customer` becomes a denormalized per-store "who
has bought here" projection the seller dashboard reads, populated the same way
it is today (`findOrCreateCustomer`-equivalent logic, now writing to both
`BuyerAccount` and a `CustomerStoreLink` row). This avoids touching
`customers.service.ts`'s seller-facing behavior (out of scope, orthogonal
concern) while still solving the buyer-identity problem. Flag if this decoupling
turns out to be wrong once implementation starts (e.g. if the seller dashboard
needs to show "this buyer is also active in 3 other stores" later) — that's a
legitimate follow-up, not this plan's scope.

## Migration (the hard, real part)

This is a **data migration**, not just a schema change, because existing
`Customer` rows for the same phone number across different stores need to
collapse into one `BuyerAccount`.

1. **Write migration script** (mirrors this repo's existing pattern of hand-run
   scripts, see `apps/api/scripts/seed/`), not a blind Prisma `migrate deploy`:
   - Group existing `Customer` rows by normalized phone (reuse `normalizePhone`
     from `packages/utils/src/phone-country/index.ts:59-63` — the same
     normalizer already applied at checkout and login, so grouping uses the same
     identity rule the rest of the system already relies on).
   - For each phone group: create one `BuyerAccount`. **Collision policy — do
     not auto-merge identity signals that disagree.** Note:
     `docs/plans/2026-08-06-buyer-phone-normalization-fix.md` does **not**
     contain a built collision-handling precedent to mirror (checked — that
     plan's backfill was dropped entirely once it turned out there was no real
     data to migrate); this plan's policy has to be defined fresh, not copied.
     - **Do not use raw `passwordHash` equality as a collision signal.**
       `better-auth/crypto`'s `hashPassword` is salted, so two hashes of the
       _same_ password will almost never be byte-identical — using
       hash-inequality as the "these are different people" trigger would route
       nearly every buyer who set a password at two stores into manual review,
       defeating the point of an automated merge.
     - Use **email equality** as the collision signal instead: if two `Customer`
       rows for the same normalized phone both have a non-null `email` and the
       emails differ, treat that as a real-identity ambiguity — skip the group,
       log it, leave those rows unmigrated for manual review. If only one row
       (or neither) has an email set, merge into one `BuyerAccount`, keeping
       whichever `passwordHash`/`email` belongs to the most-recently-created
       `Customer` row (mirrors "the account the buyer used most recently wins")
       and logging which rows' credentials were superseded, so a buyer who can't
       log in with an old password post-migration has a paper trail. Apply
       cleanly to unambiguous groups (partial completion is the intended
       outcome).
   - Create a `CustomerStoreLink` per original `Customer` row, pointing at its
     store and the new/merged `BuyerAccount`.
   - Repoint every `Order.customerId` from the old `Customer.id` to the resolved
     `BuyerAccount.id`.
   - **Given this repo has no real production traffic yet** (confirmed
     precedent: the payment-proof-image-access-control plan's execution notes
     explicitly relied on "no real production traffic yet" to justify skipping a
     legacy-data backfill) — check with the user before assuming this migration
     can run destructively/directly against whatever dev/staging data exists. If
     there genuinely is no production data, this step simplifies enormously
     (every group is unambiguous); confirm that assumption rather than building
     the full collision-handling machinery for a dataset that may not need it.
     **Do not run any migration script against a real production database
     without explicit user sign-off** — same rule this repo already applies to
     the phone-normalization backfill.
2. **Prisma migration** adds `BuyerAccount`/`CustomerStoreLink`, adds
   `Order.buyerAccountId` (nullable at first, alongside the existing
   `customerId`), backfills it via the script above, then in a _follow-up_
   migration drops `Order.customerId` once the backfill is verified complete —
   don't do this as one big-bang migration that's hard to roll back mid-way.

## API / auth changes

- **New session shape**: buyer session tokens (currently `{customerId, storeId}`
  via `customer-session.guard.ts`) become `{buyerAccountId, passwordVersion}` —
  no `storeId` in the token at all, since the identity is now global. **The
  `passwordVersion` field is not optional**: today's token embeds a
  `derivePasswordVersion`-style stamp (`customer-account-token/index.ts`) that
  is the _only_ mechanism that invalidates existing sessions when a password
  changes (no server-side revocation list exists). Dropping it in the new token
  shape — rather than carrying forward the new `BuyerAccount.passwordVersion`
  field defined above — would silently reintroduce "changing your password
  doesn't log out other sessions" as a regression. `CustomerSessionGuard`
  (`customer-session.guard.ts:47-98`) needs a real rewrite, not a field rename:
  today's `storeId` match check (line 67) is the mechanism that scopes a session
  to one store; removing it means **every endpoint currently trusting "this
  session's storeId" for scoping must instead explicitly check a
  `CustomerStoreLink` exists** (or just query orders by `buyerAccountId`
  directly, unscoped by store, where that's the intent — e.g. the cross-store
  order list). Also carry forward `findOrCreateCustomer`'s existing "matching
  phone, different email → don't mutate, fall back to guest" guard
  (`customer-account.service.ts:120-127`) into the rewritten global lookup —
  it's the same defense against two different real people sharing a phone number
  that this plan's own migration collision policy above is built around; don't
  let the global rewrite accidentally drop it.
- **Endpoints under `stores/:slug/account/*` (`customer-auth.controller.ts`)**:
  `register`/`login`/`forgotPassword` stay conceptually "at a store" (a buyer
  discovers/creates their account from a specific store's login page) but must
  resolve against `BuyerAccount.phone` (global), not `storeId_phone`. On login
  from store A with an account that has no `CustomerStoreLink` to store A yet,
  **decide explicitly**: auto-create the link (so any known buyer becomes
  "linked" to any store they successfully authenticate against), or require an
  explicit opt-in step. Recommendation: auto-create the link on first successful
  login/checkout at a new store — matches the "buyer keeps trust in the
  biasmarket system, not just one store" framing from the user's request, and
  avoids adding a confirmation step to a flow that should stay low-friction.
- **New cross-store endpoints**: `GET account/me` (no slug — this is the first
  genuinely slug-independent buyer endpoint) returning the `BuyerAccount`
  profile + linked stores; `GET account/orders` returning orders across every
  store the account is linked to (or has ever ordered from, if that's broader —
  decide against `CustomerStoreLink` vs. a raw `Order.buyerAccountId` scan;
  recommend the raw scan, since an order can exist without an active
  `CustomerStoreLink` in edge cases like a since-removed link).
- **`findOrCreateCustomer` (`customer-account.service.ts:95-139`)**: rewrite to
  resolve/create a `BuyerAccount` by normalized phone (global lookup, not
  `storeId_phone`), then ensure a `CustomerStoreLink` row exists for the
  checkout's store, then ensure a `Customer` projection row exists too (see
  "What happens to `Customer`" above) if that decoupling is kept.

## Frontend changes

- `apps/web/features/customer-auth/`: every `apiClient.customerAuth.*` call
  currently takes `slug` first — once endpoints stop being store-scoped, these
  call sites and the generated Orval client (regenerate after backend DTO
  changes, per CLAUDE.md's committed-client convention) need updating. This is a
  wide-radius frontend change; expect to touch all 7 mutation/query files plus
  every component that calls them (`account-page-client.tsx`,
  `customer-profile-view.tsx`, `account-orders-section.tsx`,
  login/register/forgot-password forms).
- Session-awareness UX: today "logged in" is answered per-slug with no shared
  client state. A global account plausibly wants a shared "logged in as X"
  indicator across the storefront regardless of which store's URL you're on —
  this is new client-side state, not present anywhere today (confirmed: no
  client-side auth store exists). Scope call: **this plan does not build a
  global nav-bar auth indicator** — that's cosmetic polish, file as a follow-up
  once the backend identity model lands. This plan's frontend scope is:
  login/register/forgot-password/account pages keep working per-store-URL as an
  entry point, but now authenticate against the global account underneath.

## Non-goals

- Not deleting the `Customer` model or the seller-facing Customers dashboard tab
  — see "What happens to `Customer`" above.
- Not building the landing-page "join as seller / join to buy" marketplace
  positioning, or product/store promotion surfaces — the user flagged these
  explicitly as future/"not necessarily done" work. This plan only lays the
  identity foundation (`BuyerAccount` as a real global root) that a future
  marketplace feature would need; it does not build any marketplace UI.
- Not building a global nav-bar "logged in as X" indicator (see above).
- Not touching seller-side better-auth at all — this is buyer-identity only.

## Files likely touched

- `packages/db/prisma/schema.prisma` + new migrations (`BuyerAccount`,
  `CustomerStoreLink`, `Order.buyerAccountId`, follow-up drop of
  `Order.customerId`)
- New migration script (location: mirror `apps/api/scripts/seed/`'s convention,
  e.g. `apps/api/scripts/migrate-buyer-accounts.ts`)
- `apps/api/src/modules/customer-auth/` — controller, service,
  `customer-session.guard.ts`, all DTOs
- `apps/api/src/modules/orders/application/customer-account.service.ts`
  (`findOrCreateCustomer`)
- `apps/api/src/modules/orders/application/customers.service.ts` — **read before
  editing**: confirm the decoupling from `BuyerAccount` above doesn't break the
  seller Customers-tab listing/detail queries.
- `apps/web/features/customer-auth/` (all mutations/queries/components)
- `apps/api/openapi.json` + `packages/types/generated/**` (regen + commit per
  CLAUDE.md convention, after DTO shape changes)
- **Shared-file conflict warning**: the buyer mini-dashboard plan
  (`2026-08-08-buyer-mini-dashboard-plan.md`) and the shipping-addresses plan
  (`2026-08-08-buyer-shipping-addresses-plan.md`) both build on top of whatever
  identity model lands here — re-read this plan's "Execution notes" (once filled
  in) before starting either, since the exact shape of `BuyerAccount`/session
  may shift during implementation.

## Verification

- `pnpm db:generate` after schema changes; `pnpm typecheck` across api/web.
- Unit tests: `customer-auth.service.spec.ts`,
  `customer-account.service.spec.ts` (or equivalent) rewritten for the new
  global-lookup shape.
- e2e: extend `apps/api/test/customer-account-auth.e2e-spec.ts` with a
  cross-store scenario — register/login at store A, then check out at store B
  with the same phone, confirm one `BuyerAccount`, two `CustomerStoreLink` rows,
  both orders visible via `GET account/orders`.
- Manually verify the migration script against a copy of real dev data (not
  prod) before running for real; confirm collision-logging output is legible.

## Definition of done

One buyer identity (`BuyerAccount`) persists across stores; a buyer who
registers/checks out at store A and later checks out at store B under the same
phone number authenticates as the same account and can see orders from both
stores via one `GET account/orders` call. Pre-existing `Customer` rows are
either merged into a `BuyerAccount` or explicitly logged as
unmigrated-pending-manual-review — no silent data loss. Seller-facing Customers
dashboard behavior is unchanged.

## Execution notes

Landed on a dedicated branch/worktree (`feat/global-buyer-account`, checked out
at `../biasmarket.com-global-buyer-account` off `origin/main`, pushed to
`origin` so sibling plans can build on it), not on the session's starting
branch (`feat/buyer-shipping-addresses`) — this plan's blast radius is high
enough to warrant full isolation. Before touching
`apps/api/src/modules/customer-auth/` or `CustomerSessionGuard`, checked every
local/remote branch for concurrent changes to that module or
`apps/api/src/modules/orders/`: none of the sibling plans this batch flags as
depending on this one (buyer-proof-of-payment-upload,
buyer-shipping-addresses, buyer-mini-dashboard) had started as branches yet.
Unrelated in-flight branches (`codacy-fixes`, `feat/cfg-wa-templates`,
`fix/order-payment-precision-v2`) touch adjacent files but not the
identity/session surface this plan rewrites — no conflict.

**Schema and decisions taken as-is, no deviation:** `BuyerAccount` +
`CustomerStoreLink` as specified, `Order.buyerAccountId` added alongside
`customerId` (not replacing it), `Customer` kept unchanged as a per-store
projection decoupled from auth, session token shape `{buyerAccountId,
passwordVersion}` with `BuyerAccount.passwordVersion` as a real `Int` column
bumped on every password change (`derivePasswordVersion`'s hash-derived stamp
is gone entirely — deleted, not deprecated), and auto-link-on-first-success
(no opt-in step) for both login and checkout, per the plan's recommendation.
`findOrCreateCustomer`'s "matching phone, different email → don't mutate, fall
back to guest" guard was carried forward onto `BuyerAccount` intact.

**Real deviation, worth flagging: the frontend needed zero changes.** The plan
expected "a wide-radius frontend change ... expect to touch all 7
mutation/query files." That didn't happen, because `register`/`login`/
`forgotPassword`/`changePassword`/`me`/`updateMe`/`logout` kept their exact
request/response DTO shapes under the same `stores/:slug/account/*` routes —
only the internal resolution moved from `Customer` to `BuyerAccount`. Verified
by diffing the regenerated `packages/types/generated/customer-auth/` and
`customer-account/` clients against the pre-change versions: zero diff. `apps/
web/features/customer-auth/**` was never touched, and `pnpm --filter web test`
(192 tests) passes unmodified — real confirmation, not an assumption. The two
brand-new endpoints (`GET account/me`, `GET account/orders`, in a new
`GlobalAccountController`, no slug) are live and e2e-tested but **not** added
to `packages/types/orval.config.ts`'s tag filter, so no generated client
exists for them yet and nothing in the storefront calls them — matches the
plan's explicit non-goal (no nav-bar "logged in as X" indicator this pass).
Add the `GlobalAccount` tag to the Orval filter when a future pass wires up
that UI.

**Migration script was written, not run.** `apps/api/scripts/
migrate-buyer-accounts.ts` implements the collision policy exactly as
specified (email-equality signal, most-recently-created row wins on
passwordHash/email, raw hash comparison never used, unambiguous groups apply
even when some groups are skipped) and defaults to a dry run — it requires an
explicit `--apply` flag to write anything, on top of this repo's standing rule
against running migration scripts against real data without sign-off. Neither
the dry run nor `--apply` was executed in this session; no user sign-off was
sought because there was no live database in the execution environment to run
it against in the first place (see below).

**Schema migration SQL was hand-authored, not generated via `prisma migrate
dev`.** The execution environment (a fresh git worktree) had no running
Postgres and no `.env` (copied the config — not data — from the primary
worktree to unblock builds). Running `prisma migrate dev` would have required
a live database connection this environment didn't have, so the migration
(`packages/db/prisma/migrations/20260809220000_add_buyer_account/
migration.sql`) was written by hand, matching this repo's existing migration
SQL conventions exactly (`CreateTable`/`CreateIndex`/`AddForeignKey` blocks,
same default-action inference as `Order.customerId`'s existing `SET NULL`
FK). `pnpm db:generate` (`prisma generate`, no DB connection needed) was run
so the Prisma Client types match the new schema — `pnpm typecheck` passes
clean on that basis. **The SQL has not been applied to any database.**
Whoever picks this up next needs to run `prisma migrate deploy` (or `pnpm
--filter @biasmarket/db migrate` against a real dev DB) before this is
usable, and should sanity-check the hand-written SQL against what `prisma
migrate dev` would have generated once a database is available.

**e2e test extended, not run.** `apps/api/test/customer-account-auth.e2e-spec.ts`
now has the cross-store scenario the plan's Verification section asked for:
register/login at store A, checkout at store B with the same phone, then
assert one `BuyerAccount` row, two `CustomerStoreLink` rows, both orders via
`GET /account/orders`, and both store slugs via `GET /account/me`'s `stores`
list. It compiles clean (part of the full `pnpm typecheck` pass) but wasn't
executed — same reason as above, no live Postgres in this environment. Run
`pnpm docker:dev` then `pnpm --filter api test:e2e` before trusting this
beyond "it typechecks."

**What was actually run and passed, in this environment:** `pnpm typecheck`
across `api`/`web`/`@biasmarket/db`/`@biasmarket/utils`/`@biasmarket/types`
(clean); `pnpm --filter api test` (394/394); `pnpm --filter web test`
(192/192, unmodified); `pnpm --filter @biasmarket/utils test` (66/66, covers
the rewritten `customer-account-token` util). `pnpm --filter api test:e2e`
was **not** run — no database available.

One incidental, unrelated diff worth flagging so a reviewer doesn't mistake it
for buyer-account work: regenerating `packages/types/generated/**` picked up
cosmetic reformatting in `products.ts`, `stores.ts`, and `api.schemas.ts`
(import-order and TS indexed-access-type parenthesization) from whatever
Prettier/Orval patch versions this fresh worktree's `pnpm install` resolved,
unrelated to any DTO change in this plan. `customer-auth.ts` and
`customer-account.ts` — the two clients this plan's backend changes actually
touch — have **zero** diff, confirming the contract really didn't change.
