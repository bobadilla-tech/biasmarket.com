# Buyer "Mi cuenta" panel: split into sidebar-navigated sections

## Context

The buyer-facing (storefront customer, not seller) "Mi cuenta" page currently
renders everything in one long stacked column: account info, order history
(plain text list, no status badge), email/phone form, and password-change form,
one after another. Reported problems (with before/after screenshots): no visual
hierarchy between sections, order history reads as plain text with no status
color/icon, and the whole thing feels dense and hard to scan, especially on
mobile.

Current implementation (confirmed by direct investigation):

- Route: `apps/web/app/[locale]/(storefront)/store/[slug]/account/page.tsx` →
  `account-page-client.tsx` (handles pending/error/logged-out) →
  `CustomerProfileView` in
  `apps/web/features/customer-auth/components/customer-profile-view.tsx` — a
  single `max-w-md` column: header+logout (40-55) → name/email card (57-67) →
  orders, inline-rendered, no subcomponent (69-100) → `EditContactForm` (102) →
  `CustomerChangePasswordForm` (104) → "Volver a la tienda" link (106-111).
- Orders: no `OrderList`/`OrderRow` component exists for the buyer side —
  rendered inline from `useCustomerProfile`'s `profile.orders` (`apps/api`
  `GET .../account/me`). **Correction from initial investigation, confirmed on
  review**: `AccountOrderResponseDto`
  (`apps/api/src/modules/customer-auth/dto/account-order-response.dto.ts:32-33`)
  already carries `fulfillmentStatus` — only `pendingAmount` is actually
  missing, not both fields. Status is a plain local `statusLabel()` string
  helper, not a badge.
- A real status-badge component already exists —
  `apps/web/features/orders/components/order-status-badge.tsx`
  (`OrderStatusBadge`) — typed against
  `Pick<OrderResponseDto, "paymentStatus"
  | "fulfillmentStatus" | "pendingAmount">`.
  `getOrderStatus()` (`features/orders/lib/order-status.ts:27-72`, the logic
  `OrderStatusBadge` calls) **only actually branches on
  `paymentStatus`/`fulfillmentStatus` — `pendingAmount` is never read**, it's
  only required because of the prop type shape. Computing `pendingAmount` for
  real would mean widening `customer-auth.service.ts`'s `getProfile` (currently
  selects only
  `id/paymentStatus/fulfillmentStatus/totalAmount/currency/createdAt`, lines
  202-213 — no `requiredAmount`, no `OrderPayment` rows) to also select
  `requiredAmount` + `payments` and run each order through the existing shared
  `withPaymentSummary`/`computePaymentSummary` helper
  (`apps/api/src/common/payment-summary.ts`) — buildable by reusing that
  existing helper, not a new join, but not free either.
- Forms: `EditContactForm` (zod: `edit-contact.schema.ts`, mutation:
  `use-customer-update-profile.ts`) and `CustomerChangePasswordForm` (zod:
  `change-password.schema.ts`, mutation: `use-customer-change-password.ts`) are
  already separate, already `react-hook-form` + `zodResolver`, already match the
  AGENTS.md forms convention — they just need to be put into their own cards
  instead of stacked bare in the column.
- **Known pre-existing bug found during investigation, unrelated to this
  redesign but in a file this work touches directly**:
  `edit-contact-form.tsx:65` has a stray `const schema` text literal that leaks
  into rendered JSX as visible text after the pending-phone message. Fix this
  while touching the file rather than filing it separately, since the redesign
  rewrites this component's layout anyway.
- No shadcn `Tabs` component exists in this repo yet. Closest existing pill-tab
  pattern: `apps/web/features/orders/components/orders-tabs.tsx` (`OrdersTabs`,
  plain `Button`s with active-state styling), used in the seller orders page —
  good model for the mobile top-tabs variant.
- No dedicated avatar/initials component exists in `packages/ui` or
  `components/`. Closest analog: `apps/web/components/store-logo.tsx` (rounded
  box, image-or-gradient-initials fallback, `name.slice(0,2)`) — but it's built
  for store logos, not person names (no first+last-initial logic). The seller
  dashboard sidebar (`apps/web/components/dashboard/store-sidebar.tsx:275-307`)
  already has a user-block-with-sign-out-button pattern worth modeling the new
  buyer sidebar's footer on, for visual consistency between the two "account
  shell" experiences in the app.
- Session/identity: no context/provider — buyer identity is derived purely from
  `useCustomerProfile(slug)` (`retry: false`, 401 = logged out). Logout:
  `use-customer-logout.ts` (`useCustomerLogout(slug)`, invalidates the profile
  query on success).

## Approach

Per the task's explicit instruction to reuse components and avoid repeating
code: build one small set of shared primitives first, then compose both sections
from them, rather than writing bespoke markup per section.

1. **New shared components.** `packages/ui` is **not** a real component home
   right now — confirmed on review it's a dead stub (one file, an unused
   placeholder `Button`, imported nowhere in `apps/web`). The actual
   shared/presentational-component convention this repo follows is
   `apps/web/components/ui` (shadcn/Base-UI primitives) and
   `apps/web/components/shared` (cross-feature composed components like
   `LoadingState`/`ErrorState`/`EmptyState`, per `apps/web/AGENTS.md`). Place
   new components there, not in `packages/ui`, to stay connected to the working
   Tailwind/theme setup `apps/web` actually uses:
   - `InitialsAvatar` in `apps/web/components/ui` (name → two-letter initials +
     deterministic color; check if generalizing `store-logo.tsx`'s fallback
     logic is cleaner than writing new logic — that one is store-name-specific
     today, not person-name-specific).
   - `AccountSidebar` in `apps/web/features/customer-auth/components/` (or reuse
     the same underlying pattern as `store-sidebar.tsx`'s user block +
     `mobile-sidebar.tsx`'s `Sheet` wrapper for the responsive collapse) with:
     avatar, name, email, nav items (`Pedidos`, `Perfil`), logout button,
     "Volver a la tienda" link pinned to the footer.
   - **Status badge: narrow `getOrderStatus()`'s own parameter type, not the
     shared `OrderStatusFields` type.** `order-status.ts` currently exports one
     `OrderStatusFields = Pick<OrderResponseDto, "paymentStatus" |
     "fulfillmentStatus" | "pendingAmount">`
     type reused by three functions in that file — `getOrderStatus()` (never
     reads `pendingAmount`, confirmed on review) but also `paymentsLocked()`,
     which genuinely does (`Number(order.pendingAmount) <= 0`, line 79).
     **Widening/optionalizing `pendingAmount` on the shared `OrderStatusFields`
     type would silently affect `paymentsLocked` too** (a caller passing no
     `pendingAmount` would get `Number(undefined) <= 0` → `false` with no
     compile error) — do not touch that shared type. Instead, change only
     `getOrderStatus()`'s own parameter annotation to a narrower inline type,
     `Pick<OrderStatusFields, "paymentStatus" | "fulfillmentStatus">` —
     TypeScript's structural typing means every existing caller (which all pass
     the full `OrderStatusFields` shape, a superset) still satisfies the
     narrower parameter, so this is a non-breaking, compiles-clean change.
     `OrderStatusBadge`'s own prop type narrows to match `getOrderStatus`'s new
     parameter type, and the buyer side can then pass `AccountOrderResponseDto`
     (which already has `paymentStatus` + `fulfillmentStatus`) directly — no
     backend change, no `payment-summary` computation, no second color mapping
     to keep in sync. Only fall back to widening the DTO + a separate
     `BuyerOrderStatusBadge` if this narrowing turns out to conflict with some
     other `OrderStatusBadge`/`getOrderStatus` caller not surfaced by this
     review.
   - `AccountOrderCard` — one order per card: icon/product-thumbnail, order
     number, date, amount, the status badge above, "Ver detalle" button (link to
     whatever order-detail route already exists for buyers, or the existing
     order-detail modal/page pattern from the seller side, adapted).
2. **Layout**: rework `CustomerProfileView` (or split it into an `AccountShell`
   layout component + two section components) into: fixed left sidebar
   (`AccountSidebar`) + main content area switching between
   `AccountOrdersSection` (list of `AccountOrderCard`) and
   `AccountProfileSection` (two cards: "Correo y teléfono" wrapping the fixed
   `EditContactForm`, "Cambiar contraseña" wrapping
   `CustomerChangePasswordForm`).
   - Section switching can be plain client-side state (no new route segments
     needed) or querystring-based tabs (`?tab=orders`/`?tab=profile`) if deep
     linking to a specific tab is desired — pick the simpler client-state
     approach unless there's a reason to support direct links to the profile
     tab.
3. **Mobile**: sidebar collapses to a top tab bar, modeled on `OrdersTabs`'s
   pattern — same two destinations (`Pedidos`/`Perfil`), not a hamburger menu
   (per the mockup).
4. **Fix the `edit-contact-form.tsx:65` stray-text bug** as part of this
   rewrite.
5. **No backend changes needed** with the prop-narrowing approach for the status
   badge (the default per step 1 above) — this whole redesign is frontend-only.
   If narrowing turns out to be infeasible and DTO-widening is used instead,
   that would be a small, additive `AccountOrderResponseDto` field addition in
   `apps/api/src/modules/customer-auth`, mirroring how `paymentMethod` was added
   to order DTOs in
   `2026-08-07-checkout-card-redesign-and-payment-method-fix.md` (explicit field
   addition on every DTO/mapper that needs it, not spread-and-hope) — but
   confirmed on review this isn't the default path.

## Non-goals

- Not touching seller-side account/orders UI — this is buyer-storefront only.
- Not adding deep-linkable tab routes unless implementation reveals a real need
  for them.
