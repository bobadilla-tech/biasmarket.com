# Buyer shipping addresses + delivery-address capture at checkout

Written before execution, at the user's explicit request, to allow a review pass
before code is written (deviates from this directory's normal "record after the
work lands" convention — see `docs/plans/README.md`).

## Context

Confirmed via investigation: **there is no address model anywhere in this
schema, and courier checkout captures no structured address at all today.**

- Full Prisma model list has no `Address` model. `Order.deliveryDetails`
  (`packages/db/prisma/schema.prisma:221`) is a bare `Json` column.
- `DeliveryMethodConfig.details` (`schema.prisma:356`, also bare `Json`) is
  populated by the seller only with `estimatedCost` for `COURIER`
  (`apps/web/features/store-settings/components/delivery-section.tsx:80-82`) —
  this is a **store-level shipping-cost estimate**, not a buyer address field.
- At checkout, `create-order.usecase.ts:310-338` snapshots
  `deliveryConfig.details` (the store's cost estimate) verbatim into
  `Order.deliveryDetails`, merging in `pickupPointLabel` for pickup orders.
  **`checkout-form.tsx` has no address input at all for `COURIER`** — confirmed
  via full read of the delivery-method section (`checkout-form.tsx:296-419`):
  choosing `COURIER` shows no address form, just the delivery-type toggle. A
  courier order today captures _zero_ buyer-supplied address information.
- Pickup-point selection (the other delivery path) is fully built already
  (`PickupPoint` model, `findEnabledForSlug`, checkout dropdown/cards) — this
  plan does not touch pickup-point selection itself, only adds addresses for the
  courier path and a reusable address list for buyer accounts.
- Per the user's framing: "the shipping costs can be really variable so we
  should usually tell them to go talk by whatsapp to the seller at least for
  now... but at least following the normal flow, the buyer should be able to
  [enter address / pick pickup point]." This scopes the plan down correctly:
  **capture the address, don't build shipping-cost calculation** — cost
  negotiation stays a WhatsApp conversation, matching
  `DeliveryMethodConfig.details.estimatedCost`'s existing role as a rough
  seller-set estimate shown pre-checkout, not a computed rate.

## Decision: schema shape

New `Address` model, buyer-owned so it's reusable across orders (and,
eventually, across stores once the global-buyer-account plan lands):

```prisma
model Address {
  id           String   @id @default(cuid())
  customerId   String
  label        String?  // "Casa", "Trabajo" — buyer's own name for it
  recipientName String
  phone        String
  line1        String
  line2        String?
  city         String
  region       String?  // department/province, optional — Peru-first, keep loose
  reference    String?  // "frente al parque" — very common in LatAm addresses
  isDefault    Boolean  @default(false)
  createdAt    DateTime @default(now())

  customer Customer @relation(fields: [customerId], references: [id])

  @@index([customerId])
}
```

**Attach to `Customer`, not a new global identity, for this pass.** The
global-buyer-account plan (`2026-08-08-global-buyer-account-plan.md`) is a
separate, larger migration; this plan should not block on it. Scope decision:
addresses are per-`Customer` (i.e. per-store buyer identity) for now, same as
the rest of the current buyer data model. **If the global buyer-account plan
lands later**, moving `Address.customerId` to `Address.buyerAccountId` is a
small follow-up (one FK repoint + migration), explicitly flagged as a known
future step, not a blocker now.

**Guest checkout implication**: since `Order.customerId` is only populated when
`customerEmail` is given (see the global-account plan's Context section for the
exact mechanism), a guest phone-only courier checkout has nowhere to save a
reusable address. That's fine — for guest checkout, keep capturing the address
as free-form fields directly on the order (extending `deliveryDetails`, not
creating an `Address` row); only **logged-in buyers** get the save-and-reuse
address list. Don't make address-saving a checkout blocker for guests.

## Important correction: checkout has no session awareness today — don't design around one existing

Confirmed via review: `CheckoutController.create`
(`apps/api/src/modules/orders/infrastructure/checkout.controller.ts:87-102`) is
`@Public()` with only a `ThrottlerGuard` — **no `CustomerSessionGuard`, no
cookie read, nothing.** `create-order.usecase.ts:185-201` only resolves
`customerId` by matching `dto.customerEmail` against `findOrCreateCustomer`
(`customer-account.service.ts`) — it never reads a buyer's session cookie. So
the earlier idea of "load the saved address by `addressId`, ownership- check it
belongs to the resolved customer" has no session to check against today, and the
"resolved customer" (via email match) isn't necessarily the same row as
whichever `Customer` the buyer is actually logged in as — those could silently
diverge (e.g. a buyer logged in under one account checking out with a different
email).

**Simplification adopted: drop `addressId` from `CreateOrderDto` entirely.**
Checkout keeps accepting only inline `shippingAddress` fields (the plan's
existing guest-path shape) — for both guests and logged-in buyers. A logged-in
buyer's saved default address is **prefilled client-side**: the checkout form
(while the buyer is browsing, before submit) calls the already-session-gated
`GET stores/:slug/account/addresses` endpoint (a normal fetch from a client
component that already has the buyer's cookie) and pre-populates the inline
address fields with the default address if one exists — the buyer can still edit
before submitting. This avoids adding session-awareness to the `@Public()`
checkout endpoint and the resolved-customer-vs-session-buyer reconciliation
problem entirely, at the cost of one extra snapshot write per order instead of
an FK reference — a good trade for an MVP-scoped feature, matching this
codebase's existing "manual, low-infra" posture. If real usage later shows
buyers want addressId-based reuse without re-typing, that's a follow-up, not
this plan's scope.

## Backend changes

1. Prisma migration: new `Address` model + relation on `Customer`.
2. New module `apps/api/src/modules/addresses/` (or fold into `customer-auth` if
   that's a better fit given it's buyer-session-gated — decide during
   implementation; `customer-auth` already owns buyer-profile-shaped data) —
   CRUD gated by `CustomerSessionGuard`:
   `GET/POST stores/:slug/account/addresses`,
   `PATCH/DELETE stores/:slug/account/addresses/:id`. Ownership check:
   `address.customerId === session.id` (the `@CustomerSession()` shape is
   `{ id, storeId }` — confirm against `customer-session.guard.ts` before
   writing this, there is no `session.customerId` field). **Setting
   `isDefault: true` on one address must run in a transaction that first unsets
   `isDefault` on any other address for the same customer** — nothing in the
   schema enforces at-most-one-default, so this has to be handled explicitly in
   the service; there's no existing "single default row" pattern elsewhere in
   this codebase to copy, write it from scratch.
3. `CreateOrderDto` keeps its existing inline `shippingAddress` field shape (no
   new `addressId` field — see correction above), required when
   `deliveryMethodType === "COURIER"`, unused when `PICKUP`. Validate this
   conditional requirement (COURIER without any address fields should 400, not
   silently create an order with no delivery address).
4. `create-order.usecase.ts` — when `COURIER`: snapshot the submitted
   `shippingAddress` fields into `Order.deliveryDetails` alongside the existing
   `estimatedCost` (same "snapshot at order time" pattern already used for
   `pickupPointLabel` — don't invent a different persistence strategy for this
   one field). No `Address` row lookup happens here at all now — addresses are
   purely a client-side prefill convenience, never read server-side during order
   creation.
5. **Regenerate OpenAPI + Orval client** after DTO changes.

## Note for the global-buyer-account plan, if it lands after this one

`2026-08-08-global-buyer-account-plan.md` changes `CustomerSessionGuard`'s
session shape entirely (`{buyerAccountId, passwordVersion}`, no `storeId`). The
address CRUD guard/ownership check this plan builds will need a real rewrite at
that point, not just an `Address.customerId → buyerAccountId` FK repoint — flag
this in whichever plan lands second, don't assume the other one will catch it.

## Frontend changes

1. New buyer-account UI: address list (add/edit/delete/set-default) — this is
   new surface, best placed inside the mini-dashboard plan's account panel
   (`2026-08-08-buyer-mini-dashboard-plan.md`) since that's where "my saved
   stuff" already lives conceptually. **This plan owns the address CRUD
   form/mutations; the mini-dashboard plan owns where the entry point/nav item
   lives.** Coordinate sequencing.
2. `checkout-form.tsx` — when `deliveryMethodType === "COURIER"`: always show
   the inline address form (guests and logged-in buyers both submit the same
   `shippingAddress` fields — see the correction above, there is no `addressId`
   picker). For a logged-in buyer, on mount, fetch
   `GET stores/:slug/account/addresses` and prefill the inline form with the
   default address if one exists (plain client-side prefill, not a
   `SelectableCard` picker — there's only ever one prefilled candidate, the
   default; if the buyer has multiple saved addresses and wants a non-default
   one, they edit the prefilled fields directly for v1). This is new
   session-awareness for `checkout-form.tsx`, which today has zero references to
   buyer login state (`useCustomerProfile` or equivalent) — confirm this fetch
   fails gracefully (empty form, not an error) for guests/logged-out buyers,
   matching how other optional-if-logged-in data should degrade.
3. Keep the existing "shipping cost coordinated via WhatsApp" messaging intact
   (per the user's framing above) — this plan adds address capture, not a cost
   calculator. If `estimatedCost` is set on the store's `DeliveryMethodConfig`,
   keep showing it as-is (already partially wired, confirmed at
   `delivery-section.tsx:80-82`); don't build dynamic rate-by-address logic.
4. i18n: new copy for address form fields (`packages/i18n/es/` + English).

## Non-goals

- Not building shipping-rate calculation by address/zone — explicitly deferred
  to WhatsApp coordination per the user's own framing.
- Not moving addresses onto a global buyer identity in this pass — see
  "Decision: schema shape" above.
- Not touching pickup-point selection, which is unrelated and already fully
  built.
- Not validating addresses against any postal/geocoding API — free-text fields
  only, matching this codebase's existing "manual, low-infra" MVP posture (no
  Stripe, no payment gateway, no automation beyond what's already there).

## Files likely touched

- `packages/db/prisma/schema.prisma` + migration
- New `apps/api/src/modules/addresses/` (or extend `customer-auth`)
- `apps/api/src/modules/orders/dto/create-order.dto.ts`,
  `apps/api/src/modules/orders/application/create-order.usecase.ts`
- `apps/web/features/checkout/components/checkout-form.tsx`
- New `apps/web/features/customer-auth/components/address-*` (or a new
  `features/addresses/` slice if it grows past a couple of components — follow
  the feature-sliced convention in `apps/web/AGENTS.md`)
- `apps/api/openapi.json` + `packages/types/generated/**`

## Verification

- Unit tests for the new addresses service (ownership checks, default- address
  handling).
- e2e: logged-in buyer saves an address, checks out with `COURIER` +
  `addressId`, confirm `Order.deliveryDetails` contains the snapshotted address;
  guest checkout with inline `shippingAddress`, same snapshot check without any
  `Address` row created.
- Manual browser pass: add/edit/delete addresses from the buyer account panel,
  pick one at checkout, confirm it round-trips into the order the seller sees in
  the dashboard (`order-detail-sheet.tsx`'s delivery-info display — confirm it
  renders the new address fields sensibly, not just the old `estimatedCost`-only
  shape).
- `pnpm typecheck`, `pnpm --filter api test`.

## Definition of done

A logged-in buyer can save one or more shipping addresses and pick one at
courier checkout without retyping it; a guest can still enter an address inline
without an account; the seller-side order detail view shows the captured
address. Shipping cost remains a WhatsApp-coordinated conversation, not a
computed rate, matching current product scope.

## Execution notes

Landed on `feat/buyer-shipping-addresses-checkout`, branched from `main`
after `feat/global-buyer-account` and `feat/cfg-wa-templates` had already
merged. Backend addresses CRUD (`apps/api/src/modules/addresses/`) had
already been built and merged into `main` in an earlier session
(PR #76, "Tweaks: Initial Shipping Addresses") — that work predated this
session's execution and is not re-described in full below, only the bugs
found in it and the still-missing pieces this session actually shipped:
`CreateOrderDto`/`create-order.usecase.ts`'s inline `shippingAddress` snapshot
and `checkout-form.tsx`'s address form + prefill (Backend items 3-4 and
Frontend item 2 of the plan above).

### A real, pre-existing integration bug found before any new code could be written

`main` was broken in a way `pnpm typecheck`/`pnpm --filter api test` hadn't
caught yet (stale generated Prisma client masked it locally). Root cause:
PR #76 built the `Address` model, migration, and CRUD module **against the
pre-global-buyer-account `Customer`/`{id, storeId}` session shape** — but
`feat/global-buyer-account` (a separate, larger plan) landed after that and
rewrote `CustomerSessionGuard` to a global `BuyerAccount` identity
(`{buyerAccountId}`, no `storeId` at all — see
`2026-08-08-global-buyer-account-plan.md`'s own execution notes, which
explicitly flagged this exact risk: "the address CRUD guard/ownership check
this plan builds will need a real rewrite ... flag this in whichever plan
lands second"). Nobody did the rewrite when addresses actually merged second.
Concretely, on `main` before this session:

- `packages/db/prisma/schema.prisma` had **no `Address` model at all** —
  the migration SQL (`20260809211500_add_buyer_shipping_addresses`) existed
  and referenced `Customer`, but the model was never added to the schema, so
  `PrismaService` had no `.address` property and `addresses.service.ts`
  didn't actually typecheck against a real client (it just happened not to
  be exercised by `pnpm typecheck` until the generated client was
  regenerated fresh).
- `AddressesController`/`AddressesService` read `session.id`/`session.storeId`
  and filtered `Address.customerId` — but the live guard only ever produces
  `{ buyerAccountId }`. This would 500 or silently misbehave on every real
  request.
- `AddressesModule` was never registered in `app.module.ts` — the routes
  didn't exist on the running app at all.
- The migration's own ordering was wrong even for the old shape: it was
  timestamped `20260809211500`, before `20260809220000_add_buyer_account`
  (the migration that creates the `BuyerAccount` table) — a real
  `prisma migrate deploy` would have failed on any FK to `BuyerAccount`
  applied in that order.

**Fixed as a prerequisite, not a scope change**: rebuilt `Address` against
`BuyerAccount` directly (`buyerAccountId`, not `customerId`) rather than
against the now-legacy `Customer` — the plan's own "if the global plan lands
later, repoint the FK" follow-up, just done now instead of deferred, since
the precondition (`global-buyer-account` landing) had already happened.
Replaced the stale unapplied migration with a fresh
`20260809230000_add_buyer_shipping_addresses` (timestamped after
`add_buyer_account`, correct FK target); the old one was deleted outright
since it had never been applied to any real database (confirmed: no local
Postgres running, and `global-buyer-account`'s own execution notes record the
same — no live DB in that session either). Rewired
`addresses.controller.ts`/`addresses.service.ts`/`addresses.service.spec.ts`/
`address-response.dto.ts` to `buyerAccountId` throughout, registered
`AddressesModule` in `app.module.ts`, dropped the module's own `@ApiTags`
override (no other migrated controller sets one — tags auto-derive from the
controller class name) and added the `@ApiParam({ name: "slug" })`-without-
`@Param` fix on all four routes (same gap `customer-auth.controller.ts` hit
first — Orval's spec validator rejects a `{slug}` path segment with no
declared parameter). Added `Addresses` to `packages/types/orval.config.ts`'s
tag filter and `apps/web/lib/api-client.ts`'s `apiClient` object.

**Also discovered while chasing this down, unrelated to addresses**:
`packages/utils`'s built `dist/` output was stale relative to `src/` (the
`configurable-whatsapp-templates` plan's own execution notes flagged this
exact "no watch script, dist doesn't auto-rebuild" risk) — `apps/api`
consumes the stale `buildWhatsAppOrderMessage`'s old 1-arg signature, which
surfaced as a cascading, confusing set of unrelated-looking TS errors
(`checkout.controller.ts`'s `CheckoutOrderRow` missing `items`, etc.) until
`pnpm --filter @biasmarket/utils build` was run. Same for `packages/types`
after regenerating the Orval client — it also needs an explicit
`pnpm --filter @biasmarket/types build`, not just `generate`, before
`apps/web` picks up new exports (`@biasmarket/types`'s `main`/`types` point
at `dist/`, not the raw `index.ts`). Neither is a new problem introduced by
this session; both are pre-existing footguns in how these two packages are
consumed, worth documenting here since they blocked forward progress twice.

### This plan's own scope, once the prerequisite fix was in

- `CreateOrderDto` gained `ShippingAddressDto` (`recipientName`, `phone`,
  `line1`, `line2?`, `city`, `region?`, `reference?`) and a `shippingAddress`
  field, required only for `COURIER` via
  `@ValidateIf((o) => o.deliveryMethodType === "COURIER")` +
  `@IsDefined()` + `@ValidateNested()` — exactly the "no `addressId`, inline
  fields only" shape the plan's "Important correction" section specifies.
- `create-order.usecase.ts`: for `COURIER` (and no pickup point in play,
  which is always true for `COURIER`), `deliveryDetails` now merges
  `shippingAddress: { ...dto.shippingAddress }` alongside the existing
  `estimatedCost` snapshot — same "snapshot at order time" pattern as
  `pickupPointLabel`. No `Address` row is read server-side anywhere in this
  path, matching the plan exactly.
- `checkout-form.tsx`: the `COURIER` block now always renders inline
  address fields (recipient name, phone, line1, line2, city, region,
  reference) below the existing WhatsApp-coordination note; a new
  `useDefaultShippingAddress` query hook (`features/checkout/queries/`)
  fetches `GET stores/:slug/account/addresses` on mount and prefills empty
  fields from `addresses[0]` (the service already orders `isDefault desc,
  createdAt desc`, so index 0 is the default when one exists). The query
  never surfaces its error into the UI (`retry: false`, same pattern as
  `useCustomerProfile`) — a guest/logged-out 401 just means the fields stay
  empty, confirmed by a test that mocks `apiClient.addresses.findAll` as a
  rejection and asserts no crash/error UI.
- **Non-obvious React Hook Form timing bug worth flagging for future
  touches to this prefill effect**: the prefill `useEffect` must run *after*
  `deliveryMethodType` flips to `"COURIER"`, not just when the address query
  resolves. `form.setValue` on a field that hasn't mounted/registered yet
  (the shippingAddress inputs are conditionally rendered, only once
  `deliveryMethodType === "COURIER"`) updates React Hook Form's internal
  state but not the actual `<input>`'s DOM value once it later mounts — so if
  the address query resolves before the buyer has picked `COURIER`, a naive
  `useEffect(() => {...}, [defaultAddress.data])` silently no-ops on the DOM.
  Fixed by gating the effect on `deliveryMethodType === "COURIER"` and
  depending on both `defaultAddress.data` and `deliveryMethodType`, so it
  re-fires once the fields actually exist. Caught by a real test (not
  inferred) — `pnpm --filter web test` initially passed 34/35 with the
  prefill test failing exactly this way before the fix.
- Address-book CRUD UI (plan's Frontend item 1 — add/edit/delete/set-default
  list) was **not** built this session, deliberately. The plan itself scopes
  that surface into the mini-dashboard plan's account panel
  ("this plan owns the address CRUD form/mutations; the mini-dashboard plan
  owns where the entry point/nav item lives... coordinate sequencing") and
  that plan hasn't landed yet — there's no page to mount a list into. The
  backend CRUD (`GET/POST/PATCH/DELETE`, now fixed) is ready and unblocked;
  building the list UI is a clean follow-up once
  `2026-08-08-buyer-mini-dashboard-plan.md` lands.

### Conflict check against sibling plans touching the same files

- `2026-08-08-configurable-whatsapp-templates-plan.md` (already merged,
  has its own execution notes) touches `create-order.usecase.ts`'s
  `orderTemplate`/`whatsappUrl` block (after the transaction, looking up the
  store's `NEW_ORDER` template) — a different section of the file than this
  plan's `deliveryDetails` change (inside the transaction, before it).
  Confirmed no line overlap by reading the full current file before editing.
- `2026-08-08-buyer-post-checkout-payment-instructions-plan.md` (**not yet
  executed** — no execution notes section) is flagged in its own doc as
  possibly touching `checkout-form.tsx`, specifically the same `onSubmit`
  function this plan also edited: its plan is to stop the unconditional
  `globalThis.location.href = result.whatsappUrl` redirect (lines just below
  where this session added the `shippingAddress` object to the
  `submitCheckout.mutateAsync(...)` call) and turn "contact seller on
  WhatsApp" into an explicit button instead. **This session did not touch
  the redirect lines themselves** — only the object passed into
  `mutateAsync`, a few lines above — but whoever executes that plan next
  should re-read `onSubmit` fresh before editing, since its shape changed
  (the mutation call now builds a conditional `shippingAddress` object) even
  though the redirect logic itself is untouched.
- `2026-08-08-global-buyer-account-plan.md`: already merged before this
  session started; see "A real, pre-existing integration bug" above for the
  fallout from it landing without a corresponding addresses-module rewrite.

### Verification actually run

- `pnpm typecheck` (11/11 tasks across the monorepo, clean).
- `pnpm --filter api test`: 399/399 (46 files) — includes a new
  `addresses.service.spec.ts` update (renamed `customerId` →
  `buyerAccountId` throughout the existing 4 tests) and a new
  `create-order.usecase.spec.ts` case asserting the `COURIER` snapshot.
- `pnpm --filter web test`: 196/196 (53 files) — includes new
  `checkout.schema.test.ts` cases (shippingAddress required for `COURIER`,
  not required for `PICKUP`) and new `checkout-form.test.tsx` cases (submits
  the filled shippingAddress object; prefills from a mocked default
  address; gracefully degrades on a rejected/unauthenticated addresses
  fetch).
- **Not run**: `pnpm --filter api test:e2e`. No live Postgres in this
  environment (same constraint `global-buyer-account`'s and
  `configurable-whatsapp-templates`' own execution notes hit) — the new
  e2e cases added to `apps/api/test/orders.e2e-spec.ts` (COURIER checkout
  without a `shippingAddress` 400s; COURIER checkout with one snapshots it
  into `order.deliveryDetails`, verified against the real
  `CheckoutResultResponseDto` schema) compile clean as part of the full
  `pnpm typecheck` pass but were never executed against a real database.
  Run `pnpm docker:dev` then `pnpm --filter api test:e2e` before trusting
  those beyond "they typecheck." The e2e `beforeAll` was also extended to
  enable `COURIER` on the test store via `POST
  /stores/:storeId/delivery-methods` (only `PICKUP` is auto-created on store
  creation), which every other test in that file's shared `beforeAll` now
  depends on too — a low-risk addition, but worth knowing if a future edit
  to that file's setup breaks something seemingly unrelated.
- No manual browser pass was done (no dev server/DB available in this
  environment). The plan's own verification section asks for one
  (add/edit/delete addresses, checkout, seller-side order detail view
  rendering the new address fields) — still outstanding, though the
  seller-side rendering piece itself is now built and unit-tested (see
  below), just not eyeballed in a real browser.

### Seller-side order detail view (added after the initial pass above)

The plan's own Definition of Done requires "the seller-side order detail
view shows the captured address," and its Verification section explicitly
flags `order-detail-sheet.tsx` as needing a check — before this addition it
rendered nothing beyond `getDeliveryLabel`'s one-line
`"Envío por courier - S/10"` summary for every `COURIER` order, address or
not. Added `getShippingAddress(order)` to
`apps/web/features/orders/lib/order-format.ts` (returns `null` for `PICKUP`
orders and for any `COURIER` order whose `deliveryDetails.shippingAddress`
doesn't shape-check as a real address — covers pre-existing orders created
before this field existed) and a new block in `order-detail-sheet.tsx`
rendering recipient name/phone, line1+line2, city+region, and reference
when present. New i18n key `dashboard.orders.details.shippingAddress`
(ES/EN). Two new tests in `order-detail-sheet.test.tsx` (renders the address
for a COURIER order with one; renders nothing for a PICKUP order) —
`pnpm --filter web test` still 198/198 (53 files) after this addition.
