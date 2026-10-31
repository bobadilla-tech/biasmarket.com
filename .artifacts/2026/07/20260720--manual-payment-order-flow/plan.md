# Manual-payment order flow: schema gaps, orders module, WhatsApp checkout

## Context

Asked to audit the data model against the spec docs
(`docs/spec/security-payments.md` §9, `docs/spec/product.md` §4-5.9) and close
whatever tables/relationships/properties were missing for the manual-payment
order lifecycle. The schema only had a bare `Order` (single `paymentStatus` +
`fulfillmentStatus` pair, no line items, no proof, no buyer identity), and
`apps/api` had no `orders`/`payments`/`uploads` module at all — the flow was
spec'd but 0% implemented. Scope was confirmed with the user as "schema + full
order flow," not just a migration.

Partway through, the user redirected the checkout UX: for MVP, checkout
redirects the buyer to the business's WhatsApp number with the full order as
prefilled text, instead of collecting an in-app payment-proof upload. That cut a
real chunk of the original plan (buyer phone+password auth, R2/uploads,
`PaymentProof` review UI) and simplified the payment-review step to a direct
seller decision based on the WhatsApp conversation.

## 1. Schema

Three migrations landed against `packages/db/prisma/schema.prisma`
(`add_order_flow_tables`, `add_whatsapp_checkout_contact`, plus the enum renames
folded into the first):

- **`PaymentStatus`** expanded from `PENDING|SUBMITTED|VERIFIED|REJECTED` to
  `PENDING_PAYMENT|PAYMENT_SUBMITTED|VERIFIED|REJECTED|CANCELLED` (adds the
  expiration terminal state). **`FulfillmentStatus`** replaced entirely —
  `UNFULFILLED|SHIPPED|DELIVERED` → `ORDERING|IN_TRANSIT|READY|COMPLETED`
  (import/group-order vocabulary from product.md §5.7). Destructive rename, fine
  pre-launch with no real data.
- **`OrderItem`** (new): line items with `unitPriceAtPurchase` snapshotted at
  checkout (Product.price can change later), direct `storeId` (not
  transitive-only through product, unlike the pre-existing `ProductVariant`
  gap).
- **`PaymentProof`** (new): kept in the schema for future use even though the
  MVP checkout pivot means it's not populated by any endpoint yet. 1:N with
  `Order` (not the 1:1 architecture.md sketched), since resubmission after
  rejection is plausible and the audit-log "never delete evidence" rule rules
  out 1:1's implied overwrite.
- **`AuditLog`** (new): exact shape from architecture.md §4
  (`actorId, storeId, action, entityType, entityId, metadata, createdAt`).
  Scoped to payment approve/reject only for this phase — product-mutation audit
  logging deferred as scope creep.
- **`ProductVariant.reserved`** (new counter) + **`ProductVariant.storeId`**
  (new, direct tenant-scoping). `available = stock - reserved`, computed at read
  time; every increment/decrement happens inside the same `$transaction` as the
  order status transition via atomic Prisma `increment`/`decrement`, never
  read-then-write.
- **`PaymentMethodConfig`**, **`DeliveryMethodConfig`** (new, per store):
  `method`/`type` + `enabled` + `details` (Json) + deposit-percent fields on the
  payment config. `PaymentMethodConfig` isn't wired to any endpoint yet (see
  Follow-ups) — deposit math was never implemented because MVP checkout charges
  the full `totalAmount` (payment itself happens over WhatsApp, not in-app).
- **`Category`** (new) + `Product.categoryId` (nullable — existing rows have no
  category, and nothing in the spec makes it mandatory).
- **`Customer`** (new, phone+password buyer identity, scoped per-store via
  `@@unique([storeId, phone])`) — **not used by the MVP checkout**, which is
  guest-only. Table exists for when buyer login (product.md §5.8) actually gets
  built.
- **`Order`** additions for the WhatsApp pivot: `customerPhone` (required — the
  actual contact channel now), `customerName` (optional), `customerEmail`
  loosened to optional, `deliveryMethodType`/`deliveryDetails` (snapshotted, not
  a live FK), `requiredAmount`, `expiresAt`.
- **`Store`** additions: `whatsappNumber` (nullable — checkout only returns a
  `whatsappUrl` when set), `holdWindowHours` (default 48, replaces a hardcoded
  expiry window).

## 2. `orders` module (DDD-lite)

Followed `docs/spec/architecture.md` §2's layering — the only module that gets
`domain/application/infrastructure` separation, everything else in this change
stayed flat CRUD matching existing `products`/`stores` convention.

- `domain/order-status.vo.ts`: transition maps for both status machines,
  `InvalidOrderTransitionError`. Payment transitions deliberately allow
  `PENDING_PAYMENT` → `VERIFIED`/`REJECTED` **directly**, not only via
  `PAYMENT_SUBMITTED` — there's no in-app proof-upload step forcing that
  intermediate state anymore, sellers decide from the WhatsApp chat.
- `domain/order.entity.ts`: thin wrapper enforcing the transition guards
  (`approvePayment`/`rejectPayment`/`expire`/`advanceFulfillment`), mirroring
  the doc's own example.
- `application/create-order.usecase.ts` (checkout): validates the store and
  delivery method, checks stock (`stock - reserved >= quantity`, skipped
  entirely for variants with `stock: null` — the existing "unlimited /
  made-to-order" convention), reserves stock, snapshots prices, sets `expiresAt`
  from `store.holdWindowHours`, and — when `store.whatsappNumber` is set —
  builds a `wa.me` deep link via a new `packages/utils/src/whatsapp` helper
  (`buildWhatsAppOrderMessage` + `buildWhatsAppUrl`), returned to the caller as
  `whatsappUrl` for the frontend to redirect to.
- `application/review-payment.usecase.ts`: approve commits stock (real
  decrement) + writes an `AuditLog` row; reject releases the hold. Both go
  through `OrderRepository.assertOwnership` first.
- `application/advance-fulfillment.usecase.ts`: gated on
  `paymentStatus ===
  'VERIFIED'`.
- `application/expire-orders.usecase.ts` + `orders-cron.service.ts`: added
  `@nestjs/schedule`, `@Cron('*/5 * * * *')` scans `PENDING_PAYMENT` orders past
  `expiresAt`, cancels them, releases holds — one `$transaction` per order, not
  one big transaction across all of them.
- `infrastructure/checkout.controller.ts` (public, `stores/:slug/checkout`) and
  `infrastructure/order.controller.ts` (seller, `stores/:storeId/orders...`,
  `AuthGuard`).

**Bug found and fixed along the way:** the seller order list/detail endpoints
initially had no store-ownership check before querying — any authenticated
seller could read another store's orders by ID (the tenant-scoped query ran, but
nothing verified the caller owned that store, which is exactly the distinction
CLAUDE.md's hard rule calls out). Added `OrderRepository.assertOwnership`,
called from both the controller (list/ detail) and both review/fulfillment
usecases.

**Unit-test infra note:** `apps/api`'s Vitest config aliases `@biasmarket/db` to
a minimal stub (`test/mocks/biasmarket-db.ts`, only exports `PrismaClient`) so
unit tests never need a real Postgres connection. `create-order.usecase.ts`
originally did `new Prisma.Decimal(0)` as its running-total seed, which is a
_value_ import of `Prisma` — broke every test that touched the file, since the
stub doesn't export `Prisma`. Fixed by seeding the accumulator from the first
line amount instead (`items` is non-empty by DTO validation) and switching the
import to `import type { Prisma }`, which erases at compile time. Every other
new file in this change only ever imports `Prisma`/enum types type-only, which
is safe against the stub.

## 3. Supporting modules

- `delivery-config` (flat CRUD): seller CRUD at
  `stores/:storeId/delivery-methods`, public read at
  `stores/:slug/public/delivery-methods` — needed since checkout requires a
  real, enabled delivery method to snapshot onto the order.
- `PATCH /stores/:storeId` (new endpoint on the existing flat `stores` module):
  the only way to set `whatsappNumber`/`paymentInstructions`/`name`
  post-creation; didn't exist before this change.

## 4. Web UI

Added under `apps/web` (Next.js, next-intl `[locale]` routing — that
restructuring landed concurrently from a separate, unrelated in-progress session
and was left untouched):

- `lib/cart.ts`: localStorage cart, keyed per store slug, no backend cart entity
  (checkout submits the full item list in one call).
- Storefront: add-to-cart button per product card (variant picker when variants
  exist), floating cart link with item count.
- `/store/[slug]/cart`: quantity adjust/remove, total.
- `/store/[slug]/checkout`: delivery method picker (from the new public
  endpoint), phone/name/email, submits to `checkout`, redirects to `whatsappUrl`
  when the API returns one, otherwise shows an in-page "order created" fallback.
- `/dashboard/[storeId]/settings`: set the store's WhatsApp number and
  pickup/courier delivery config — the minimum plumbing needed to make checkout
  actually produce a real `whatsappUrl` end-to-end.
- `/dashboard/[storeId]/orders`: list, approve/reject, advance fulfillment.

## Verification

- `pnpm turbo run typecheck build` clean across all 7 packages.
- `pnpm --filter api test`: 70/70 passing (13 new spec files for the orders
  domain/usecases + delivery-config + the store-update endpoint), plus the one
  pre-existing, unrelated `stores.controller.spec.ts` failure (a
  `@thallesp/nestjs-better-auth` mock gap predating this session).
- `pnpm --filter @biasmarket/utils test`: 13/13 (5 new for the whatsapp helper).
- End-to-end smoke test against a real local Postgres + running `api`/`web` dev
  servers: signed up a seller, created a store, set a WhatsApp number and a
  pickup delivery method, published a product with a stocked variant, hit the
  public storefront (confirmed the product/add-to-cart button render), submitted
  a checkout (`stock 5→reserved 2`, correct `wa.me` URL with the order text),
  approved it (`reserved 2→0`, `stock 5→3`, `PENDING_PAYMENT`→ `VERIFIED`), and
  advanced fulfillment (`ORDERING`→`IN_TRANSIT`, confirmed blocked before
  `VERIFIED`). All four new web pages (cart, checkout, settings, orders)
  returned 200.

## Follow-ups (not in scope this session)

- `PaymentProof`/uploads/R2 flow: schema exists, nothing implemented. Only
  needed if in-app proof upload comes back post-MVP; today the seller
  approves/rejects straight from `PENDING_PAYMENT` based on the WhatsApp chat.
- Buyer auth (`Customer`, phone+password login, own order history): schema
  exists, no endpoints. MVP checkout is guest-only (`Order.customerId` stays
  null).
- `PaymentMethodConfig` (Yape/Plin/bank/Wise/PayPal toggles + deposit %): schema
  exists, no CRUD module, not read by checkout. `requiredAmount` currently
  always equals `totalAmount` — no deposit math implemented.
- Categories: schema + `Product.categoryId` exist, no CRUD module or storefront
  filter UI yet.
- Product-mutation audit logging (only payment approve/reject is logged today).
- The web app's `next-intl` `[locale]` migration was still landing concurrently
  in a separate thread during this session; not reviewed or touched here beyond
  confirming it didn't break the new pages once it stabilized.
