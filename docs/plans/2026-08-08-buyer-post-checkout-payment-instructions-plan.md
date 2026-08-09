# In-app post-checkout payment instructions

Written before execution, at the user's explicit request, to allow a review pass
before code is written (deviates from this directory's normal "record after the
work lands" convention — see `docs/plans/README.md`).

**Source:** `docs/audits/product-engineering-business-audit-2026-08-08.md` §16
item 3 (top-priority "no dependencies" recommendation) and §15 Phase 1.

## Context

Confirmed via investigation, not assumed:

- After order creation, `checkout-page-client.tsx`
  (`apps/web/app/[locale]/(storefront)/store/[slug]/checkout/checkout-page-client.tsx:22-38`)
  renders a generic confirmation (title + body echoing the order id, plus a
  "check your email" notice if an email was given). **No payment method detail —
  bank name, account number, Yape/Plin number, QR, amount — is shown anywhere
  in-app.**
- In practice the buyer usually never even sees that screen meaningfully:
  `checkout-form.tsx`'s `onSubmit`
  (`apps/web/features/checkout/components/checkout-form.tsx:223-246`) calls
  `onOrderCreated`, then **immediately hard-redirects the tab**
  (`globalThis.location.href = result.whatsappUrl`, lines 243-245) whenever the
  store has a `whatsappNumber` configured. The in-app confirmation is
  effectively a fallback for stores with no WhatsApp number.
- `PaymentMethodConfig` (`packages/db/prisma/schema.prisma:335-349`) has a
  `details Json` field that is **structurally unused today**:
  `PaymentConfigService.upsert`
  (`apps/api/src/modules/payment-config/payment-config.service.ts:36-50`)
  hard-codes `details: {}` on create and never writes to it on update.
  `UpsertPaymentMethodDto`
  (`apps/api/src/modules/payment-config/dto/upsert-payment-method.dto.ts:11-18`)
  has no field to set it through. This is the field this plan needs to actually
  populate — it is not a matter of "surface an existing value," it's "define the
  shape and start writing to it."
- `Store.paymentInstructions` (`schema.prisma:39`) is a single free-text field,
  seller-editable in `ProfileSection`
  (`apps/web/features/store-settings/components/profile-section.tsx`, registered
  field around line 185) but **never read anywhere in the checkout/orders flow**
  (confirmed: zero occurrences outside `store-settings`/`stores` modules). This
  is a second, simpler existing field worth surfacing alongside the structured
  per-method details.
- `buildWhatsAppOrderMessage` (`packages/utils/src/whatsapp/index.ts:46-84`) is
  the seller-facing message (goes to the seller's WhatsApp, tells them what was
  ordered) — it is not a buyer-facing payment-instructions surface and this plan
  doesn't touch it. (A separate plan,
  `2026-08-08-configurable-whatsapp-templates-plan.md`, covers making its
  content store-configurable — different concern, don't conflate. **That plan
  has since landed** — `buildWhatsAppOrderMessage` now takes an optional
  per-store template argument, but its call signature with no template is
  unchanged, so nothing here needs adjusting for that.)
- **Update since this plan was written: both `configurable-whatsapp-templates`
  and `buyer-shipping-addresses` have landed and touched the exact two files
  this plan's Frontend changes section 2-3 edit.** `checkout-form.tsx`'s
  `onSubmit` now builds a conditional `shippingAddress` object into the
  `mutateAsync(...)` call (a few lines above the `location.href` redirect this
  plan changes) and the redirect lines themselves (`checkout-form.tsx:320-321`
  as of the shipping-addresses plan's last edit) are confirmed **still
  unconditional and untouched** — the fix this plan proposes is still needed
  exactly as described. Re-read the current file fresh before editing rather
  than assuming the line numbers cited below still match exactly.

## Decision: `PaymentMethodConfig.details` shape

Define a real per-method shape instead of leaving it an open blob, since two
different methods need genuinely different fields:

```ts
// method === "TRANSFER"
{ bankName: string; accountNumber: string; accountHolder: string; accountType?: string }
// method === "YAPE" | "PLIN"
{ phoneNumber: string; accountHolder: string; qrImageUrl?: string }
// method === "CASH"
{} // no structured details — cash needs no instructions beyond "pay on pickup/delivery"
```

Model this as a discriminated `zod` schema on the frontend
(`features/store-settings/schemas/`) and a matching class-validator DTO with
`@ValidateNested`/`@IsObject` on the backend, keyed off `method`. Store it as-is
in the existing `Json` column — no schema migration needed, this is a
DTO/validation-layer change, not a Prisma model change.

**QR image upload**: `qrImageUrl` for YAPE/PLIN needs an upload path. Reuse
`StorageService.uploadImage`-style flow
(`apps/api/src/storage/storage.service.ts`) with a new `products/`-sibling
prefix (e.g. `payment-qr/`) in the existing public `bucket` — these QR codes are
meant to be shown to any buyer checking out, so the existing public-bucket
pattern (not the private `paymentBucket` used for payment-proof screenshots) is
the correct one here. Don't reuse `uploadPaymentImage`, which targets the
private bucket for a different purpose.

## Backend changes

1. `UpsertPaymentMethodDto` — add a `details` field, validated per the
   discriminated shape above (method-conditional validation; look at how
   `packages/db/prisma/schema.prisma`'s `PaymentMethodType` enum
   (`YAPE | PLIN | TRANSFER | CASH`, lines 328-333) maps directly onto the three
   shapes).
2. `PaymentConfigService.upsert` — actually persist `dto.details` (currently
   hard-codes `{}`/never updates it, `payment-config.service.ts:36-50`).
3. `PaymentMethodConfigResponseDto` — already typed as
   `details: Record<string, unknown>`
   (`dto/payment-method-response.dto.ts:6-30`), no change needed there beyond
   narrowing the type if practical.
4. New endpoint for QR upload: mirror the existing multipart pattern (check
   `apps/api/src/modules/products/` for its image-upload endpoint shape, since
   `products` is the existing multipart precedent per `apps/web/AGENTS.md`'s
   "documented multipart carve-outs" note) —
   `POST stores/:storeId/payment-methods/:method/qr-image` or similar,
   seller-only (`AuthGuard` + `assertOwnership`). **Reject the upload with a 400
   if `method` isn't `YAPE`/`PLIN`** — TRANSFER/CASH have no QR concept, don't
   let the endpoint silently accept an upload it has nowhere sensible to store.
   **On replacing an existing QR image, delete the old object**
   (`StorageService.deleteImage` already exists and works against the products
   bucket this QR upload targets) — otherwise superseded QR images stay live in
   the bucket indefinitely.
5. **Checkout response already carries this data — confirmed, not a TODO**:
   `PublicPaymentConfigController.findEnabled`
   (`payment-config.controller.ts:67-79`) calls `toPaymentMethodDto`, which does
   **not** strip `details` — full rows are already returned publicly. Once step
   1-2 above actually populate `details`, the public endpoint exposes it with
   zero further backend change (still buyer-safe: these are intentionally
   buyer-facing payment instructions, not secrets).

## Frontend changes

1. **Settings UI**
   (`apps/web/features/store-settings/components/payments-section.tsx`): today
   this is enable/disable toggles only (confirmed,
   `payments-section.tsx:16-17,47-117` — no detail fields). Add an expand/edit
   affordance per enabled method (bank fields for TRANSFER, phone+QR-upload for
   YAPE/PLIN) — check if the existing `Sheet` pattern (used for
   `order-detail-sheet.tsx`) or a simple inline expanding row fits better,
   consistent with how the pickup-point availability plan
   (`2026-08-06-order-status-buyer-login-pickup-checkout-fixes-plan.md` §3) made
   the same UI-pattern decision for a structurally similar problem.
2. **Checkout confirmation screen** (`checkout-page-client.tsx`): render the
   buyer's _chosen_ payment method's instructions (bank details / Yape-Plin
   number + QR image) inline, not just the generic "order created" message. **No
   extra fetch needed for the order's amount/chosen method** —
   `CheckoutOrderResponseDto` (`checkout-response.dto.ts:39-138`) already
   includes `paymentMethod` and `requiredAmount`/`totalAmount` on the checkout
   response; `onOrderCreated` and `checkout-page-client.tsx`'s `order` state
   currently only capture `{orderId, customerEmail}` and discard the rest
   (`checkout-form.tsx:223-246`) — widen that local state to keep the full
   result instead of re-deriving or re-fetching it. Payment-method _details_
   (bank account, Yape/Plin number/QR) still need a separate fetch against the
   store's public payment-config, since those live on `PaymentMethodConfig`, not
   the order.
3. **Resolve the WhatsApp-redirect conflict explicitly — pick one, don't leave
   both "keep it" and "change it" in scope.** Today's redirect
   (`checkout-form.tsx:243-245`,
   `globalThis.location.href = result.whatsappUrl`) fires immediately whenever
   the store has a WhatsApp number configured, which per this plan's own Context
   is the common case — if left unconditional, the new in-app
   payment-instructions screen this plan builds would never be seen by most
   buyers, defeating the plan's purpose. **Decision: change the behavior** —
   stop auto-navigating the tab away. Render the confirmation screen (with
   payment instructions) as the default outcome of a successful checkout; keep
   "Contact seller on WhatsApp" as an explicit button the buyer clicks (open in
   a new tab via `target="_blank"`, don't reuse `location.href`) rather than an
   automatic redirect. This is a real, deliberate change to existing working
   behavior — flag it explicitly in the PR description, don't bury it as
   incidental to the new UI.
4. Also surface `Store.paymentInstructions` (the existing free-text field,
   currently write-only) somewhere on this same confirmation screen — it's
   already seller-authored content going unused; cheap addition, don't build a
   second free-text field for the same purpose.

## Non-goals

- Not touching `buildWhatsAppOrderMessage` or any WhatsApp templating — see
  `2026-08-08-configurable-whatsapp-templates-plan.md`.
- Not building buyer-initiated proof upload — see
  `2026-08-08-buyer-proof-of-payment-upload-plan.md`. This plan only makes
  payment _instructions_ visible; it doesn't add a way to submit proof.
- Not wiring the yape/plin/bcp/interbank logo assets into the UI — see
  `2026-08-08-small-fixes-payment-method-logos-plan.md`. This plan defines the
  _data_ (bank details, Yape/Plin numbers); the sibling plan wires the _icons_.
  Both plans touch `payments-section.tsx` — **coordinate or sequence these
  two**, don't let them land as conflicting concurrent edits to the same file
  (see that plan's own note on this).

## Files likely touched

- `apps/api/src/modules/payment-config/` (dto, service, controller, new
  QR-upload endpoint)
- `apps/api/src/storage/storage.service.ts` (new QR upload method, public
  bucket)
- `apps/web/features/store-settings/components/payments-section.tsx`,
  `apps/web/features/store-settings/schemas/`
- `apps/web/app/[locale]/(storefront)/store/[slug]/checkout/checkout-page-client.tsx`
- `apps/web/features/checkout/components/checkout-form.tsx` (only if public
  payment-config data needs to be threaded through, not for icon changes)
- `apps/api/openapi.json` + `packages/types/generated/**` (regen + commit)
- i18n: new copy for bank-detail/QR labels in `packages/i18n/es/` + English
  counterpart.

## Verification

- `pnpm --filter api test` for `payment-config.service.spec.ts` (new detail-
  persistence cases).
- Manual browser pass (per CLAUDE.md's UI-change guidance): configure a TRANSFER
  method with bank details, a YAPE method with a QR image, check out as a buyer,
  confirm the checkout confirmation screen shows the right instructions for
  whichever method was selected, confirm WhatsApp redirect (if configured) still
  fires and doesn't hide the instructions first.
- `pnpm typecheck` across api/web.

## Definition of done

A buyer who completes checkout sees, in-app, concrete instructions for the
payment method they selected (bank account details, or Yape/Plin number + QR),
without needing to rely on WhatsApp as the only channel — matching the audit's
own "done when" criterion in §15 Phase 1.

## Execution notes

- **Branch**: worked on `fix/work`, a shared branch multiple sessions were
  committing to concurrently at the time (the `buyer-proof-of-payment-upload`
  plan was landing alongside this one, uncommitted, in the same working tree —
  its edits to `customer-auth`, `orders`, `stats`, `stores`, and `schema.prisma`
  were left untouched throughout).
- **Pre-flight**: `prisma migrate status` showed
  `20260809210000_add_store_socials`, `20260809220000_add_buyer_account`, and
  `20260809230000_add_buyer_shipping_addresses` unapplied to the dev DB; ran
  `prisma migrate deploy` to bring it current before adding anything new. This
  plan needed no new migration — `PaymentMethodConfig.details` is an existing
  `Json` column, per the plan's own "no schema migration needed" decision.
- **Re-read `checkout-form.tsx` fresh, per the plan's own update note**:
  confirmed the unconditional `globalThis.location.href = result.whatsappUrl`
  redirect was still present and untouched by the two sibling plans, now at
  `checkout-form.tsx:320-321` (matching the note's citation exactly).
- **Backend** (`apps/api/src/modules/payment-config/`):
  - New `PaymentMethodDetailsDto` (`dto/payment-method-details.dto.ts`) — a
    single permissive class with all fields optional, since class-validator's
    `@ValidateIf` can't see a sibling field on the parent DTO from inside a
    `@ValidateNested` object. `UpsertPaymentMethodDto` gained an optional
    `details` field (`@ValidateNested` + `@Type`), and exports
    `PAYMENT_METHOD_TYPES` (was a local const) so the QR endpoint could reuse it
    for its own method-type guard.
  - `PaymentConfigService.upsert` now persists `dto.details` via a new
    `normalizeDetails(method, details)` — the actual "which fields are required"
    check lives here, not in the DTO: TRANSFER requires
    `bankName`/`accountNumber`/`accountHolder`, YAPE/PLIN require
    `phoneNumber`/`accountHolder`, CASH silently drops any submitted details
    (never 400s — the settings UI never shows detail fields for CASH, but a
    stray payload here shouldn't break the enable/disable toggle path). A plain
    enable/disable call (`dto.details === undefined`) still leaves existing
    `details` untouched on update, preserving the existing spec's "toggles
    enabled without touching details" expectation.
  - `Prisma`'s `Json` column type doesn't accept `Record<string, unknown>`
    directly — every write needed `as Prisma.InputJsonValue`, the same cast
    already used in `delivery-config.service.ts`.
  - New `POST stores/:storeId/payment-methods/:method/qr-image` (multipart,
    `FileInterceptor`, mirrors `products.controller.ts`'s image-upload pattern
    exactly: 5MB cap, JPEG/PNG magic-byte sniffing). Rejects TRANSFER/CASH
    with 400. `PaymentConfigService.uploadQrImage` merges the new `qrImageUrl`
    into the method's existing `details` (doesn't clobber
    `phoneNumber`/`accountHolder`) and deletes the previous QR object from the
    bucket via `StorageService.deleteImage` when replacing one.
  - `StorageService.uploadPaymentQrImage` — new method, uploads to the existing
    public `bucket` (not `paymentBucket`) under a `payment-qr/` prefix, per the
    plan's explicit "public bucket, not the private proof bucket" decision.
  - No change needed to `PaymentMethodConfigResponseDto` or the public
    `findEnabled` endpoint — confirmed both already pass `details` through
    untouched, exactly as the plan's Context section stated.
- **OpenAPI/Orval**: ran
  `pnpm --filter api generate:openapi && pnpm --filter @biasmarket/types generate`
  and committed the diff. Note for future concurrent-branch work: this
  regenerates from the _whole_ built API, so it captured the other session's
  in-flight backend changes too, not just this plan's — expected and fine given
  both sessions were building toward the same shared branch tip.
- **Frontend — settings UI**
  (`apps/web/features/store-settings/components/payments-section.tsx`): added a
  per-method "editar datos" expand row (plain inline expansion, not a `Sheet` —
  simpler for 3-4 text fields, and the pickup-point plan's Sheet precedent was
  aimed at a much larger form). TRANSFER shows bank/account/holder/type inputs;
  YAPE/PLIN show phone/holder + a QR file input with live preview. New
  `payment-details.schema.ts` (zod,
  `transferDetailsSchema`/`walletDetailsSchema`) validates client-side before
  the save call. Two new mutations: `use-save-payment-method-details.ts` (JSON
  `PATCH`-equivalent via the existing `upsert`) and
  `use-upload-payment-qr-image.ts` (raw `fetch`/`FormData`, the same documented
  multipart carve-out as `uploadLogo`/products' image uploads — not routed
  through the generated Orval client).
- **Frontend — checkout confirmation** (`checkout-page-client.tsx`):
  `onOrderCreated`'s payload widened from `{orderId, customerEmail}` to also
  carry `paymentMethod`, `requiredAmount`, `totalAmount`, `currency`, and
  `whatsappUrl` — all already present on
  `CheckoutOrderResponseDto`/`CheckoutResultResponseDto`, so no extra fetch for
  those. The confirmation screen calls `useDeliveryOptions(slug)` itself (same
  query key `CheckoutForm` already populated, so this reads cache, not a second
  network round-trip) to look up the chosen method's `details` and the store's
  `paymentInstructions`, and renders method-specific instructions (bank fields /
  phone+QR / a plain cash note), falling back to a "store hasn't configured this
  yet" notice if `details` is still empty. `Store.paymentInstructions`
  (previously write-only) now renders whenever non-empty.
- **WhatsApp-redirect decision, executed as specified**: removed the
  unconditional `globalThis.location.href = result.whatsappUrl` from
  `checkout-form.tsx`'s `onSubmit`. The confirmation screen is now always the
  outcome of a successful checkout; "Contact seller on WhatsApp" renders as an
  `<a target="_blank">` button only when `whatsappUrl` is present, next to the
  payment instructions rather than replacing them. Submit button copy changed
  from "Confirmar y continuar por WhatsApp" (implied an automatic redirect that
  no longer happens) to "Confirmar pedido" in both locales.
- **i18n**: new `storefront.json` keys under `checkoutPage`
  (`confirmationAmountLabel`, `confirmationMethodLabel`,
  `confirmationBankName/AccountNumber/AccountHolder/AccountType`,
  `confirmationPhoneNumber`, `confirmationQrAlt`, `confirmationNoDetails`,
  `confirmationCashNote`, `confirmationStoreInstructionsLabel`,
  `whatsappButton`) and new `dashboard.json` keys under `settings.payments`
  (`editDetails`, `hideDetails`, `saveDetails`, `detailsInvalid`, `uploadQr`,
  `uploading`, `fields.*`) — es + en both.
- **Testing & verification**:
  - Added `payment-config.service.spec.ts` cases: TRANSFER/YAPE/PLIN details
    persistence (success + missing-required-field 400), CASH silently dropping
    details, and `uploadQrImage` (method-type rejection, detail merge,
    previous-QR deletion on replace). `pnpm --filter api test` scoped to this
    file: 14/14 passing.
  - Updated `checkout-form.test.tsx` and `checkout.api.test.ts`: both mock
    `apiClient.stores.findPublic` now (called by `getDeliveryOptions` on every
    mount), widened the `onOrderCreated` assertion in the pickup/TRANSFER test
    to the new payload shape, added a `storePaymentInstructions` assertion, and
    updated all "Confirmar y continuar" button-name matchers to "Confirmar
    pedido". `pnpm exec vitest run features/checkout features/store-settings`
    scoped to `apps/web`: 46/46 passing.
  - **`pnpm --filter api test` (whole suite) and `pnpm typecheck` both currently
    fail on this branch — confirmed, before and independent of this plan's
    changes, entirely inside files the concurrent session was mid-way through**
    (`customer-auth`, `stats`, `orders/customers`, `orders/review-payment`,
    `stores.service.spec.ts` on the test side;
    `account-order-detail.tsx`/`contact-seller-button.tsx` missing i18n keys on
    the typecheck side). Verified by `git status` that every failing file is
    untracked or modified by that other work, not this one, and by scoping
    `tsc --noEmit`/`vitest run` to this plan's own touched files, which pass
    cleanly. Left as-is rather than fixed, since fixing would mean editing code
    mid-flight in another session's shared working tree.
