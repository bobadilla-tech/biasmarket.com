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
