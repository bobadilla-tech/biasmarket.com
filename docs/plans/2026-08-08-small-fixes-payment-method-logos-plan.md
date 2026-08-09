# Small fixes: wire up real payment-method logos (Yape/Plin/BCP/Interbank)

Written before execution, at the user's explicit request, to allow a review pass
before code is written (deviates from this directory's normal "record after the
work lands" convention — see `docs/plans/README.md`).

## Context

Four logo assets were just added at `apps/web/public/logos/integrations/`:
`yape.webp`, `plin.png` (185×185), `bcp.png` (761×262),
`interbank-horizontal-logo.webp` (**3840×730, ~5.26:1** — confirmed via `file`,
notably wider-relative-to-height than `bcp.png`'s already-wide ~2.9:1). They're
already committed (`git log` shows `e6f16b1 "assets: add logos"`, working tree
clean) — not untracked; this plan is about wiring already-shipped assets into
the UI, not about new files landing.

Confirmed via investigation, current icon usage is generic, not brand-real:

- **Settings → Payments**
  (`apps/web/features/store-settings/components/payments-section.tsx:15-20,60-67`):
  each payment method row shows a colored text `Badge` (e.g. `"Y"`-style short
  label via `t("payments.items.yape.short")`) with a hardcoded hex color pair —
  no logo image anywhere. `PAYMENT_METHODS` array (lines 15-20) is the single
  source of the four rows (`yape`/`plin`/`transfer`/ `cash`).
- **Checkout payment-method picker**
  (`apps/web/features/checkout/components/checkout-form.tsx:33-38`):
  `PAYMENT_METHOD_ICONS` maps `YAPE`/`PLIN` to a generic `lucide-react`
  `<Smartphone>` icon (both methods share the exact same icon today), `TRANSFER`
  to `<Landmark>`, `CASH` to `<Banknote>` — rendered via `SelectableCard`'s
  `icon` prop (`checkout-form.tsx:413`).
- **`PaymentMethodType` enum** (`packages/db/prisma/schema.prisma:328-333`) is
  `YAPE | PLIN | TRANSFER | CASH` — there is no bank-specific enum value. BCP
  and Interbank are **banks**, not payment methods; `TRANSFER` is a generic
  "bank transfer" method with no selected-bank field anywhere in the schema
  today (confirmed: `PaymentMethodConfig.details` is currently an unused empty
  `{}`, per `2026-08-08-buyer-post-checkout-payment-instructions-plan.md`'s
  Context — that plan is what eventually adds a real `bankName` field). **This
  plan does not add bank selection** — it wires the two bank logos in as a
  decorative "we support these banks" hint, not as data tied to a specific
  configured bank. Once the payment-instructions plan's structured `TRANSFER`
  details (`bankName`, etc.) ship, a future small follow-up can swap this
  decorative hint for the seller's actually-configured bank logo — flagged here,
  not built here.

## Scope (deliberately small — no schema/API changes)

1. **`payments-section.tsx`**: replace the generic colored-text `Badge` for
   `yape`/`plin` rows with the real logo image (`next/image`, same pattern as
   `components/store-logo.tsx:20-27` — `src="/logos/integrations/yape.webp"` /
   `plin.png`, small fixed size e.g. 32×32, `object-contain` since these aren't
   square-cropped photos). Keep `transfer`/`cash` rows exactly as they are (no
   matching brand logo for a generic bank transfer / cash row) **except**: add a
   small "BCP · Interbank" logo strip next to the `transfer` row's description
   text, as a supported-banks hint — per the decorative-only scope above. **Give
   each logo its own `max-width` + `object-contain` container, not a shared
   fixed height** — `bcp.png` (~2.9:1) and `interbank-horizontal-logo.webp`
   (~5.26:1) have meaningfully different aspect ratios; a shared-height flex
   strip sized for one will let the other overflow.
   `interbank-horizontal-logo.webp` is the more likely of the two to blow out a
   mobile-width container, don't only guard against `bcp.png`.
2. **`checkout-form.tsx`**: replace `PAYMENT_METHOD_ICONS.YAPE`/`.PLIN`
   (currently both the same generic `<Smartphone>`) with the real logo images,
   same `next/image` pattern, sized to fit `SelectableCard`'s existing icon slot
   (check the slot's current rendered size — the `size-5` class on the lucide
   icons, `checkout-form.tsx:34-37` — and size the `<Image>` to match, don't let
   a swapped-in raster image break the card's layout). Leave `TRANSFER`/`CASH`
   on their existing lucide icons — no bank logo selection exists at checkout
   time either.
3. **Two confirmed duplicate-label sites in `apps/web/features/orders/`, not
   `orders-table.tsx`** (confirmed via grep — `orders-table.tsx` has no
   payment-method label/badge rendering at all, drop it as a target):
   `payment-history-list.tsx:24-25` and `register-payment-form.tsx:32-37` both
   duplicate a `paymentMethodLabels: Record<string,string>` text map — a genuine
   2-place duplication, worth extracting into one shared helper while touching
   this code (matches this codebase's existing pattern of
   occasionally-duplicated small maps, e.g. `getOrderStatus`'s documented
   duplication in
   `2026-08-06-order-status-buyer-login-pickup-checkout-fixes-plan.md` item 4).
   **Two different treatments needed, not one uniform swap**:
   - `register-payment-form.tsx:97` uses the label **inside a native `<option>`
     element** (a plain `<select>`) — an `<Image>`/logo **cannot render inside
     `<option>`**, browsers only show its text content. Only extract the
     text-label map here; do not attempt a logo swap at this call site.
   - `payment-history-list.tsx` renders the method as inline text
     (`· {paymentMethodLabels[payment.method]}`) inside a currency-amount
     `<span>`, not a `Badge` or icon-slot — it has no comparable shape to
     `payments-section.tsx`'s `Badge` or `checkout-form.tsx`'s icon slot. If
     adding a small logo here, it needs its own small layout decision (e.g. a
     tiny inline `<Image>` before the text), not a drop-in component swap from
     either of the other two sites.
4. **Note, not an action item**: these are official brand assets (Yape/Plin are
   Peruvian fintech brands, BCP/Interbank are banks) being used to indicate "we
   support payment via this method," which is standard commercial practice (e.g.
   "we accept Visa"). If the source/license of these specific image files is
   ever in question, flag it to the user — but this isn't something an
   implementing agent can verify by reading the files, so it's a caveat to carry
   forward, not a step to execute.

## Non-goals

- Not adding bank selection to `TRANSFER` or any new schema field — see Context
  above, that's `2026-08-08-buyer-post-checkout-payment-instructions-plan.md`'s
  scope.
- Not touching `PaymentMethodType` enum or any backend DTO — this is a pure
  frontend asset-wiring change, zero API surface change, zero migration, safest
  plan in this batch to land quickly and in parallel with everything else.
- Not redesigning `payments-section.tsx`'s layout beyond swapping the badge
  content — no new fields, no new interaction.

## Files likely touched

- `apps/web/features/store-settings/components/payments-section.tsx`
- `apps/web/features/checkout/components/checkout-form.tsx`
- `apps/web/features/orders/components/payment-history-list.tsx`,
  `register-payment-form.tsx` (step 3 — confirmed duplication sites, not
  speculative)
- No backend, no schema, no Orval regen needed.

## Verification

- Manual browser pass: Settings → Payments shows real Yape/Plin logos and the
  BCP/Interbank hint strip next to Transfer; checkout's payment-method cards
  show the real logos too; confirm no layout shift/overflow at mobile widths
  (these are raster images with fixed aspect ratios, unlike the lucide icons
  they replace — check both `bcp.png` (~2.9:1) and especially
  `interbank-horizontal-logo.webp` (~5.26:1, the wider of the two) don't blow
  out their container).
- `pnpm --filter web test` (any existing snapshot/component tests touching these
  two files), `pnpm typecheck`.

## Definition of done

Yape and Plin show their real logos in both Settings → Payments and checkout's
payment-method picker; BCP and Interbank logos appear as a supported-banks hint
next to the bank-transfer option. No backend changes, no new data model — purely
visual, safe to land independently of every other plan in this batch.

## Execution notes (implemented 2026-08-09)

Landed on branch `feat/payment-method-logos`. Implemented as planned,
frontend-only, zero schema/API/Orval changes. Deviations/learnings:

- **`payments-section.tsx`**: `PAYMENT_METHODS` rows for `yape`/`plin` gained a
  `logo` asset path; the row renders a 32×32 `next/image` (`object-contain`,
  `shrink-0`) when a `logo` is present and falls back to the existing colored
  `Badge` for `transfer`/`cash`. The BCP/Interbank strip sits under the transfer
  row's description text as a `flex items-center gap-3` strip, each logo in its
  own `max-w-16`/`max-w-24` + `object-contain` container (per the plan's
  no-shared-fixed-height rule — `bcp.png` ~2.9:1 vs
  `interbank-horizontal-logo.webp` ~5.26:1) with `h-auto w-full` so each keeps
  its intrinsic aspect ratio. Edit kept additive/small for the concurrent
  `2026-08-08-buyer-post-checkout-payment-instructions-plan.md` (which adds an
  expand/edit affordance to the same file) — only the badge/strip internals
  changed, row structure untouched.
- **`checkout-form.tsx`**: `PAYMENT_METHOD_ICONS.YAPE`/`.PLIN` swapped from the
  shared `<Smartphone>` lucide icon to real `next/image` logos sized `size-5`
  (matching the lucide icons' slot size, `object-contain`); `Smartphone` import
  removed. `TRANSFER`/`CASH` untouched. Note the module-level `Record` now holds
  JSX with `<Image>` — fine in this client component.
- **Shared text-label map**: added
  `apps/web/features/orders/lib/payment-method-labels.ts` (typed like
  `order-format.ts`'s helpers, `ReturnType<typeof useTranslations>`, keys under
  the `dashboard.orders` namespace). Both `register-payment-form.tsx` and
  `payment-history-list.tsx` now import it — the 2-place duplication is gone.
  `register-payment-form.tsx` is text-only extraction (label sits inside a
  native `<option>`; no logo swap, per plan).
- **`payment-history-list.tsx`**: also added a tiny inline `size-3.5` logo
  before the method text for `YAPE`/`PLIN` only (`alt=""`, decorative — the text
  label carries the accessible name), `TRANSFER`/`CASH` stay text-only. This
  went slightly beyond the plan's text-extraction-only ask for this file, but
  matches the plan's own suggested "tiny inline `<Image>` before the text"
  treatment and keeps the wired logos consistent in the seller's order view.
  `payment.method` is nullable, so the lookup guards it before indexing.
- **Type-narrowing gotchas** (fixed during typecheck): `PAYMENT_METHODS` is an
  `as const` union — `method.logo` doesn't exist on the `transfer`/`cash`
  members, so the row uses `"logo" in method` instead of truthiness to narrow.
- **Verification**: `pnpm typecheck` (11 tasks, all pass) and
  `pnpm --filter web test` (53 files, 190 tests pass) — including the existing
  `checkout-form.test.tsx`, which renders a YAPE card and confirms `next/image`
  works under the repo's vitest/jsdom setup (no `next/image` mock needed; the
  checkout test was the first in the suite to render one). No manual browser
  pass was run — the plan's mobile-overflow check for
  `interbank-horizontal-logo.webp` is guarded by the per-logo `max-w` +
  `object-contain` containers, but a quick visual pass at a narrow viewport is
  still recommended before merge.
