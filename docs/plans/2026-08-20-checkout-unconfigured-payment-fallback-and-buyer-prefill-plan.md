# Checkout: unconfigured-payment-method fallback, buyer contact-info prefill, payment-method setup nudge

Written before execution, at the user's explicit request, to allow a review pass
before code is written (deviates from this directory's normal "record after the
work lands" convention — see `docs/plans/README.md`). All three items below ship
in the same PR.

**Source**: two bug reports from the user (checkout blocking on proof-of-payment
for an unconfigured method; checkout not prefilling contact info for a logged-in
buyer) plus a related product ask (nudge sellers to configure at least one
payment method, without ever making it mandatory — WhatsApp-only coordination
must keep working end to end).

## Context

Confirmed by reading the live code, not assumed:

### Bug 1 — proof-of-payment is still required for a method the store hasn't configured

- `PaymentMethodConfig` (`packages/db/prisma/schema.prisma:416-430`) has
  `enabled: Boolean` and `details: Json`. **`enabled` does not mean "configured
  with real account info"** — `PaymentConfigService.upsert`
  (`apps/api/src/modules/payment-config/payment-config.service.ts:46-52`)
  defaults `details` to `{}` on create whenever the seller's request omits
  `details` (i.e. a plain enable/disable toggle), so a row can be
  `enabled: true` with an empty `details: {}`.
- The storefront already detects this per-method, but only to render a warning
  banner. `PaymentMethodDetails`
  (`apps/web/features/checkout/components/payment-method-details.tsx`): TRANSFER
  → unconfigured iff `!details.bankName` (line 33); YAPE/PLIN → unconfigured iff
  `!details.phoneNumber && !details.qrImageUrl` (line 65); CASH is never
  unconfigured (line 22-28, always shows a cash note). When unconfigured,
  `NotConfiguredBanner` renders (lines 100-108) with the exact string from the
  bug report: `paymentDetailsNotConfigured` in
  `packages/i18n/es/storefront.json` ("La tienda todavía no configuró este
  método de pago — contáctala para coordinar.").
- That banner renders at `checkout-form.tsx:607-609`, immediately **above** the
  proof-of-payment upload block (`checkout-form.tsx:611-637`), which mounts and
  validates independently of the banner — it has no idea the method it's
  collecting a proof for is unconfigured.
- **Client-side proof requirement is method-type-only, not
  configured-state-aware**: `MANUAL_METHODS = ["YAPE","PLIN","TRANSFER"]`
  (`checkout.schema.ts:20`) drives both the zod `.refine` at
  `checkout.schema.ts:79-86` and the submit button's own duplicate check at
  `checkout-form.tsx:697`
  (`paymentMethod !== "" && paymentMethod !== "CASH" && !paymentProof`). Neither
  looks at `details`.
- **Server-side proof requirement has the same gap, and additionally never looks
  up `PaymentMethodConfig` at all during checkout.** `REQUIRES_PROOF`
  (`apps/api/src/modules/orders/infrastructure/checkout.controller.ts:150-151`)
  is `method !== undefined && method !== 'CASH'` — purely a function of the
  chosen method type. Confirmed via grep: `create-order.usecase.ts` never
  queries `PaymentMethodConfig` — it has no way today to know whether the
  buyer's chosen method is actually configured. So this isn't just a UI bug: the
  backend would reject a checkout with no proof for an unconfigured method
  exactly as it does for a configured one, even if the frontend fix below
  shipped alone.
- **What already works and should NOT be touched**: a store with **zero
  enabled** payment methods already degrades correctly today —
  `paymentMethods.length > 0` gates the whole "choose a payment method" section
  (`checkout-form.tsx:584`) and both the schema's method-required `.refine`
  (`checkout.schema.ts:75-78`) and the button's own
  `paymentMethods.length > 0 && !paymentMethod` check (`checkout-form.tsx:696`),
  so checkout completes with `paymentMethod:
undefined`,
  `REQUIRES_PROOF(undefined)` is `false`, and the post-order confirmation
  screen's WhatsApp button (`checkout-page-client.tsx` — `order.whatsappUrl`,
  only built when `store.whatsappNumber` is set, see
  `create-order.usecase.ts:404-431`) is the buyer's path to reach the seller.
  This existing "no methods at all → WhatsApp handles it" path is the pattern to
  extend to "a method is enabled but unconfigured", not something to rebuild.
- **`Order.paymentStatus`'s state machine already has room for this without a
  new enum value.** `assertPaymentTransition`
  (`apps/api/src/modules/orders/domain/order-status.vo.ts:13-30`) lets a seller
  move straight from `PENDING_PAYMENT` to `VERIFIED`/`REJECTED` — the code
  comment there literally says "sellers may approve/reject directly from
  `PENDING_PAYMENT`... based on the WhatsApp conversation" (this comment is now
  stale in its premise — see Doc drift below — but the transition table itself
  is exactly what this plan needs and requires no change). `Order.paymentStatus`
  defaults to `PENDING_PAYMENT` in Prisma (`schema.prisma:286`) and
  `CreateOrderUseCase` never overrides it — an order with no attached
  `OrderPayment` already lands in exactly the right state with zero schema
  changes.
- **The post-order confirmation screen already handles "no details" — do not
  touch it.** `checkout-page-client.tsx` computes `hasTransferDetails`/
  `hasWalletDetails` and falls back to a `confirmationNoDetails` amber note
  (lines ~103-137) whenever the order's chosen method has empty `details`, with
  the WhatsApp CTA button rendering right below whenever `order.whatsappUrl` is
  set. This already covers the "buyer completed checkout with an unconfigured
  method" outcome correctly; this plan's changes are entirely pre-submit
  (mid-form validation/UI), not post-submit.

### Bug 2 — logged-in buyer's saved contact info isn't prefilled

- `CheckoutForm`'s `useForm` `defaultValues` (`checkout-form.tsx:169-186`)
  hardcodes `customerName`/`customerPhone`/ `customerEmail` to `""`. There is
  exactly one existing prefill effect in this file — `useDefaultShippingAddress`
  (lines 244-270) — and it only fills a field when currently empty, gated on
  `deliveryMethodType === "COURIER"`. No equivalent exists for contact info.
- `useCustomerProfile(slug)`
  (`apps/web/features/customer-auth/queries/use-customer-profile.ts`) already
  exists and is already called one level up, in `checkout-page-client.tsx:41` —
  but only to conditionally render the post-order "view order" link (lines
  ~204-211). It is never passed to `CheckoutForm` and `CheckoutForm` never calls
  it itself.
- Its response shape, `CustomerProfileResponseDto`
  (`apps/api/src/modules/customer-auth/dto/customer-auth-response.dto.ts:36-42`,
  wrapping `CustomerProfileCustomerResponseDto` at lines 15-33):
  `{ customer:
{ name: string | null; email: string | null; phone: string; ... }, orders:
[...] }`.
  A logged-in buyer always has `phone` (unique per store, `Customer.phone`);
  `name`/`email` are nullable.
- Guests get a failed/`undefined` query (never thrown into the UI —
  `retry: false`), so nothing changes for guest checkout.

### Feature — nudge sellers toward configuring ≥1 payment method, without making it mandatory

- No onboarding-checklist or "complete your setup" component exists anywhere in
  `apps/web` today (confirmed by search) — this is new, but should stay small: a
  single conditional info banner, not a new checklist system.
  `payments-section.tsx`
  (`apps/web/features/store-settings/components/payments-section.tsx`) is the
  dashboard settings card where sellers toggle/configure each method — the
  natural place for it.
- Must not create the impression that a payment method is required to sell: the
  whole point of Bias Market's manual-payment-first design (per `CLAUDE.md`) is
  that a seller can run 100% off WhatsApp coordination. The banner is
  informational, always dismissable by simply configuring a method (it should
  auto-hide once ≥1 method is actually configured — see Decision below for what
  "configured" means here), not a hard gate.

### Doc drift found along the way (fix opportunistically, not the focus of this PR)

- `docs/core/security-payments.md` §9's "Buyer-proof-upload caveat" claims no
  in-app proof-of-payment exists and that only WhatsApp handoff + manual seller
  recording happens. This is stale — `OrderPayment` rows with
  `source: 'BUYER_SUBMITTED'` are created today (`create-order.usecase.ts`, the
  block right before the `whatsappUrl` construction cited above).
- `order-status.vo.ts:9-11`'s comment ("MVP checkout redirects the buyer to
  WhatsApp instead of collecting an in-app payment proof") is also stale — both
  the in-app proof upload and the unconditional post-order WhatsApp redirect it
  describes have since changed (redirect was replaced by the in-app confirmation
  screen with an opt-in WhatsApp button, per
  `docs/plans/2026-08-08-buyer-post-checkout-payment-instructions-plan.md`'s
  execution notes). The _transition table_ below that comment is still correct
  and needed as-is — only the prose above it is wrong.
- Fix both comments/doc passages as part of this PR if convenient; do not let it
  block or expand the PR's actual scope.

## Decision: single source of truth for "is this payment method configured"

Extract the predicate already implemented ad hoc in `payment-method-details.tsx`
into a shared, pure function so client and server (and any future call site)
agree on one definition:

```ts
// packages/utils/src/payment-methods.ts (new file)
export type CheckoutPaymentMethod = "YAPE" | "PLIN" | "TRANSFER" | "CASH";

export function isPaymentMethodConfigured(
  method: CheckoutPaymentMethod,
  details: Record<string, unknown> | null | undefined,
): boolean {
  const d = details ?? {};
  if (method === "CASH") return true;
  if (method === "TRANSFER") {
    return typeof d.bankName === "string" && !!d.bankName;
  }
  // YAPE | PLIN
  return (
    (typeof d.phoneNumber === "string" && !!d.phoneNumber) ||
    (typeof d.qrImageUrl === "string" && !!d.qrImageUrl)
  );
}
```

This is a straight lift of the existing per-method logic from
`payment-method-details.tsx:22-67` — no behavior change to that component beyond
importing the function instead of inlining the checks. `packages/utils` is
already the shared-pure-functions package per `CLAUDE.md`, importable from both
`apps/api` and `apps/web`.

## Bug 1 fix — scope

**Backend**
(`apps/api/src/modules/orders/infrastructure/checkout.controller.ts`):

1. Inject `PaymentConfigService`
   (`apps/api/src/modules/payment-config/payment-config.service.ts`) into
   `CheckoutController` — it already exposes `findEnabledForSlug(slug)` (used
   today by the public `GET` payment-config endpoint), so no new query method is
   needed.
2. In `create()`, before the `REQUIRES_PROOF` check: if `dto.paymentMethod` is
   set and isn't `CASH`, call `findEnabledForSlug(slug)`, find the row matching
   `dto.paymentMethod`, and compute
   `configured = row ?
isPaymentMethodConfigured(row.method, row.details) : false`.
3. Replace `REQUIRES_PROOF(dto.paymentMethod)` with
   `REQUIRES_PROOF(dto.paymentMethod) && configured`. An order for an
   unconfigured (or, defensively, no-longer-enabled) method now creates
   successfully with `paymentMethod` still recorded as chosen, no `file`
   required, no `OrderPayment` row attached, `paymentStatus` staying at its
   `PENDING_PAYMENT` default — exactly the same shape as today's
   zero-payment-methods-configured path, just scoped to one method instead of
   all of them.
4. No DTO shape changes, no new Prisma migration, no OpenAPI/Orval regeneration
   needed — confirm this stays true once implemented (nothing about the response
   or request contract changes, only server-side validation logic).

**Frontend** (`apps/web/features/checkout/`):

1. In `checkout-form.tsx`, compute
   `const selectedMethodConfigured = selectedPaymentConfig ? isPaymentMethodConfigured(selectedPaymentConfig.method, selectedPaymentConfig.details) : true;`
   right after the existing `selectedPaymentConfig` derivation (line 227-229).
2. Only mount the `PaymentProofUpload` block (`checkout-form.tsx:611-637`) when
   `paymentMethod && paymentMethod !==
"CASH" && selectedMethodConfigured`.
   When a method is selected but unconfigured, the block simply doesn't render —
   the `NotConfiguredBanner` from `PaymentMethodDetails` right above it (already
   rendering, line 607-609) is the only messaging needed; don't add a second,
   redundant notice.
3. Update `buildCheckoutFormSchema`'s proof-required `.refine`
   (`checkout.schema.ts:79-86`) to take a new parameter —
   `unconfiguredManualMethods: ReadonlySet<CheckoutPaymentMethod>` (computed in
   `checkout-form.tsx` from `paymentMethods` + `isPaymentMethodConfigured`,
   passed into `buildCheckoutFormSchema(...)` alongside the two existing
   booleans) — and skip the "proof required" rule when
   `unconfiguredManualMethods.has(data.paymentMethod)`.
4. Update the submit button's `disabled` proof check (`checkout-form.tsx:697`)
   the same way: replace
   `(paymentMethod !== "" && paymentMethod !== "CASH" && !paymentProof)` with
   `(paymentMethod !== "" && paymentMethod !== "CASH" &&
selectedMethodConfigured && !paymentProof)`.
5. **CTA copy**: when a method is selected but unconfigured, the button
   text/subtext should stop implying a proof upload. Add two new i18n keys (es +
   en) — e.g. `submitCoordinate` ("Confirmar pedido") and
   `submitSubtextCoordinate` ("Te contactaremos por WhatsApp para coordinar el
   pago.") — and pick between them and the existing `submit`/ `submitSubtext`
   based on `selectedMethodConfigured` (or `paymentMethod ===
"CASH"`, which
   already needs no proof and keeps its current copy — decide final wording per
   method type, but the unconfigured-manual-method case is the one that must
   change). Keep the existing `MessageCircle` icon; no new icon needed. Do not
   add a second button — one CTA, its label/subtext adapts, exactly matching how
   the disabled logic already adapts.
6. The order is still created normally through the existing `useSubmitCheckout`
   mutation and `onOrderCreated` callback — no new pre-submit WhatsApp deep link
   is needed here. The buyer's post-submit path (in-app confirmation screen +
   optional WhatsApp button using `order.whatsappUrl`, which is unconditionally
   built whenever `store.whatsappNumber` is set, independent of payment-method
   configuration state) already exists and already covers "buyer needs to
   coordinate payment via WhatsApp" — confirmed in Context above. This plan does
   not touch `checkout-page-client.tsx`.

## Bug 2 fix — scope

`apps/web/features/checkout/components/checkout-form.tsx`:

1. Import and call `useCustomerProfile(slug)` directly inside `CheckoutForm`
   (same query key `checkout-page-client.tsx` already populates via
   `["customer-auth", "profile", slug]` — TanStack Query dedupes, so this is
   cache reuse, not a second network round-trip; matches the existing documented
   pattern for `useDeliveryOptions` reuse between these two components).
2. Add a prefill `useEffect`, same shape and same "only fill if currently empty"
   guard as the existing shipping-address effect (`checkout-form.tsx:244-270`):
   ```ts
   useEffect(() => {
     const customer = customerProfile.data?.customer;
     if (!customer) return;
     if (!form.getValues("customerName") && customer.name) {
       form.setValue("customerName", customer.name);
     }
     if (!form.getValues("customerPhone") && customer.phone) {
       form.setValue("customerPhone", customer.phone);
     }
     if (!form.getValues("customerEmail") && customer.email) {
       form.setValue("customerEmail", customer.email);
     }
     // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [customerProfile.data]);
   ```
3. Fields stay fully editable — this is a `setValue` prefill, not a
   `disabled`/read-only field, satisfying the "buyer can still use a different
   contact for this one order" requirement directly.
4. **Verify before assuming compatible formats**: `Customer.phone`
   (`packages/db/prisma/schema.prisma:489-506`) is stored in whatever format
   `customer-auth`'s registration flow normalizes it to; `customerPhone` is
   rendered through `PhoneInput` (`apps/web/components/ui/phone-input.tsx` — not
   read during this investigation). Confirm `PhoneInput`'s expected `value`
   shape matches `Customer.phone`'s stored format before wiring this up; if they
   differ (e.g. one includes a country-code prefix the other doesn't), a small
   normalization step is needed at the prefill site — don't assume a silent
   match.

## Feature — payment-method setup nudge

`apps/web/features/store-settings/components/payments-section.tsx`:

1. Compute
   `const anyConfigured = paymentMethods.data?.some((m) => m.enabled && isPaymentMethodConfigured(m.method, m.details))`
   (adjust to whatever shape `usePaymentMethods()` already returns — check its
   query before wiring, likely the same `PaymentMethodConfigResponseDto[]` used
   elsewhere).
2. When `!anyConfigured` (and the query has loaded), render a single
   informational banner above the method list — reuse the existing card/banner
   visual language in this file (e.g. the same rounded/border/icon treatment
   `NotConfiguredBanner` uses, but a calmer informational tone, not amber
   "warning" — this is a suggestion, not an error state).
3. Copy (es + en, new i18n keys under `dashboard.json`'s `settings.payments`,
   matching this file's existing key placement per `apps/web/AGENTS.md`'s
   store-settings notes) should cover, briefly:
   - Configuring a payment method lets Bias Market track that specific payment
     automatically and keep the order's status in sync as the seller reviews it
     in-app.
   - The store still works entirely without one — the seller can keep
     coordinating every order over WhatsApp; nothing breaks or gets blocked by
     leaving this unset. No dismiss/localStorage tracking needed — the banner is
     purely derived from `anyConfigured`, so it disappears on its own the moment
     the seller configures one method and never needs manual dismissal state.
4. Keep this to one banner, no multi-step checklist, no progress bar — matches
   the project's "don't build for hypothetical future requirements" guidance and
   the user's own framing (explain the benefit clearly, once).

## Non-goals

- No new `PaymentStatus` or `NotificationType` enum value — `PENDING_PAYMENT`
  with no attached `OrderPayment` already is the right state for an
  unconfigured-method order (see Context).
- No changes to `checkout-page-client.tsx` (the post-order confirmation screen)
  — it already degrades correctly for a method with empty `details`.
- No changes to the WhatsApp URL/message-building utilities
  (`packages/utils/src/whatsapp/index.ts`) — this plan doesn't add any new
  pre-submit WhatsApp deep link, only adjusts pre-submit validation/copy.
- No onboarding checklist system, no dismiss/snooze state for the settings
  banner.
- No OpenAPI/Orval regeneration — confirm at implementation time that no DTO
  shape actually changed; if a review round surfaces a need for one, note it as
  a change to this plan, don't silently add one.

## Files likely touched

- `packages/utils/src/payment-methods.ts` (new) + its barrel export
- `apps/web/features/checkout/components/payment-method-details.tsx` (use the
  extracted function instead of inline checks)
- `apps/web/features/checkout/components/checkout-form.tsx`
- `apps/web/features/checkout/schemas/checkout.schema.ts`
- `apps/api/src/modules/orders/infrastructure/checkout.controller.ts`
- `apps/web/features/store-settings/components/payments-section.tsx`
- i18n: `packages/i18n/es/storefront.json`, `packages/i18n/en/storefront.json`
  (submit/subtext keys), `packages/i18n/es/dashboard.json`,
  `packages/i18n/en/dashboard.json` (settings banner keys)
- Existing tests likely needing updates:
  `apps/web/features/checkout/components/checkout-form.test.tsx` (or
  equivalent),
  `apps/api/src/modules/orders/infrastructure/checkout.controller.spec.ts` or
  `.e2e-spec.ts` — check both before assuming file names/paths.
- Optional doc-drift cleanup: `docs/core/security-payments.md` §9,
  `apps/api/src/modules/orders/domain/order-status.vo.ts:9-11` comment.

## Verification

- `pnpm --filter api test` — new/updated checkout controller cases: proof not
  required when method enabled-but-unconfigured; still required when configured;
  unaffected for CASH and for no-method-selected.
- `pnpm exec vitest run features/checkout features/store-settings` (from
  `apps/web`) — schema + form tests for the new unconfigured-method path,
  prefill effect test (mock `useCustomerProfile` returning a profile, assert
  fields populate but remain editable), settings banner show/hide test.
- `pnpm typecheck` across `api`/`web`.
- Manual browser pass (per `CLAUDE.md`'s UI-change rule): configure a store with
  YAPE enabled but no phone/QR set; check out selecting YAPE as a logged-out
  guest — confirm no proof field renders, confirm the button submits without a
  proof and reads a coordinate-via-WhatsApp style CTA, confirm the order lands
  in the dashboard `PENDING_PAYMENT` with no proof attached. Repeat logged in as
  a buyer with a saved profile — confirm name/phone/email prefill and remain
  editable. Visit store settings with zero payment methods configured — confirm
  the nudge banner renders; configure one — confirm it disappears.

## Definition of done

1. A buyer who selects a payment method the store enabled but never finished
   configuring can complete checkout without being asked for a proof they have
   no way to produce, and sees CTA copy that matches what's actually about to
   happen (order goes through, coordinate via WhatsApp) instead of copy that
   describes an upload step that isn't there.
2. A logged-in buyer with a saved profile sees their name/phone/email prefilled
   at checkout, and can still change any of them for that one order.
3. A seller with zero configured payment methods sees a clear, low-pressure
   explanation of what configuring one buys them, without any implication that
   it's required — WhatsApp-only operation keeps working exactly as it does
   today, for both existing bugs' fixes and the nudge itself.
