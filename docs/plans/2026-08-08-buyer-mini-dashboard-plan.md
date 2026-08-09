# Buyer mini-dashboard: order detail, payment history, contact-seller

Written before execution, at the user's explicit request, to allow a review pass
before code is written (deviates from this directory's normal "record after the
work lands" convention — see `docs/plans/README.md`).

**Source:** `docs/audits/product-engineering-business-audit-2026-08-08.md` §16
item 4 (top-priority, "no dependencies," `Order`/`OrderPayment` data already
exposed via `CustomerProfileResponseDto`).

## Context

Confirmed via investigation:

- The buyer account page
  (`apps/web/app/[locale]/(storefront)/store/[slug]/account/page.tsx` →
  `account-page-client.tsx` → `CustomerProfileView`,
  `apps/web/features/customer-auth/components/customer-profile-view.tsx`)
  already has a working sidebar shell with two sections (`orders`/`profile`,
  local `useState`, no routing — `account-sidebar.tsx:12-15`). This plan extends
  that shell; it does not replace it.
- **Orders today are a dead-end summary card, not a tracking view.**
  `AccountOrdersSection`
  (`apps/web/features/customer-auth/components/account-orders-section.tsx:7-26`)
  maps `profile.orders` to `AccountOrderCard`
  (`components/account-order-card.tsx:4-25`) — truncated id, date, status badge,
  total. **No click-through, no link, no expand.** `profile.orders` itself is a
  narrow projection (`AccountOrderResponseDto`,
  `apps/api/src/modules/customer-auth/dto/account-order-response.dto.ts:10-43` —
  id/paymentStatus/fulfillmentStatus/totalAmount/currency/createdAt only,
  explicitly documented as shared with `CustomerAccountService.confirmAccount`'s
  identical projection). No line items, no payment history, no delivery info.
  There is no `.../account/orders/[orderId]` route anywhere.
- Post-checkout confirmation (`checkout-page-client.tsx`) has no link back to
  the account page or the order at all, confirmed via full read.
- The seller-dashboard order detail view
  (`apps/web/features/orders/components/order-detail-sheet.tsx`) already renders
  line items, payment history, delivery/pickup info for a **seller** session —
  this plan's buyer-facing detail view is structurally similar content but must
  be built as its own component behind the buyer session
  (`CustomerSessionGuard`), not by relaxing the seller endpoint's auth. Use
  `order-detail-sheet.tsx` only as a **layout/content reference**, not a shared
  component — the seller version likely exposes seller-only actions
  (approve/reject/advance) that must not leak into the buyer view.
- **Payment-proof image display depends on
  `2026-08-08-buyer-proof-of-payment-upload-plan.md`'s new buyer-facing
  image-read endpoint** — that plan's item 4
  (`GET .../account/orders/:orderId/payments/:paymentId/image`). If that plan
  hasn't landed yet when this one executes, this dashboard's "previously sent
  screenshots" section has nothing to render — build the UI defensively (empty
  state if no payments/no image endpoint available yet), don't hard-fail.
  **Follow the already-landed, real precedent for how image serving works in
  this codebase**:
  `docs/plans/2026-08-08-payment-proof-image-access-control-plan.md` (Status:
  Implemented) built the seller-side authenticated image endpoint this
  dashboard's screenshots ultimately come from — it deliberately streams the
  image through the API (not a presigned-URL redirect) so ownership stays the
  only gate. Any buyer-facing image `<img>`/lightbox component this plan adds
  should point at the authenticated streaming endpoint, never a raw bucket URL,
  mirroring that decision exactly.
- Store's WhatsApp contact: `Store.whatsappNumber` (`schema.prisma:40`) +
  `buildWhatsAppUrl` (`packages/utils/src/whatsapp/index.ts:109-115`) already
  exist and are usable client-side for a "contact seller" button — this plan
  reuses them, doesn't add a new WhatsApp-link builder.
- **Update since this plan was written — both flagged dependencies have now
  landed, resolving the two biggest open questions below:**
  - `2026-08-08-global-buyer-account-plan.md` is done. `CustomerSessionGuard`'s
    real shape is `{ buyerAccountId: string }` — no `storeId`, no `id`, no
    `customerId` (`customer-session.guard.ts:39-40`). Every ownership check in
    this plan must use `order.buyerAccountId === session.buyerAccountId`
    (`Order.buyerAccountId` is a real nullable column, `schema.prisma:227`), not
    the old `session.id` shape this doc was originally written against.
  - `2026-08-08-buyer-shipping-addresses-plan.md` is done too, and its own
    execution notes **explicitly hand this plan a piece of work**: "Address-book
    CRUD UI ... was not built this session, deliberately ... this plan owns the
    entry point/nav item ... there's no page to mount a list into [until this
    plan lands]." The backend is real and live
    (`GET/POST/PATCH/DELETE stores/:slug/account/addresses`, ownership via
    `buyerAccountId`) — this plan now needs to build the actual address-list UI
    (add/edit/delete/set-default), not just reserve a nav slot for it. See new
    Scope item 6 below.
  - A `GlobalAccountController`
    (`apps/api/src/modules/customer-auth/global-account.controller.ts`) already
    exposes slug-independent `GET account/me` and `GET account/orders` (real
    cross-store data, `Order.buyerAccountId`-scoped) — but it's deliberately
    **not** wired into the Orval client or any frontend yet (no global nav-bar
    "logged in as X" indicator built). This plan's own Non-goals below still
    correctly keep cross-store aggregation out of scope for _this_ pass; just
    know the backend piece already exists if that changes later, no need to
    build it.
  - `2026-08-08-configurable-whatsapp-templates-plan.md` landed with
    `NEW_ORDER`/`PAYMENT_REMINDER` only — `ORDER_INQUIRY` is not just "not yet
    built," the API's `parseType()` actively **rejects it with a 400**. Scope
    item 5's hardcoded fallback message stays exactly as originally planned;
    don't attempt to call a whatsapp-templates endpoint with `ORDER_INQUIRY`, it
    will fail.

## Scope

1. **Order detail view** — new route
   `.../store/[slug]/account/orders/[orderId]/page.tsx` (a real URL, not a
   client-side tab, so it's linkable/shareable and survives a page refresh —
   deliberate deviation from the sidebar's existing tab-switch pattern, which is
   fine for `orders`/`profile` but wrong for a detail drill-down). Shows: line
   items (name/qty/price), delivery/pickup info, payment history
   (amount/method/date/status per row — including
   `PENDING_REVIEW`/`APPROVED`/`REJECTED` once the proof-upload plan lands;
   render sensibly if those fields are absent, i.e. treat them as optional until
   that plan ships), a "contact seller" WhatsApp button, and — if the
   proof-upload plan has landed — the upload-proof form for orders still owing
   money.
2. **Backend**: new endpoint `GET stores/:slug/account/orders/:orderId` gated by
   `CustomerSessionGuard`, ownership-checked
   (`order.buyerAccountId === session.buyerAccountId` — the real, landed session
   shape, see the update note above; there is no `session.id` or
   `session.customerId` field), returning a real detail DTO (items, delivery
   info, payment history) — **not** the narrow `AccountOrderResponseDto` used
   for the list. **Reuse `OrderDetailResponseDto` directly**
   (`apps/api/src/modules/orders/dto/order-response.dto.ts:283`) — confirmed
   it's currently a plain extension of `OrderResponseDto` with no
   seller-only/internal-notes fields added on top, so no buyer-safe subset is
   needed; don't build a second DTO for the same shape. **Loading/error
   states**: reuse this same route's existing convention —
   `account-page-client.tsx:16-45` already establishes
   `LoadingState`/`ErrorState` (from `components/shared/`) plus a 401→
   redirect-to-login pattern for `useCustomerProfile`. The new order-detail page
   should follow the identical pattern: `LoadingState` while pending,
   `ErrorState` (or redirect) on 401, and a distinct not-found treatment for a
   404/403 (wrong buyer or bad `orderId`) rather than a generic error — don't
   invent new loading/error UI for this one page.
3. **Order list → detail linking**: make `AccountOrderCard`
   (`account-order-card.tsx`) a real link to the new detail route (wrap in
   `Link`, or make the whole card clickable) — currently it's static markup with
   a truncated id and no `href` anywhere.
4. **Checkout confirmation → account linking**: `checkout-page-client.tsx`'s
   confirmation screen should link to the new order-detail page (only reachable
   if the buyer is logged in / has an account — for guest checkout, no such link
   exists yet since there's no `Customer` row to view; that's fine, matches
   existing guest-order handling, not a gap this plan needs to close).
5. **"Contact seller" affordance**: add a persistent WhatsApp/store-link button
   on both the order-list and order-detail views — reuse
   `buildWhatsAppUrl(store.whatsappNumber, ...)`. Use a minimal hardcoded
   fallback message
   (`"Hola, tengo una consulta sobre mi pedido #${orderId.slice(0,8)}"`) —
   **not** the whatsapp-templates endpoint: that module only supports
   `NEW_ORDER`/`PAYMENT_REMINDER` today and its `parseType()` rejects any other
   type (including a hypothetical `ORDER_INQUIRY`) with a 400. Don't invest in
   message-template logic here, it's out of scope and the backend doesn't
   support it yet.
6. **Address-book UI** (new scope, per the update note above —
   `2026-08-08-buyer-shipping-addresses-plan.md` built the backend and
   explicitly deferred this piece here): a section/page in the buyer account
   area listing saved addresses (`GET stores/:slug/account/addresses`, already
   live) with add/edit/delete and set-default actions
   (`POST`/`PATCH`/`DELETE .../addresses/:id`, also already live — this is pure
   frontend work, no new backend endpoints needed). Add a real `addresses` entry
   to `account-sidebar.tsx`'s `NAV_ITEMS` pointing at it — no more "add
   conditionally" hedging, the backend this nav item points to is real and
   merged.

## Non-goals

- Not building cross-store order aggregation in the frontend — the backend
  (`GlobalAccountController`'s `GET account/orders`) already exists (see the
  update note above) but isn't wired to the Orval client or any UI; wiring up a
  genuine cross-store "all my orders everywhere" view is a follow-up, not this
  plan's scope. This plan's order list/detail stays scoped to the current
  store's `stores/:slug/account/orders/:orderId`.
- Not building the payment-proof upload form's submission logic itself
  (mutation + validation) — owned by
  `2026-08-08-buyer-proof-of-payment-upload-plan.md`. This plan only mounts it
  in the right place once it exists.
- Not rewriting the seller-side `order-detail-sheet.tsx` — read-only reference,
  not shared code.
- Not building a global nav-bar "logged in as X" indicator that spans stores —
  still out of scope, same as `global-buyer-account`'s own non-goals.

## Files likely touched

- New:
  `apps/web/app/[locale]/(storefront)/store/[slug]/account/orders/[orderId]/page.tsx`
  - client component
- `apps/web/features/customer-auth/components/account-order-card.tsx` (make
  clickable), `account-sidebar.tsx` (real `addresses` nav entry)
- `apps/api/src/modules/customer-auth/` — new detail endpoint, DTO
- `apps/web/app/[locale]/(storefront)/store/[slug]/checkout/checkout-page-client.tsx`
  (link to order detail)
- New address-book UI (list + add/edit/delete/set-default), calling the
  already-live `apps/api/src/modules/addresses/` endpoints via
  `apiClient.addresses.*` (already registered in `apps/web/lib/api-client.ts`
  per that plan's execution notes) — likely a new
  `features/customer-auth/components/account-addresses-section.tsx` or similar,
  following the existing `account-orders-section.tsx`/
  `account-profile-section.tsx` pattern.
- `apps/api/openapi.json` + `packages/types/generated/**` (only if the new
  order-detail endpoint needs it — the addresses endpoints are already
  generated)
- i18n: new copy for order-detail labels + address-book UI.

## Verification

- Manual browser pass: place an order, follow it from checkout confirmation →
  account → order list → order detail; confirm payment history and delivery info
  render correctly; confirm "contact seller" opens WhatsApp with a sane
  prefilled message; confirm a different buyer (or logged-out session) gets
  403/redirect when hitting another buyer's order-detail URL directly; add/edit/
  delete/set-default an address from the new address-book UI and confirm it's
  the same one `checkout-form.tsx`'s courier-address prefill picks up (per
  `buyer-shipping-addresses`'s already-landed `useDefaultShippingAddress` hook).
- `pnpm typecheck`, `pnpm --filter web test`, `pnpm --filter api test`.

## Definition of done

A logged-in buyer can click from their order list into a real detail view
showing items, delivery info, and payment history, and can reach the seller via
WhatsApp from that view — closing the audit's §16 item 4 gap ("buyers currently
can't see their own order status in any real way"). A buyer can also manage
their saved addresses (list/add/edit/delete/set-default) from the account area,
closing out the piece `buyer-shipping-addresses` deliberately left for this
plan.
