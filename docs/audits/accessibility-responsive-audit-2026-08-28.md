# Accessibility & Responsive Design Audit

Date: 2026-08-28 Scope: `apps/web` (Next.js storefront + seller dashboard +
marketing + onboarding + admin) Target standard: WCAG 2.2 AA (practical), plus
common Lighthouse / axe / Accessibility Insights automated criteria. Status:
**Audit + implementation plan. Nothing implemented yet.** Reviewed by
adversarial subagents (see "Review rounds" at the end).

---

## Executive summary

The app is a Turborepo monorepo; `apps/web` is Next.js **16.2.11** (App Router,
no `src/`), React **19.2.4**, Tailwind **v4**, shadcn (`base-nova` style) on top
of **`@base-ui/react`** primitives (not Radix), `react-hook-form` + `zod`,
`@tanstack/react-query`, `lucide-react`, `recharts`, `sonner`, `next-intl`,
`@dnd-kit`. Auth is `better-auth` (sellers) + a separate customer-auth cookie
flow (buyers).

**Overall state: below WCAG 2.2 AA on every primary flow, with systemic (not
one-off) causes.** The `@base-ui/react` primitives that _are_ used (`Sheet`,
`Popover`, `Tooltip`, `Accordion`, `AlertDialog`) are mostly wired correctly and
carry focus management / labelling. The problems are almost entirely in
**hand-rolled feature code that bypasses those primitives**:

- **Forms have no `<label>` elements.** Checkout, login, restock, product
  create/edit, and most dashboard forms are placeholder-only. Across the entire
  non-test `apps/web` codebase, `aria-describedby`, `aria-invalid`, `aria-live`,
  `role="alert"` and `role="status"` appear **only in 4 shadcn primitive files**
  — feature code never associates errors with fields and never announces async
  results.
- **Two modals are hand-rolled `<div role="dialog">`** with no focus trap, no
  Escape, no focus restoration, and (for the payment-proof lightbox) **no
  keyboard way to close at all**.
- **The payment-proof file upload in checkout is keyboard-unreachable**
  (`<input class="hidden">` + styled `<label>`), which blocks completing a
  manual-payment purchase without a mouse.
- **No skip link; `<main>` is missing** on checkout, cart, onboarding,
  marketing, admin, and dashboard list pages. The dashboard sidebar is an
  unlabeled `<aside>`, not `<nav>`.
- **Visible focus indication is missing or near-invisible** on most custom
  controls; there is no global `:focus-visible` fallback and several components
  set `outline-none` without a replacement.
- **Contrast fails widely**: dashboard sidebar text (`text-white/35`–`/52` on a
  purple gradient), checkout section labels (`text-gray-400` on white),
  dashboard table text (`#8f7da8`/`#927fac`), error text (`text-red-500` ≈
  3.8:1), and warning text (`text-amber-600`).
- **No `prefers-reduced-motion` handling anywhere.**
- **No automated a11y tooling**: no ESLint at all in `apps/web` (lint = Prettier
  on changed files), no `eslint-plugin-jsx-a11y`, no axe, no jest/vitest-axe, no
  Playwright, no Lighthouse CI.

**Highest risks (in priority order):**

1. Storefront **checkout** cannot be completed by screen-reader or keyboard-only
   buyers (unlabeled fields, unassociated/unannounced errors,
   keyboard-unreachable proof upload).
2. Storefront **login/auth** is placeholder-only with an unannounced failure
   state and an invisible focus ring.
3. **Seller row actions** (approve/reject payment, advance fulfillment) sit in
   the rightmost column of a horizontally-scrolling table with no responsive
   fallback → effectively off-screen on a phone.
4. Hand-rolled dialogs (`RestockInterestDialog`, `PaymentProofLightbox`) violate
   modal keyboard/focus requirements.
5. Systemic contrast + focus-visibility failures that automated tools will flag
   on nearly every route.

The good news: because the causes are systemic, **~7 shared fixes** (a
`Field`/`Label` primitive, a `Dialog` primitive, a `RadioCardGroup`, a global
focus + reduced-motion CSS block, a contrast-token pass, layout
skip-link/landmarks, and an ESLint+axe harness) remove the majority of
individual violations.

---

## Architecture observations

| Area                       | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Framework                  | Next.js 16.2.11, App Router only, route groups `(marketing)` `(onboarding)` `(dashboard)` `(storefront)` under `app/[locale]/`. `apps/web/AGENTS.md` warns the installed Next has breaking changes vs. training data — check `node_modules/next/dist/docs/` before writing Next code.                                                                                                                                                                                                                                          |
| React                      | 19.2.4. Server Components by default; most interactive surfaces are `"use client"`.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Styling                    | Tailwind v4 (`@import "tailwindcss"`), `tw-animate-css`, `shadcn/tailwind.css`. Design tokens in `app/globals.css` as OKLCH CSS vars with a `.dark` block **that is never activated** (no theme toggle) — effectively a light-only app, so hardcoded light hex in some components is not a live dark-mode bug but is a tokenization smell.                                                                                                                                                                                     |
| Component library          | shadcn `base-nova` on `@base-ui/react` ^1.6.0. Primitives present in `apps/web/components/ui/`: `accordion`, `alert`, `alert-dialog`, `badge`, `button`, `card`, `initials-avatar`, `input`, `phone-input`, `popover`, `select`, `separator`, `sheet`, `sidebar` (unused by the real dashboard), `skeleton`, `switch`, `textarea`, `tooltip`. **Missing:** `dialog` (non-alert), `label`, `form`/`field`, `checkbox`, `radio-group`, `dropdown-menu`, `tabs`, `table`, `pagination`. `packages/ui` is an empty re-export stub. |
| A11y primitives in use     | Base UI `Sheet`/`Dialog`, `Popover`, `Tooltip`, `AlertDialog`, `Accordion` — these carry focus trap/restore, Escape, `aria-*`. Correctly consumed in `product-sheet.tsx`, `mobile-sidebar.tsx`, `notifications-bell.tsx`, `navbar.tsx`. **Bypassed** by `restock-interest-dialog.tsx` and `payment-proof-lightbox.tsx`.                                                                                                                                                                                                        |
| Forms                      | `react-hook-form` + `@hookform/resolvers/zod`. Reference impl per AGENTS.md is `features/auth/components/login-form.tsx` — which itself has no labels, so the "reference" propagates the anti-pattern. No shadcn `form.tsx` (Base UI backend has no wrapper).                                                                                                                                                                                                                                                                  |
| Validation                 | zod at the schema boundary. Good for logic; not surfaced to AT.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Tables/grids               | No table library. Hand-written `<table>` in `orders-table.tsx`, `admin-*-table.tsx`, `coupon-redemptions-table.tsx`, `inquiries-table.tsx`, wrapped in bare `overflow-x-auto` divs.                                                                                                                                                                                                                                                                                                                                            |
| Dialog/popover/menu/select | Base UI for sheet/popover/tooltip/accordion/alert-dialog. **Menus** (account dropdown, notifications) are Popovers containing links — no `role="menu"`. **Selects** are native `<select>` (good) via `components/ui/select.tsx`, but with no built-in label or `aria-invalid`. **Tabs** are rows of `<Button>` with no tab semantics.                                                                                                                                                                                          |
| Icons                      | `lucide-react`. Rendered as bare `<svg>` with no `aria-hidden` — decorative icons are announced. Systemic.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Charts                     | `recharts` (`revenue-chart.tsx`, `new-vs-returning-chart.tsx`, `payment-methods-breakdown.tsx`). Not deeply reviewed; recharts SVG output needs an explicit `role="img"` + text summary or a data-table fallback.                                                                                                                                                                                                                                                                                                              |
| Auth flows                 | Seller: `better-auth` email+password, `useRequireAuth()` client gate in `(dashboard)/layout.tsx` renders `null` while checking. Buyer: `customer-auth` feature, cookie flow, storefront `/store/[slug]/account/*` routes.                                                                                                                                                                                                                                                                                                      |
| Breakpoints                | Tailwind defaults. `lg:` (1024px) is the dashboard desktop/mobile switch (`store-theme-frame.tsx` `lg:flex-row`, sidebar `hidden lg:flex` + `MobileSidebar` `lg:hidden`). Marketing navbar switches at `lg:`. No custom breakpoint config. `useIsMobile()` hook exists (`hooks/use-mobile`).                                                                                                                                                                                                                                   |
| Viewport                   | No `viewport`/`generateViewport` export anywhere → Next 16 default (`width=device-width, initial-scale=1`). **Zoom is not disabled** — good.                                                                                                                                                                                                                                                                                                                                                                                   |
| i18n                       | `next-intl`, ES/EN, `<html lang={locale}>` set correctly in root layout. Both locales LTR; no `dir` needed.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Tests                      | Vitest + Testing Library + jsdom. 75 colocated `*.test.ts(x)` files, mostly schema/api unit tests + small component tests. `apps/api` has Vitest **e2e** (`*.e2e-spec.ts`, real Nest AppModule) — **no Playwright anywhere in the repo.**                                                                                                                                                                                                                                                                                      |
| Lint                       | `apps/web` has **no ESLint config**. Root `.eslintrc.json` is a 3-line stub. `pnpm lint` for web = `scripts/lint-changed-files.mjs` = Prettier `--check` on changed files only. `.github/workflows/ci.yml` runs lint/typecheck/build/test per changed package — none of which check a11y.                                                                                                                                                                                                                                      |

---

## Critical issues

> Can completely prevent users from completing an important workflow.

### C1 — Checkout form: no labels, unassociated + unannounced errors, missing input semantics

- **Severity:** Critical
- **Route/component:** `/store/[slug]/checkout` —
  `features/checkout/components/checkout-form.tsx`
- **Files:** `checkout-form.tsx` (~20 `<input>`/`<select>` calls),
  `features/checkout/schemas/checkout.schema.ts`
- **Problem:**
  - Every field is **placeholder-only**: `customerName`, `customerEmail`, all
    `shipping*` fields, `shippingAgencyName`, `shippingDocumentNumber`, etc.
    have no `<label>` and no `aria-label`. The only correctly-labelled control
    is `#pickup-date-input`.
  - Error `<p className="text-sm text-red-500">` elements are **not linked** to
    their inputs (`aria-describedby`), inputs are **not marked `aria-invalid`**,
    and there is **no live region / error summary** — on a failed submit, a
    screen-reader user hears nothing and focus does not move.
  - `customerEmail` has no `type="email"` / `autoComplete="email"` /
    `inputMode`. `shippingDocumentNumber` has no `inputMode="numeric"`.
    `shippingPhone` (via `PhoneInput`) has no `autoComplete="tel"`.
  - The submit `<button>` is `disabled` via a large boolean expression; when
    disabled it gives **no indication of which requirement is unmet**, and a
    disabled button is removed from the tab order, so a keyboard/SR user can
    reach the end of the form with no feedback and no way to trigger validation.
  - Section headers (`t("deliveryTypeLabel")` etc.) are
    `<span className="text-xs … text-gray-400">` — not programmatically
    associated with their control group and **failing contrast**
    (`text-gray-400` ≈ 2.9:1 on white).
- **User impact:** Blind, low-vision, cognitive, and keyboard-only buyers cannot
  reliably complete a purchase — the single most important storefront flow.
- **WCAG:** 1.3.1 Info & Relationships, 3.3.2 Labels or Instructions, 3.3.1
  Error Identification, 4.1.2 Name/Role/Value, 1.4.3 Contrast, 1.3.5 Identify
  Input Purpose.
- **Automated tools catch it?** Partly — axe/Lighthouse flag missing labels, low
  contrast, and `aria-invalid` without description. They will **not** catch the
  missing focus-move or the disabled-submit dead end.
- **Recommended fix:** New shared `Field` + `Label` primitive; wrap every
  control. Add `aria-invalid` + `aria-describedby` wiring driven by
  `formState.errors`. Add an error summary region (`role="alert"` / focus
  target) rendered on submit failure and move focus to it (or to the first
  invalid field). Add `type`/`autoComplete`/`inputMode`. Prefer keeping submit
  enabled and validating on submit (RHF `mode` + `handleSubmit`'s error
  callback) over the disabled-button gate; if the gate stays, give it
  `aria-describedby` pointing at a "what's left" list.
- **Shared or local?** **Shared** primitive (`Field`/`Label`, error-summary
  hook) + local wiring.

### C2 — Payment-proof upload is keyboard-unreachable

- **Severity:** Critical
- **Route/component:** checkout proof step —
  `features/checkout/components/payment-proof-upload.tsx`
- **Files:** `payment-proof-upload.tsx`
- **Problem:** `<input type="file" className="hidden" …>` (`display:none` → not
  focusable) paired with a styled `<label htmlFor>`. Clicking the label works
  for mouse/touch; **a keyboard user cannot focus or activate it** (labels
  aren't focusable; a `display:none` input isn't either). There is also no
  announcement when a file is chosen or rejected.
- **User impact:** Keyboard-only buyers cannot attach proof of payment → cannot
  complete a manual-payment order (the product's core payment model).
- **WCAG:** 2.1.1 Keyboard, 4.1.2, 4.1.3 Status Messages.
- **Automated tools catch it?** Unlikely — axe does not reliably flag a
  visually-hidden-but-`display:none` file input behind a label. Needs manual
  keyboard testing / a Playwright tab-order check.
- **Recommended fix:** Use a visually-hidden-but-focusable pattern (`sr-only`
  class, not `hidden`) **or** render a real `<button type="button">` that calls
  `fileInputRef.current.click()` and keep the `<input>` `sr-only`. Add
  `aria-describedby` for the hint text and a polite live region announcing the
  selected filename / validation error. Reuse in the dashboard's
  `RegisterPaymentForm` upload (same pattern).
- **Shared or local?** Local component fix; extract a shared `FileDropzone`
  since the dashboard has the same need.

### C3 — Login form: placeholder-only, unannounced failure, invisible focus ring

- **Severity:** Critical (auth is a gateway to every seller flow)
- **Route/component:** `/login`, `/onboarding` —
  `features/auth/components/login-form.tsx`
- **Files:** `login-form.tsx`; same pattern in
  `features/customer-auth/components/*` (buyer login) and
  `features/marketing/contact-form.tsx`.
- **Problem:**
  - Email + password inputs are **placeholder-only** (no `<label>`), no
    `autoComplete="email"` / `"current-password"`, email input has no
    `type="email"`.
  - `errors.email` / `errors.password` / `errors.root` (wrong credentials)
    render as plain `<p>` with **no `role="alert"` / live region and no focus
    move** — a screen-reader user submitting bad credentials gets no feedback.
  - Focus style is `focus:ring-2 focus:ring-emerald-100` — `emerald-100` on
    white is **~1.1:1**, effectively no visible focus indicator.
  - Inputs are `text-sm` (14px) → **iOS zooms on focus**.
- **User impact:** Blind/low-vision/keyboard users cannot tell why login failed
  or where focus is; mobile users get a disorienting zoom.
- **WCAG:** 3.3.2, 4.1.2, 3.3.1, 2.4.7 Focus Visible, 1.4.11 Non-text Contrast,
  1.3.5.
- **Automated tools catch it?** Missing label + low-contrast ring: yes.
  Unannounced error: no.
- **Recommended fix:** `Field`/`Label`; `autoComplete`; `type="email"`; real
  focus ring from the shared token; `role="alert"` on the root error and focus
  it on failure; 16px mobile font.
- **Shared or local?** Shared primitive + shared focus token; local wiring.

### C4 — `PaymentProofLightbox`: modal with no keyboard dismiss, no focus management, no name

- **Severity:** Critical (keyboard operability)
- **Route/component:** dashboard order detail —
  `features/orders/components/payment-proof-lightbox.tsx`
- **Files:** `payment-proof-lightbox.tsx`
- **Problem:** `<div role="dialog" aria-modal="true" onClick={onClose}>` with an
  inner `stopPropagation` container. **No close button, no `Escape` handler, no
  focus trap, no focus restoration, no `aria-label`/`aria-labelledby`, no scroll
  lock.** Dismissal is mouse-only (outside-click). The proof `<img alt="">` has
  an empty alt.
- **User impact:** A seller reviewing a payment proof with the keyboard opens
  the lightbox and **cannot close it** (Escape does nothing, there is no
  button); focus is lost behind the overlay.
- **WCAG:** 2.1.1 Keyboard, 2.1.2 No Keyboard Trap (spirit), 2.4.3 Focus Order,
  4.1.2, 1.1.1 Non-text Content.
- **Automated tools catch it?** axe flags `role="dialog"` without an accessible
  name and the empty `alt`. It will not flag the missing Escape.
- **Recommended fix:** Replace with the new `Dialog` primitive (Base UI). Add a
  visible close button, Escape, focus trap/restore, scroll lock, `aria-label`
  (e.g. "Payment proof for order …"), and a meaningful `alt`.
- **Shared or local?** **Shared** `Dialog` primitive + local swap.

### C5 — `RestockInterestDialog`: hand-rolled modal, no focus trap / Escape / restore / name

- **Severity:** Critical (storefront modal; also affects out-of-stock
  conversion)
- **Route/component:** storefront product card + product detail —
  `features/restock/components/restock-interest-dialog.tsx`
- **Files:** `restock-interest-dialog.tsx`; opened from
  `components/storefront/product-card.tsx` and the product detail view.
- **Problem:** `<div role="dialog" aria-modal="true">` with a `<div>` backdrop
  `onClick`. **No focus trap** (focus escapes to the page behind), **no
  `Escape`**, **no focus restoration** to the trigger, **no initial focus into
  the dialog**, **no `aria-labelledby`** (the `<h3>` title is not linked), **no
  scroll lock**. On success the entire body is swapped with no live-region
  announcement and the previously-focused submit button is unmounted → focus
  falls to `<body>`. Inputs are placeholder-only; errors unassociated.
- **User impact:** Screen-reader and keyboard users are dropped into an
  unlabeled dialog, can tab out of it unknowingly, cannot Escape, and get no
  confirmation that their request was submitted.
- **WCAG:** 2.4.3, 2.1.2 (spirit), 4.1.2, 4.1.3, 1.3.1, 3.3.2.
- **Automated tools catch it?** Missing accessible name + missing labels: yes.
  Focus/Escape: no.
- **Recommended fix:** Rebuild on the `Dialog` primitive; `Field`/`Label`;
  success as a live-region update with focus moved to the confirmation heading.
- **Shared or local?** **Shared** `Dialog` + local rebuild.

---

## High-priority issues

> Major usability/accessibility problems; may not fully block every user but
> severely degrade key flows.

### H1 — No `<label>` elements across dashboard forms (systemic)

- **Components:** `features/products/components/product-sheet.tsx` (labels are
  `<p>`), `features/store-settings/components/*` (`section-primitives.tsx`
  `Field`), `features/orders/components/register-payment-form.tsx`,
  `features/stores/components/create-store-form.tsx` (its `Field` wraps `<p>`
  inside a `<label>` — implicit association only, and breaks for multi-control
  fields like `PhoneInput`), `features/contact`, `features/customers`,
  `features/coupons`.
- **Problem:** Controls get no accessible name (or an ambiguous one).
  `create-store-form.tsx`'s `<label>`-wrapping-`PhoneInput` associates the label
  with the country `<select>` only.
- **Impact:** Seller cannot reliably operate forms with a screen reader; on
  mobile the lack of persistent labels (placeholder disappears on input) hurts
  everyone.
- **WCAG:** 1.3.1, 3.3.2, 4.1.2.
- **Automated:** Yes (axe `label`, `select-name`).
- **Fix:** Shared `Field`/`Label` with explicit `htmlFor`/`id`; a
  `useId()`-based field-id hook. For composite inputs (`PhoneInput`) expose an
  `id` prop and point the label at the primary text input, give the country
  `<select>` its own `aria-label`.
- **Shared or local?** **Shared.**

### H2 — Errors never programmatically associated or announced (systemic)

- **Evidence:** `aria-describedby` / `aria-invalid` / `aria-live` /
  `role="alert"` / `role="status"` occur in **only 4 files in non-test
  `apps/web`**, all shadcn primitives.
- **Components:** every RHF form (`login-form`, `checkout-form`,
  `product-sheet`, `create-store-form`, `restock-interest-dialog`,
  `register-payment-form`, `contact-form`), plus mutation error toasts / inline
  `<p>` errors, plus `submitCheckout.error`.
- **Problem:** Validation and server errors are visual-only. No error summary,
  no focus management, no `aria-live` for async success/failure.
- **Impact:** AT users don't know a submit failed, why, or where to fix it.
- **WCAG:** 3.3.1, 3.3.3 Error Suggestion, 4.1.3 Status Messages.
- **Automated:** Partly (axe flags `aria-invalid` w/o description; misses the
  rest).
- **Fix:** Shared `Field` renders `<p id={errorId} role="alert">` and sets
  `aria-describedby`/ `aria-invalid` on the control. Shared
  `useFormErrorSummary` hook: renders a focusable summary on submit failure.
  Standardize async feedback on `sonner` (which has an assertive region)
  **plus** a visually-hidden `role="status"` for non-toast surfaces.
- **Shared or local?** **Shared.**

### H3 — Missing / near-invisible focus indicators (systemic)

- **Components:** `globals.css` `@layer base { * { @apply … outline-ring/50 } }`
  sets only an `outline-color` (no `outline-style`/width) → **no global
  fallback**. `components/ui/button.tsx` & `input.tsx` have real
  `focus-visible:ring-3` (good). Hand-rolled controls do **not**: sidebar
  `<Link>` items (`store-sidebar.tsx` — only `hover:`), marketing `NavLinks`,
  `product-card.tsx` add-to-cart / register-interest buttons,
  `selectable-card.tsx`, `orders-tabs.tsx`, `store-theme-*` buttons,
  `login-form` (`ring-emerald-100`), `navbar` `SearchForm` inputs
  (`focus:border-primary` only — a 1px border-color change).
- **Problem:** Keyboard users cannot see where focus is on navigation, product
  actions, checkout option cards, and tabs.
- **WCAG:** 2.4.7 Focus Visible, 2.4.11 Focus Appearance (2.2), 1.4.11.
- **Automated:** Weakly — Lighthouse/axe don't reliably measure focus
  visibility; needs Playwright `:focus-visible` screenshot checks or manual.
- **Fix:** In `globals.css`, add a real global `:focus-visible` outline (2px
  solid token, 2px offset) and stop components from clearing it without
  replacement. Provide a `focus-ring` utility class and apply to all hand-rolled
  interactive elements. Never ship `outline-none` without a `focus-visible:`
  replacement.
- **Shared or local?** **Shared** (CSS) + sweep of hand-rolled controls.

### H4 — Widespread text-contrast failures

- **Components / values:**
  - `components/dashboard/store-sidebar.tsx`: `text-white/35` (section
    headings), `text-white/40`, `text-white/50`, `text-white/52`,
    `text-white/72` on a `rgb(45,16,90)`→`rgb(24,8,50)` gradient. `/35`–`/52`
    are well below 4.5:1; `/72` is borderline.
  - `features/checkout/components/checkout-form.tsx` & `selectable-card.tsx`:
    section labels `text-gray-400` and helper `text-gray-500` on white.
  - `features/orders/components/orders-table.tsx`, `product-tile.tsx`,
    `product-sheet.tsx`, `notifications-bell.tsx`: `text-[#8f7da8]`,
    `text-[#927fac]`, `text-[#9582ad]` ≈ 3.3–3.6:1 on white.
  - Error text `text-red-500` (#ef4444) ≈ 3.8:1; warning `text-amber-600` ≈
    3.9:1 — both fail AA for normal text.
  - `product-tile.tsx` status badges: `#159a63` on `#e8fff2`, `#d97706` on
    `#fff6e8` ≈ 3.4–3.9:1.
  - `globals.css` `--muted-foreground: oklch(0.556 0 0)` ≈ 4.6:1 — passes but
    with no margin; used everywhere for secondary text.
- **WCAG:** 1.4.3 Contrast (Minimum).
- **Automated:** Yes — axe/Lighthouse will flag most of these on every route.
- **Fix:** A contrast-token pass: replace `text-white/<n>` in the sidebar with
  2–3 named tokens that hit ≥ 4.5:1 on the gradient's darkest stop; replace
  ad-hoc hex with `--muted-foreground`-class tokens that meet AA; introduce
  `--error-foreground` / `--warning-foreground` at AA and use them for all
  inline error/warning text and the `text-red-500` occurrences.
- **Shared or local?** **Shared** tokens + sweep.

### H5 — No landmark structure / no skip link

- **Components:** `app/[locale]/layout.tsx` (no skip link, `<body>` renders
  children directly), `(marketing)/layout.tsx` (`<Navbar/>` then children, no
  `<main>`), `(onboarding)` has **no layout file** at all,
  `(dashboard)/layout.tsx` (no `<main>` — the store-scoped
  `store-theme-frame.tsx` adds one, but `/admin/*` and `/account` do not),
  checkout page, cart page, storefront `account/*` pages.
  `components/dashboard/store-sidebar.tsx` navigation lives in a bare `<aside>`
  (no `<nav>`, no `aria-label`);
  `features/storefront/components/storefront-header.tsx` is the only landmark on
  storefront chrome and is a floating `<header>`.
- **Problem:** Screen-reader users have no "skip to content", no reliable `main`
  landmark to jump to, and the primary dashboard navigation is not exposed as a
  navigation landmark.
- **WCAG:** 2.4.1 Bypass Blocks, 1.3.1, 1.3.6 Identify Purpose.
- **Automated:** Partly — Lighthouse flags "no `[main]` landmark" and "no skip
  link" on some routes.
- **Fix:** Add a shared `SkipLink` + `<main id="main-content" tabIndex={-1}>` in
  **each route-group layout** (and create the missing
  `(onboarding)/layout.tsx`). Wrap sidebar nav in
  `<nav aria-label={t("primary")}>`. Give the storefront floating header a role
  and ensure a `<main>` wraps every storefront page body (store home + product
  detail already have one; checkout, cart, account do not).
- **Shared or local?** **Shared** component + per-layout edit.

### H6 — `SelectableCard` uses toggle-button semantics for single-select groups

- **Component:** `features/checkout/components/selectable-card.tsx` (shared
  within checkout), used for delivery type, pickup point, payment method,
  payment type, courier modality in `checkout-form.tsx`.
- **Problem:** Each option is `<button aria-pressed={selected}>`. For a
  **mutually-exclusive** choice this is the wrong pattern: a screen reader
  announces "toggle button, pressed" with no "2 of 3" context, there is no group
  name (`role="radiogroup"` + `aria-labelledby`), and arrow-key navigation
  between options is missing (each is a separate Tab stop). The group label is
  an unassociated `<span>`.
- **Impact:** AT users can't perceive the options as a set or which one is
  chosen relative to the others; keyboard users tab through every option instead
  of arrowing.
- **WCAG:** 1.3.1, 4.1.2, 3.3.2; 2.4.3 (tab volume).
- **Automated:** Weak — axe won't flag `aria-pressed` misuse here.
- **Fix:** New shared `RadioCardGroup` / `RadioCard` built on Base UI
  `RadioGroup` (or native `<fieldset><legend>` + visually-hidden
  `<input type="radio">`), roving tabindex, `aria-checked`, group labelled by
  the section heading.
- **Shared or local?** **Shared** primitive; replace all `SelectableCard` uses.

### H7 — Seller data tables: row actions off-screen on mobile; scroll region not accessible

- **Components:** `features/orders/components/orders-table.tsx`,
  `features/admin/components/admin-users-table.tsx`, `admin-stores-table.tsx`,
  `admin-coupons-table.tsx`, `coupon-redemptions-table.tsx`,
  `inquiries-table.tsx`,
  `features/restock/components/restock-requests-panel.tsx`.
- **Problem:**
  - `<div className="overflow-x-auto"><table>` with 8 columns × `px-6`. On a
    phone the table is far wider than the viewport and the **Actions column is
    rightmost**, so Approve / Reject / Advance / View require horizontal
    scrolling to reach. The brief explicitly requires critical row actions to
    stay reachable on mobile.
  - The scroll container has **no `tabindex="0"`, no `role="region"`, no
    `aria-label`** → keyboard users can't scroll it and SR users get no
    "scrollable region" cue.
  - `<th>` cells have no `scope="col"`; `<table>` has no caption / `aria-label`.
- **WCAG:** 2.1.1, 1.3.1, 4.1.2, 1.4.10 Reflow (content requires 2-D scroll at
  320px), 2.5.8 (spacing).
- **Automated:** Partly — axe flags missing table name / `scope`; reflow needs
  manual/Playwright.
- **Fix (per the brief — do NOT blanket-convert to cards):**
  - Keep the `<table>` but make the scroller a labelled, focusable region
    (`role="region"`, `aria-label`, `tabindex="0"`).
  - Add `scope="col"` and a `<caption className="sr-only">` / `aria-label`.
  - Below `md`: pin the identifying column (order # / customer) sticky-left, and
    move row actions into a **row action menu** (Base UI `Popover`/menu)
    triggered by an always-visible, in-viewport kebab/"Actions" button in the
    first or a sticky column — so actions never depend on horizontal scroll.
    Optionally a compact "row details" disclosure (`<details>` or Sheet) for
    low-priority columns.
  - Orders specifically: the existing "view" opens the order sheet — ensure the
    sheet exposes the same approve/reject/advance actions (per AGENTS.md the
    sheet footer's advance button already bypasses the confirm dialog — fix that
    too).
- **Shared or local?** **Shared** `DataTable` scaffold (scroll region +
  responsive column priority + row-action-menu slot) reused by all tables.

### H8 — Icon-only navigation has no accessible name when the dashboard sidebar is collapsed; no `aria-current`

- **Component:** `components/dashboard/store-sidebar.tsx`
- **Problem:** In collapsed state (`effectiveCollapsed`) each nav `<Link>`
  renders only a lucide `<Icon>` (no `aria-hidden`, no text) with
  `title={label}`. `title` is not a reliable accessible name and is not
  keyboard-surfaced. Active item is conveyed by `bg-white/13 text-white` only —
  **no `aria-current="page"`**. Notification/restock badge is a bare number
  (`"3"` / `text-[8px]`) appended with no context ("3 unread").
- **Impact:** A screen-reader user navigating the collapsed sidebar hears "link"
  with no destination; can't tell which page is current; badge is ambiguous and
  visually sub-pixel.
- **WCAG:** 2.4.4 Link Purpose, 4.1.2, 1.4.1 Use of Color, 1.4.4 Resize Text
  (8–10px).
- **Automated:** Yes — axe flags links without discernible text.
- **Fix:** Always render an accessible name (visually-hidden `<span>` when
  collapsed, not `title`); `aria-hidden="true"` on decorative icons;
  `aria-current="page"` on the active link; badge as
  `aria-label={t("unreadCount", {count})}` and min 10px visible.
- **Shared or local?** Local to `store-sidebar.tsx` (+ the
  `aria-hidden`-on-icons rule is systemic).

### H9 — Storefront `ProductCard` variant `<select>` has no accessible name

- **Component:** `components/storefront/product-card.tsx`
- **Problem:** `<Select value={variantId} onChange=…>` (native select via
  `components/ui/select.tsx`) with no `<label>` / `aria-label`. Add-to-cart
  `<button>` has no `type="button"`. `<Image fill>` has no `sizes` (loads
  full-size images on mobile).
- **Impact:** SR users hear "combo box" with no purpose; buyers pick the wrong
  variant.
- **WCAG:** 1.3.1, 4.1.2, 3.3.2.
- **Automated:** Yes (axe `select-name`).
- **Fix:** `aria-label={t("chooseVariant", {product: name})}` (or a
  visually-hidden label); `type="button"`; add `sizes`.
- **Shared or local?** Local; the `select.tsx` primitive should also
  accept/forward `aria-label` and an `aria-invalid` prop.

### H10 — `product-tile.tsx`: nested interactive + broken Space key

- **Component:** `features/products/components/product-tile.tsx`
- **Problem:** `<Card role="button" tabIndex={0} onClick onKeyDown>`
  **contains** `<Button>` Publish / Edit / Delete. That is an interactive
  element nested in an element with `role="button"` (invalid; axe flags
  `nested-interactive`). The `onKeyDown` handles `" "` (Space) without
  `event.preventDefault()` → Space scrolls the page as well as activating.
  Keyboard users get a tab stop on the card _and_ each inner button.
- **WCAG:** 4.1.2, 2.1.1.
- **Automated:** Yes (`nested-interactive`).
- **Fix:** Make the card a plain container. Put a real control for "open" — e.g.
  wrap the product name/image in a `<Link>` or a single `<button>` that
  stretches via `::after` (with the action buttons as siblings
  `position: relative; z-index`), or drop the whole-card click and rely on an
  explicit "Open"/"Edit" affordance. Remove the `role="button"` from `Card`.
- **Shared or local?** Local; establishes a pattern (`ui/card.tsx` could export
  a `CardLink` helper).

### H11 — No `prefers-reduced-motion` support anywhere

- **Evidence:** zero `prefers-reduced-motion` / `motion-reduce` / `motion-safe`
  occurrences in the repo.
- **Components:** Base UI `Sheet`/`AlertDialog` transitions, `accordion`
  (`animate-accordion-down/up`), Tailwind `animate-in` / `zoom-in-95` on
  popovers/tooltips, `globals.css` `@keyframes cart-badge-pop`
  - `.cart-badge-pulse`, `sonner` toasts, `tw-animate-css`.
- **WCAG:** 2.3.3 Animation from Interactions (AAA) — but also good practice for
  2.2.2; vestibular-safety.
- **Automated:** Lighthouse has a soft check; mostly manual.
- **Fix:** One global block in `globals.css`:
  `@media (prefers-reduced-motion: reduce) { *, ::before, ::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; } }`
  plus keep essential state-change transitions instant rather than removed.
  Verify Base UI transitions degrade cleanly.
- **Shared or local?** **Shared** (CSS).

---

## Medium-priority issues

### M1 — lucide icons announced as content

Decorative `<Icon>` usages across the app render `<svg>` without
`aria-hidden="true"` (e.g. `navbar` search icon, `checkout-form` payment icons,
`selectable-card` `Check`, table avatars). Icon-only buttons mostly have
`aria-label` (good) but the inner icon is still in the a11y tree. **Fix:** an
`Icon` wrapper that defaults `aria-hidden`, or an `eslint-plugin-jsx-a11y`
custom rule / codemod adding `aria-hidden` to lucide icons that have sibling
text. WCAG 1.1.1. Automated: partly.

### M2 — Tabs implemented as button rows; active state color-only

`features/orders/components/orders-tabs.tsx` (and similar filter rows in
analytics/payments/products): row of `<Button variant="ghost">` with no
`role="tablist"`/`tab`, no `aria-selected`/`aria-current`, no arrow-key nav;
active = `store-theme-primary-button` styling only. These are filters, not
tabpanels, so `role="tablist"` is optional — but they need `aria-pressed` or
`aria-current` and a non-color indicator. The `overflow-x-auto` wrapper isn't
focusable. WCAG 1.4.1, 4.1.2. Automated: weak.

### M3 — `alert-dialog.tsx` hardcoded hex + low-contrast description

`components/ui/alert-dialog.tsx` uses `bg-white`, `border-[#eadcf7]`,
`text-[#2d1649]`, `text-[#8f7da8]`. `#8f7da8` on white ≈ 3.5:1 → the dialog
**description** (often the actual confirmation text, e.g. "This will reject the
payment") fails AA. WCAG 1.4.3. Automated: yes. **Fix:** use
`--popover`/`--popover-foreground`/`--muted-foreground` tokens meeting AA.

### M4 — iOS input zoom on hand-rolled inputs

`navbar.tsx` `SearchForm` (`text-xs` / `text-sm`), `login-form.tsx` (`text-sm`),
`checkout-form.tsx` (`inputClassName` `text-sm`), `restock-interest-dialog.tsx`
(`text-sm`), `create-store-form` custom inputs. Any
`<input>`/`<select>`/`<textarea>` below 16px triggers focus-zoom on iOS Safari.
The shared `components/ui/input.tsx` / `textarea.tsx` correctly use
`text-base md:text-sm` — the hand-rolled ones don't. WCAG 1.4.4 (adjacent),
general mobile usability. Automated: no. **Fix:** shared input class token
`text-base md:text-sm`; apply everywhere; ideally route all text inputs through
`components/ui/input.tsx`.

### M5 — `100vh` / `h-screen` on mobile

`components/dashboard/mobile-sidebar.tsx` `SheetContent className="h-screen …"`,
`store-theme-frame.tsx` `min-h-screen`, product-detail not-found `min-h-screen`,
`restock-interest-dialog` full-viewport wrapper. On mobile browsers `100vh`
includes the retractable URL bar → content clipped / bottom actions hidden.
**Fix:** `h-dvh` / `min-h-dvh` (Tailwind v4 supports `dvh`). `product-sheet.tsx`
already uses `h-dvh` — follow that. Automated: no.

### M6 — `product-sheet.tsx` sheet wider than small viewports

`SheetContent className="h-dvh w-105 gap-0 overflow-y-auto sm:max-w-105"` — base
width `w-105` (26.25rem / 420px) with a `max-w` only at `sm:`. On a 320–414px
phone the sheet overflows the viewport and content is clipped / the page scrolls
horizontally. **Fix:** `w-full max-w-[26.25rem]` (or `w-[min(100vw,26.25rem)]`).
WCAG 1.4.10 Reflow. Automated: partly (Playwright reflow check).

### M7 — Storefront floating header obscures content / small targets / reflow

`features/storefront/components/storefront-header.tsx`:
`fixed top-4 right-4 … flex-wrap`. On narrow screens with several social links
it **wraps to multiple rows**, growing downward over page content (product
detail relies on a fixed `pt-20` which may be insufficient when the header
wraps). Icon buttons are `size-8` (32px) — passes 2.5.8 AA (24px) but cramped
and close together. The store-name link hides its text `<sm` so it's icon-only
there. WCAG 1.4.10, 2.5.8, 2.4.4. Automated: no. **Fix:** constrain to a single
row with an overflow "more" affordance, or make it a normal in-flow header on
`< sm`; enforce ≥ 40px targets with adequate spacing; keep an accessible name on
the icon-only store link.

### M8 — Notifications bell: count not in accessible name; popover clipping

`features/notifications/components/notifications-bell.tsx`: trigger
`<button aria-label={t("title")}>` — because `aria-label` is set, the badge
number inside is **not announced**, so SR users don't learn the unread count.
`PopoverContent className="w-80"` (320px) can clip on a 320px screen. Panel
title is a `<p>`, not a heading. WCAG 4.1.2, 1.4.10. Automated: no. **Fix:**
`aria-label={count>0 ? t("titleWithCount",{count}) : t("title")}`; constrain
popover width to viewport; make the panel title an `<h2>`; add a polite live
region for newly-arrived items.

### M9 — Navbar mobile "cart" link: wrong name + wrong destination

`components/marketing/navbar.tsx`: the mobile `ShoppingBag` link has
`aria-label={t("cart")}` but `href="/search"`. Screen-reader and sighted users
are told "cart" and land on search. WCAG 2.4.4, 1.3.1. Automated: no. **Fix:**
either point it at the real cart or relabel it "search".

### M10 — `MobileSidebar` sheet has no title

`components/dashboard/mobile-sidebar.tsx`:
`<SheetContent side="left" className="… bg-transparent p-0">` renders
`<StoreSidebar>` directly with **no `SheetTitle`/`SheetDescription`**. Base UI
Dialog then has no accessible name (and dev-warns). `bg-transparent` on the
popup relies on the sidebar's own gradient to cover the page — fine visually,
but confirm no gutter shows content behind. WCAG 4.1.2. **Fix:** add a
visually-hidden `SheetTitle` (e.g. "Store navigation").

### M11 — Heading hierarchy gaps

Dialogs use `<h3>` as their first heading with no `h1`/`h2` ancestor in the
portal (`restock-interest-dialog`, `payment-proof-lightbox` has none,
`alert-dialog` consumers vary). `create-store-form.tsx` starts at `<h2>` with no
page `<h1>` (onboarding has no layout). `cart-page-client.tsx` `CartSummary` is
`<h2>` — verify the cart page renders an `<h1>`. Marketing pages not audited in
depth. WCAG 1.3.1, 2.4.6. Automated: partly (Lighthouse "heading order").
**Fix:** each page renders exactly one `<h1>`; dialog titles are `<h2>` inside
the dialog and are the dialog's `aria-labelledby` target (level is less
important once it's the labelled name, but keep order sane).

### M12 — Dashboard auth gate renders a blank screen

`app/[locale]/(dashboard)/layout.tsx`: `if (!isReady) return null;` — during the
client auth check the dashboard is a blank page with no `role="status"` /
loading text; SR users hear nothing, then content appears. Also a flash for
everyone. WCAG 4.1.3. **Fix:** render a `LoadingState` with `role="status"` +
visually-hidden "Loading" text; consider server-side auth to avoid the flash.

### M13 — Seller-configurable theme can break contrast

`getStoreThemeStyle()` injects seller-chosen colors as CSS vars consumed by
`.store-theme-primary-button` (`color: white` on a seller `accent → primary`
gradient), `.store-theme-active-text`, `.store-theme-soft-badge`. A seller
picking pale colors produces white-on-pale buttons and low-contrast active text
on both storefront and dashboard. No contrast floor is enforced. WCAG 1.4.3,
1.4.11. Automated: axe will flag it per-store at runtime, not in CI. **Fix
(product decision needed):** compute button text color from the chosen
background luminance (auto black/white), and/or clamp seller colors to a minimum
contrast against white/`--background` at save time in `store-settings`, and/or
add an outline to `store-theme-primary-button`.

### M14 — `components/ui/select.tsx` primitive gaps

Native `<select>` wrapper: no `aria-invalid` pass-through / styling, `h-full`
makes it depend entirely on parent height (collapses if the parent has none),
custom `ChevronDown` is not `aria-hidden`, no `aria-label`/`id` ergonomics.
Consumed by `phone-input`, `product-card`, `product-sheet`, `checkout-form`.
WCAG 1.3.1, 4.1.2. **Fix:** forward `aria-*`, add `aria-invalid` styling parity
with `input.tsx`, `aria-hidden` the chevron, document that a label is required.

### M15 — `image-gallery.tsx` carousel: no position announcement, shared alt

`features/products/components/image-gallery.tsx` — arrows are keyboard-operable
with `aria-label` and a real `focus-visible:ring` (good), but there's no
`aria-live` "image X of N" and every slide uses the same `alt={alt}`. Thumbnails
(not shown) need `aria-current`/pressed state. WCAG 1.3.1, 4.1.3, 1.1.1.
**Fix:** a polite live region announcing position; per-image alt where
available; thumbnail selected state.

### M16 — Toast reliance for critical confirmations

`sonner` `<Toaster position="top-center" richColors closeButton />` in root
layout. `richColors` communicates success/error largely by color; toasts for
"added to cart" (`product-card.tsx`, `duration: 1500`) and order/payment results
auto-dismiss. sonner does provide an assertive region, but (a) verify status is
not color-only (add an icon/text prefix), (b) 1500ms is short for AT users, (c)
cart-count changes elsewhere have no announced feedback. WCAG 1.4.1, 4.1.3,
2.2.1. Automated: no.

### M17 — Cart page: controls + landmark not verified accessible

`app/[locale]/(storefront)/store/[slug]/cart/cart-page-client.tsx`: no `<main>`
(route has none), `CartSummary` starts at `<h2>`, `Trash2` remove and quantity
`updateQuantity` controls need verification for accessible names,
`<button type>` and touch-target size; totals are bare `.toFixed(2)` + currency
(no `Intl.NumberFormat`, minor). Treat as High for the storefront standard once
the row controls are confirmed icon-only. WCAG 1.3.1, 2.4.1, 4.1.2, 2.5.8.

### M18 — `recharts` dashboards not accessible

`revenue-chart.tsx`, `new-vs-returning-chart.tsx`,
`payment-methods-breakdown.tsx`: recharts renders SVG with no
`role="img"`/`aria-label` summary and no text-equivalent. Screen-reader users
get nothing or a flood of `<path>`s. WCAG 1.1.1, 1.4.1. Automated: partly.
**Fix:** wrap each chart in a labelled `role="img"` with an `aria-label` summary
sentence, and render a visually-hidden data `<table>` as the accessible
equivalent.

---

## Low-priority improvements

- **L1** `navbar.tsx` "help" nav item is a `<span aria-disabled="true">` (not
  focusable) at `opacity-50` — communicate "coming soon" with text, not opacity
  alone; or make it a real disabled `<button>` with `aria-disabled` and a
  tooltip. WCAG 1.4.1.
- **L2** Breadcrumbs (`checkout-form.tsx`) use `<nav aria-label="breadcrumb">`
  with `<span>`s — good enough; upgrade to `<ol>` and mark the current step
  `aria-current="step"`.
- **L3** `<Image fill>` without `sizes` in `product-card.tsx` (and possibly
  elsewhere) → oversized downloads on mobile. Perf, not a11y.
- **L4** `MobileNavStrip` (`navbar.tsx`) links are `text-[10px]`;
  `store-sidebar` "soon" badge `text-[10px]`, count badge `text-[8px]` — raise
  to ≥ 12px or remove. WCAG 1.4.4.
- **L5** `store-theme-frame.tsx` applies theme CSS vars in a `useEffect` → brief
  flash of default theme before hydration. Move to an inline `<style>`/SSR'd
  style attribute.
- **L6** `next.config` `images.dangerouslyAllowSVG: true` with a strict
  per-image CSP — acceptable, but confirm remote SVGs can't inject; unrelated to
  a11y.
- **L7** Language toggle in `MobileNavStrip` is `scale-90` inside a horizontal
  scroller — small target.
- **L8** Product-detail "back" link uses a literal `←` character (announced
  "leftwards arrow") — wrap in `aria-hidden` and keep the text label.
- **L9** `initials-avatar` / `store-logo` fallbacks — ensure `role="img"` +
  `aria-label` with the store/customer name when there's no photo (adjacent text
  often covers this; verify per use).

---

## Mobile seller dashboard

**Context:** desktop-first by design, but sellers operate it from phones in the
field. Goal is _operable and readable_, not native-app polish.

### Workflows that genuinely need to work on mobile (must-fix)

| Workflow                                  | Route                                                  | Mobile blocker today                                                                                                                        | Required outcome                                                                                   |
| ----------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Review a payment proof & approve/reject   | `/dashboard/[slug]/orders` (+ order sheet)             | Row actions in rightmost column of an 8-col horizontal-scroll table (H7); proof lightbox has no keyboard/close affordance and no title (C4) | Actions reachable without horizontal scroll (row action menu / sheet); lightbox is a real `Dialog` |
| Advance fulfillment status                | same                                                   | same H7; AGENTS.md notes the sheet footer "advance" bypasses the confirm dialog                                                             | Action in-viewport; sensitive transitions always confirmed                                         |
| Add / edit a product                      | `/dashboard/[slug]/products`                           | `product-sheet` is `w-105` with no base `max-w` → overflows < 420px (M6); `<p>` labels not associated (H1); option builder is dense         | Sheet fits viewport; fields labelled; option builder usable at 360px                               |
| Check notifications                       | dashboard top bar bell                                 | popover `w-80` clips at 320px; count not announced (M8)                                                                                     | Popover fits; count in accessible name                                                             |
| Navigate between sections                 | mobile sidebar sheet                                   | `h-screen` (M5); no `SheetTitle` (M10); low-contrast text (H4); no `aria-current` (H8)                                                      | `dvh`; titled; AA contrast; current page marked                                                    |
| Update store settings (payments/shipping) | `/dashboard/[slug]/settings`, `/payments`, `/shipping` | `Field` labels are `<p>`; toggles/`Switch` need labelled association; forms not error-announced (H1/H2)                                     | Labelled fields, announced saves/errors (there is a "Saved" flash — mirror it in a live region)    |
| Register a manual payment                 | order sheet → `RegisterPaymentForm`                    | file upload same keyboard issue as C2; per-order schema built client-side (good) but errors unassociated                                    | Keyboard-usable upload; associated errors                                                          |

### Where graceful degradation is acceptable

- **Analytics / charts** (`/analytics`): a phone seller needs the headline
  numbers, not full cross-filtered recharts interaction. Provide the KPI
  numbers + a visually-hidden data table (M18); the charts themselves may stay
  desktop-oriented.
- **Bulk / multi-column admin tables** (`/admin/*`): horizontal scroll is
  acceptable **if** the scroll region is labelled/focusable (H7) and any per-row
  action is exposed via a row menu, not only a far-right button.
- **Dense option/variant matrix** in `product-sheet`: it can stay a wide,
  horizontally-scrolling grid as long as it's a labelled scroll region and
  individual cells are reachable; it does not need to become stacked cards.
- **Sections / drag-reorder** (`@dnd-kit` in `/sections`, collections):
  drag-and-drop must have a keyboard/button reorder fallback (dnd-kit supports
  `KeyboardSensor` — verify it's wired and that there are "move up/down" buttons
  as a non-DnD path). If not wired, that's **High**.

**Net:** the dashboard does not need a mobile redesign. It needs: labelled
fields, a `DataTable` scaffold that keeps row actions in-viewport, `dvh` fixes,
contrast tokens, dialog primitives, and `aria-current`/live-region polish.

---

## Storefront mobile experience

Held to a **higher** standard — most buyers are on phones.

### Flow-by-flow

| Flow                        | Route(s)                                                      | Key problems                                                                                                                                                                                                                                          | Severity          |
| --------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Landing / discovery         | `/`, `/search`                                                | marketing navbar: `text-[10px]` mobile strip (L4), search input `text-xs` → iOS zoom (M4), "cart"→search mislabel (M9), no `<main>` (H5), focus indicators missing on nav links (H3)                                                                  | High (aggregate)  |
| Store home                  | `/store/[slug]`                                               | has `<main>` ✓; floating header wraps/obscures (M7); `ProductCard` variant select unlabeled (H9); add-to-cart feedback is a 1.5s toast only (M16); theme-driven contrast (M13)                                                                        | High              |
| Product detail              | `/store/[slug]/product/[id]`                                  | `<main>` ✓ + `pt-20` for the fixed header (fragile when header wraps — M7); gallery has no position announcement (M15); variant selection component (`product-sheet.tsx` on storefront? verify) needs radio semantics; `min-h-screen` not-found state | Medium–High       |
| Variant / options selection | product detail                                                | if it reuses `SelectableCard`/tab-pills → toggle-button semantics (H6); ensure the selected variant + price update is announced                                                                                                                       | High              |
| Cart                        | `/store/[slug]/cart`                                          | no `<main>` (H5/M17); remove/qty controls need labels + 44px targets (M17); mixed-currency + stock warnings are plain `<p>` (H2)                                                                                                                      | High              |
| Checkout                    | `/store/[slug]/checkout`                                      | **C1** (labels/errors), **C2** (keyboard-unreachable proof upload), **H6** (option cards), section-label contrast (H4), `text-sm` inputs → iOS zoom (M4), disabled-submit dead end (C1), submit-error not announced (H2), no `<main>`                 | **Critical**      |
| Auth (buyer)                | `/store/[slug]/account/login`, `/forgot-password`, `/confirm` | same placeholder-only + unannounced-error + invisible-focus pattern as C3; centered card layout inside storefront layout (no `<main>`)                                                                                                                | Critical          |
| Success / error states      | post-checkout confirmation, `submitCheckout.error`            | order-created result handed to a confirmation view — verify it has an `<h1>`, moves focus, and announces; error is a bare `<p>` (H2)                                                                                                                  | High              |
| Navigation (storefront)     | `storefront-header.tsx`                                       | floating overlay only; no `<nav>`; social links open new tabs with `rel` ✓ and `aria-label` ✓ (good); targets small (M7)                                                                                                                              | Medium            |
| Search / filtering          | `/search`, discovery filters                                  | not deeply audited — check filter controls have labels, results count is announced (`role="status"`), and "no results" is not color-only                                                                                                              | Medium (verify)   |
| Payment flow                | checkout proof + method selection                             | proof upload C2; method selection H6; `PaymentMethodDetails` (bank details) must be readable + copyable with adequate contrast — verify                                                                                                               | Critical (via C2) |

### Storefront responsive specifics to fix

- **iOS zoom:** all storefront inputs to 16px on mobile (M4).
- **Reflow at 320px:** checkout `grid-cols-2` option grids, `product-sheet`
  width (M6), floating header wrap (M7) — verify no page-level horizontal scroll
  at 320/360/390/430.
- **Bottom submit vs. browser UI:** checkout submit is in-flow (not fixed) — OK,
  but ensure the page's last element has enough bottom padding and, if a sticky
  summary/CTA is added later, use `env(safe-area-inset-bottom)`.
- **Touch targets:** product-card variant select + buttons, storefront header
  icons, cart qty/remove — ≥ 44×44 with ≥ 8px spacing.
- **Focus order:** floating header is late in the DOM (rendered by layout after
  content) — verify tab order reaches header controls in a sensible place;
  consider DOM-ordering it first with a skip link.

---

## Shared component problems (systemic — fix once, resolve many)

| #   | Shared gap                                                           | Downstream routes/components affected                                                                                                                      | Fix                                                                                                                              |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| S1  | **No `Field`/`Label` primitive**                                     | every form: checkout, buyer+seller login, contact, product-sheet, create-store, restock, register-payment, all store-settings sections, coupons, customers | New `components/ui/label.tsx` + `field.tsx` (label + control + description + error, auto `id`/`aria-describedby`/`aria-invalid`) |
| S2  | **No non-alert `Dialog` primitive**                                  | `RestockInterestDialog` (C5), `PaymentProofLightbox` (C4), any future modal                                                                                | New `components/ui/dialog.tsx` on Base UI `Dialog` (trap/restore/Escape/scroll-lock/labelledby), mirroring `sheet.tsx`           |
| S3  | **`SelectableCard` = wrong ARIA for single-select** (H6)             | checkout: delivery type, pickup point, payment method, payment type, courier modality                                                                      | New `RadioCardGroup`/`RadioCard` on Base UI `RadioGroup`; delete `SelectableCard`                                                |
| S4  | **No global focus-visible fallback; components clear outlines** (H3) | nav, sidebar, product cards, tabs, theme buttons, custom inputs                                                                                            | `globals.css` `:focus-visible` rule + `focus-ring` utility; audit every `outline-none`                                           |
| S5  | **No reduced-motion handling** (H11)                                 | all animated primitives + custom keyframes                                                                                                                 | one `@media (prefers-reduced-motion)` block in `globals.css`                                                                     |
| S6  | **Contrast tokens** (H4, M3)                                         | sidebar, tables, checkout labels, error/warning text, alert-dialog                                                                                         | named AA tokens (`--muted-foreground` sweep, `--error-foreground`, `--warning-foreground`, sidebar text scale)                   |
| S7  | **No skip link / `<main>` / labelled nav in layouts** (H5)           | every route group; missing `(onboarding)/layout.tsx`                                                                                                       | `SkipLink` component + `<main id>` per layout + `<nav aria-label>` for sidebars                                                  |
| S8  | **lucide icons not `aria-hidden`** (M1)                              | app-wide                                                                                                                                                   | `Icon` wrapper or lint autofix                                                                                                   |
| S9  | **No `DataTable` scaffold** (H7)                                     | orders + 5 admin/restock tables                                                                                                                            | shared scroll-region + responsive column-priority + row-action-menu component                                                    |
| S10 | **`select.tsx` primitive gaps** (M14)                                | phone-input, product-card, product-sheet, checkout                                                                                                         | forward `aria-*`, `aria-invalid` parity, `aria-hidden` chevron                                                                   |
| S11 | **`input.tsx` used inconsistently** (M4)                             | hand-rolled inputs in navbar/login/checkout/restock/create-store                                                                                           | route all text inputs through `ui/input.tsx`; shared class token                                                                 |
| S12 | **No async status announcement convention** (H2, M16)                | every mutation surface                                                                                                                                     | `useAnnounce()` polite/assertive live-region hook + standard `LoadingState role="status"`                                        |

---

## Testing gaps

### Current state

- **Unit:** Vitest + RTL + jsdom, 75 colocated files — almost all zod-schema /
  api-wrapper tests and a handful of small component tests
  (`mobile-sidebar.test.tsx`, `store-sidebar.test.tsx`,
  `storefront-header.test.tsx`, `social-icon.test.tsx`, `cart-link.test.tsx`,
  `page.test.tsx`).
- **No a11y assertions anywhere** — no `jest-axe`/`vitest-axe`, no role/name
  queries used as contracts, no keyboard-interaction tests.
- **No browser tests** — `apps/api` has Vitest **e2e** (real Nest module, not a
  browser). `apps/web` has none. No Playwright, no Cypress.
- **No lint-level a11y** — `apps/web` has no ESLint config; CI runs Prettier
  only for web.
- **No Lighthouse/axe in CI.**

### Missing coverage (by risk)

1. **Storefront checkout** — no test that the flow is completable by keyboard,
   that fields have accessible names, that a failed submit is announced, that
   the proof upload is keyboard-operable.
2. **Buyer + seller auth** — no test for label association, autocomplete, or
   announced auth failure.
3. **Seller order actions on mobile** — no test that approve/reject/advance are
   reachable at 375px.
4. **Dialog behaviour** — no test for Escape, focus trap, focus restoration on
   any modal.
5. **Shared primitives** — `Button`, `Input`, `Select`, `Switch`, `Sheet`,
   `Accordion`, `Tooltip`, the new `Field`/`Dialog`/`RadioCardGroup` — no axe
   snapshot / role contract tests.
6. **Reflow** — nothing checks for horizontal page overflow at 320–430px.
7. **Contrast** — nothing checks token contrast; regressions ship freely.
8. **Regression guard** — no lint rule stops the next form from being
   placeholder-only.

---

## Implementation plan

Ordered so foundational shared fixes land first and each later phase builds on
them. Each phase is independently shippable and testable. **No cosmetic
refactors** — every item traces to a finding above.

> Global constraints for all phases: preserve behaviour and business logic; keep
> Server/Client component boundaries (most of these files are already
> `"use client"`); maintain TS strictness
> (`pnpm turbo run typecheck --filter=web`); run
> `pnpm turbo run test --filter=web`; check `node_modules/next/dist/docs/`
> before any Next-API change (AGENTS.md rule); regenerate nothing in
> `packages/types` (no API DTO changes here).

### Phase 0 — Automated a11y harness (do first; it guards every later phase)

- **Scope:** Add ESLint (flat config) to `apps/web` with
  `next/core-web-vitals` + `eslint-plugin-jsx-a11y` (recommended + a few
  `strict` rules: `no-autofocus` off where justified,
  `label-has-associated-control`, `no-static-element-interactions`,
  `interactive-supports-focus`, `anchor-is-valid`,
  `no-noninteractive-element-interactions`). Wire `web#lint` in `turbo.json` to
  run it (keep the Prettier step). Add `vitest-axe` + a `expectNoA11yViolations`
  helper in `test-utils/`. Add a Playwright project **scoped to `apps/web`**
  with `@axe-core/playwright` (`playwright.config.ts`, its own
  `pnpm --filter web test:e2e`), reusing `next build && next start` or
  `next dev`. Add `.github/workflows` step (path-filtered on `apps/web`) running
  web lint + the Playwright a11y job. (Lighthouse CI: **defer** to Phase 8 as
  non-blocking — axe + Playwright cover more of the real issues and LHCI
  setup/flakiness cost isn't worth it up front.)
- **Files:** `apps/web/eslint.config.mjs` (new), `apps/web/package.json`
  (devDeps + scripts), `turbo.json`, `apps/web/playwright.config.ts` (new),
  `apps/web/e2e/` (new), `apps/web/test-utils/axe.ts` (new),
  `.github/workflows/ci.yml`.
- **Impact:** Establishes the regression floor; produces the baseline violation
  list that Phases 1–7 burn down.
- **Risk:** Low. jsx-a11y will surface many existing violations — land the rule
  set as `warn` first, flip to `error` at the end of Phase 6. Playwright adds CI
  time (~2–4 min) — path-filter it.
- **Tests:** the harness itself; a smoke `e2e/smoke.spec.ts` that loads
  landing + login and asserts axe runs.

### Phase 1 — Shared primitives + global CSS (S1, S2, S3, S4, S5, S6, S8, S10, S12)

- **Scope:**
  - `components/ui/label.tsx` + `components/ui/field.tsx`
    (label/description/error, auto ids, `aria-invalid`, `aria-describedby`;
    RHF-friendly).
  - `components/ui/dialog.tsx` on Base UI `Dialog` (parity with `sheet.tsx`:
    portal, backdrop, `DialogTitle`/`DialogDescription` required, Escape, trap,
    restore, scroll-lock).
  - `components/ui/radio-card-group.tsx` (`RadioCardGroup` + `RadioCard`) on
    Base UI `RadioGroup`, roving tabindex, `aria-checked`, group labelled via
    `aria-labelledby`.
  - `globals.css`: real `:focus-visible` outline (token-based, 2px, offset) +
    `focus-ring` utility; `@media (prefers-reduced-motion: reduce)` block; new
    tokens `--error-foreground`, `--warning-foreground`,
    `--sidebar-foreground-{strong,default,muted}` all ≥ AA; retune
    `--muted-foreground` if the sweep shows sub-4.5:1 uses.
  - `components/ui/icon.tsx` (or a codemod) to default `aria-hidden` on
    decorative lucide icons.
  - `components/ui/select.tsx`: forward `aria-*`, add `aria-invalid` styling,
    `aria-hidden` chevron, accept `id`.
  - `hooks/use-announce.ts` (polite/assertive live region) + upgrade
    `components/shared/loading-state.tsx` to `role="status"`.
- **Files:** the new primitives above + `app/globals.css` +
  `components/shared/loading-state.tsx`.
- **Impact:** Nothing changes visually yet, but every later phase now has
  correct building blocks.
- **Risk:** Low–Medium. The `globals.css` focus rule can visually surprise —
  scope with `:focus-visible` only, test across primitives. Base UI `Dialog` API
  drift vs. training data — read `node_modules/@base-ui/react` types and mirror
  the existing `sheet.tsx`/`alert-dialog.tsx` usage.
- **Tests:** `vitest-axe` on each new primitive; RTL tests for `Dialog` (Escape
  closes, focus starts inside, focus returns to trigger, `aria-labelledby` set),
  `RadioCardGroup` (arrow keys move selection, one tab stop), `Field` (error
  sets `aria-invalid` + `aria-describedby`).

### Phase 2 — Layouts & navigation (S7, H5, H8, M10, M12, L5)

- **Scope:** `SkipLink` in root layout; `<main id="main-content" tabIndex={-1}>`
  added in `(marketing)/layout.tsx`, a **new** `(onboarding)/layout.tsx`,
  `(dashboard)/layout.tsx` (wrap `{children}` for the non-store-scoped
  `/admin` + `/account`), and confirm `store-theme-frame.tsx`'s `<main>` gets
  the id; `<main>` added to checkout + cart + storefront `account/*` page
  bodies. `store-sidebar.tsx`: wrap nav in `<nav aria-label>`,
  `aria-current="page"` on active link, always-rendered accessible names (drop
  `title`-only), `aria-hidden` icons, badge `aria-label`. `mobile-sidebar.tsx`:
  visually-hidden `SheetTitle`. `(dashboard)/layout.tsx`:
  `LoadingState role="status"` instead of `return null`.
  `store-theme-frame.tsx`: SSR the theme style to kill the flash.
- **Files:** `app/[locale]/layout.tsx`, `app/[locale]/(marketing)/layout.tsx`,
  `app/[locale]/(onboarding)/layout.tsx` (new),
  `app/[locale]/(dashboard)/layout.tsx`,
  `components/dashboard/store-theme-frame.tsx`,
  `components/dashboard/store-sidebar.tsx`,
  `components/dashboard/mobile-sidebar.tsx`, checkout/cart/account `page.tsx`
  files, new `components/shared/skip-link.tsx`.
- **Impact:** Bypass-blocks, landmark navigation, and "where am I" fixed
  dashboard-wide and on the two storefront flows that lacked `<main>`.
- **Risk:** Low. New `(onboarding)/layout.tsx` must not double-wrap existing
  page markup — check each onboarding page.
- **Tests:** Playwright: skip link is the first tab stop and moves focus to
  `<main>`; every audited route exposes exactly one `main` and one `h1`; axe
  "landmark-unique" / "region" pass.

### Phase 3 — Forms (C1, C3, H1, H2, M4, M11, M14, L1)

- **Scope:** Migrate to `Field`/`Label` and wire errors + announcements:
  `features/auth/components/login-form.tsx`,
  `features/customer-auth/components/*` (buyer auth),
  `features/marketing/contact-form.tsx`,
  `features/checkout/components/checkout-form.tsx`,
  `features/products/components/product-sheet.tsx`,
  `features/stores/components/create-store-form.tsx`,
  `features/orders/components/register-payment-form.tsx`,
  `features/store-settings/components/*` (`section-primitives.tsx` `Field` →
  real `<label>`), `features/restock/components/restock-interest-dialog.tsx`
  (form part; dialog shell in Phase 4). Add `type`/`autoComplete`/`inputMode`;
  16px mobile font via shared input class; error-summary + focus-move-on-submit
  hook; replace disabled-submit dead-end in `checkout-form.tsx` with
  validate-on-submit (keep the button enabled, or add `aria-describedby`
  requirements list). `PhoneInput`: accept `id`, label the national-number
  input, `aria-label` the country select.
- **Files:** the form components above +
  `features/checkout/components/payment-proof-upload.tsx` (C2 — see Phase 4?
  it's a form control; do it here) + `components/ui/phone-input.tsx`.
- **Impact:** Checkout, both logins, product create/edit, store creation,
  contact, payment registration become operable by AT and keyboard users; mobile
  users get persistent labels and no zoom.
- **Risk:** Medium. `checkout-form.tsx` is large with intricate conditional
  fields and a delicate submit-gate; change labels/associations and the
  error/announce layer **without touching the validation logic or the
  `buildCheckoutFormSchema` calls**. Do it field-group by field-group with the
  Playwright checkout spec green after each.
- **Tests:** RTL per form (every control has an accessible name; submitting
  invalid sets `aria-invalid` + describes the error + moves focus;
  wrong-credentials error has `role="alert"`). Playwright: complete checkout at
  375px with keyboard only, including the proof upload; iOS-zoom guard (input
  `font-size >= 16px` at mobile width).

### Phase 4 — Overlays (C2 wrap, C4, C5, H6, M15, M16)

- **Scope:** Rebuild `RestockInterestDialog` and `PaymentProofLightbox` on
  `components/ui/dialog.tsx` (visible close, Escape, trap, restore, scroll-lock,
  `aria-labelledby`, meaningful `alt` on the proof image, success as a
  live-region update with focus moved to the confirmation heading). Replace all
  `SelectableCard` usages in `checkout-form.tsx` with
  `RadioCardGroup`/`RadioCard`; group labelled by the section heading; announce
  the selected-variant/price change. `payment-proof-upload`: finish the
  keyboard-reachable pattern from Phase 3 and add the selected-file / error live
  region. `image-gallery.tsx`: position live region + per-image alt + thumbnail
  selected state. Standardize toasts: icon+text prefix (not color-only), longer
  duration for critical confirmations, add a `role="status"` mirror for
  cart-count changes.
- **Files:** `features/restock/components/restock-interest-dialog.tsx`,
  `features/orders/components/payment-proof-lightbox.tsx`,
  `features/checkout/components/selectable-card.tsx` (delete) +
  `checkout-form.tsx`, `features/checkout/components/payment-proof-upload.tsx`,
  `features/products/components/image-gallery.tsx`,
  `components/storefront/product-card.tsx`, `app/[locale]/layout.tsx` (Toaster
  options), `lib/cart.ts` consumers.
- **Impact:** Every modal meets keyboard/focus/name requirements; checkout
  option selection is a real radio group; galleries and async results are
  announced.
- **Risk:** Medium. `SelectableCard` → `RadioCardGroup` swap touches checkout
  submit-enable logic (it reads `form.watch` values, not the component) so
  behaviour should hold — verify each of the 5 groups. Base UI `RadioGroup`
  inside RHF: use `Controller` like the existing `pickupDate` pattern.
- **Tests:** RTL/axe on both dialogs (Escape, trap, restore, name); Playwright:
  open restock dialog with keyboard, submit, hear/assert confirmation, Escape
  restores focus to the trigger; checkout radio groups navigable with arrows;
  proof lightbox closable with keyboard.

### Phase 5 — Seller dashboard responsive (H7, H4, H10, M2, M5, M6, M8, M13, M18)

- **Scope:** New `components/ui/data-table.tsx` scaffold (labelled focusable
  scroll region, `scope="col"`, `sr-only` caption, `md`-down column-priority
  hiding + sticky identifying column + per-row action menu that stays
  in-viewport). Apply to `orders-table.tsx` and the admin/restock tables. Ensure
  the order **sheet** exposes approve/reject/advance and that sensitive
  transitions always confirm (fix the AGENTS.md-noted footer bypass).
  `orders-tabs.tsx` + sibling filter rows: `aria-pressed`/`aria-current` +
  non-color active indicator + focusable scroller. Sidebar contrast tokens (H4).
  `product-tile.tsx`: remove `role="button"` nesting; real link/button for open;
  fix Space. `product-sheet.tsx`: `w-full max-w-[26.25rem]`.
  `mobile-sidebar.tsx` / `store-theme-frame`: `dvh`. `notifications-bell.tsx`:
  count in `aria-label`, viewport-bounded popover, `<h2>` title. Charts:
  `role="img"` + summary + visually-hidden data table. Store-theme contrast
  guard (M13 — auto button text color + save-time clamp in `store-settings`).
- **Files:** new `components/ui/data-table.tsx`;
  `features/orders/components/orders-table.tsx`, `orders-tabs.tsx`, order sheet
  component; `features/admin/components/*-table.tsx`;
  `features/restock/components/restock-requests-panel.tsx`;
  `features/products/components/product-tile.tsx`, `product-sheet.tsx`;
  `components/dashboard/{store-sidebar,mobile-sidebar,store-theme-frame}.tsx`;
  `features/notifications/components/notifications-bell.tsx`;
  `features/stats/components/*chart*.tsx`, `payment-methods-breakdown.tsx`;
  `lib/store-theme.ts` + `features/store-settings` appearance section.
- **Impact:** A seller can complete the must-fix mobile workflows from the table
  above; dashboard text meets AA; charts have a text equivalent.
- **Risk:** Medium–High. The `DataTable` responsive behaviour is the biggest new
  surface — build it behind the orders table first, get the Playwright 375px
  order-action spec green, then roll to admin tables. Store-theme clamp is a
  **product decision** (may change a seller's saved colors) — flag to the user
  before enforcing at save time; the auto text-color + outline is safe to ship
  regardless.
- **Tests:** Playwright at 375px: approve a payment and advance fulfillment from
  the orders list without horizontal scrolling; sidebar current-page marked; axe
  contrast pass on dashboard/overview + orders + products + settings; chart has
  an accessible name + table.

### Phase 6 — Storefront responsive / mobile (H9, M7, M4 remainder, M17, L3, L4, L7, L8)

- **Scope:** `product-card.tsx`: label the variant `<select>`, `type="button"`,
  `Image sizes`, ≥44px targets, focus rings. `storefront-header.tsx`: single-row
  with overflow affordance (or in-flow header `< sm`), ≥40px targets, keep
  accessible name on the icon-only store link, ensure product detail top padding
  tracks header height. `navbar.tsx`: fix "cart"→search label (M9), raise
  `text-[10px]` (L4), 16px search input (M4), focus rings on nav links, language
  toggle target (L7). `cart-page-client.tsx`: `<main>` (done Phase 2) + labelled
  qty/remove controls + 44px targets + warnings via live region. Verify no
  page-level horizontal scroll at 320/360/390/430 on landing, store home,
  product detail, cart, checkout. `search`/discovery filters: labels +
  `role="status"` results count + non-color "no results".
- **Files:** `components/storefront/product-card.tsx`,
  `features/storefront/components/storefront-header.tsx`,
  `components/marketing/navbar.tsx`,
  `app/[locale]/(storefront)/store/[slug]/cart/cart-page-client.tsx`,
  product-detail view, `app/[locale]/search/*`, discovery filter components.
- **Impact:** Meets the higher storefront mobile bar: readable text, real
  targets, visible focus, no accidental horizontal scroll, announced results.
- **Risk:** Low–Medium. `storefront-header.tsx` layout change is visual — keep
  it minimal (it's a documented deliberate floating cluster; don't turn it into
  a full header without the user's OK — prefer single-row-with-overflow).
- **Tests:** Playwright at 320/375/430: no
  `document.scrollingElement.scrollWidth > innerWidth` on the 5 storefront
  routes; product-card variant select has a name; tab through the storefront
  header; axe pass on landing + store home + product detail + cart.

### Phase 7 — Remaining route-specific + flip lint to error (M1 remainder, M2 remainder, L-items, S8)

- **Scope:** Sweep decorative lucide icons to `aria-hidden` (codemod +
  jsx-a11y). Marketing pages (`founder`, `enterprise`, `contact`, `blog`)
  heading/landmark pass. Onboarding wizard (`onboarding-page-client.tsx`) step
  semantics + focus per step. `my-account`, admin `inquiries` detail. `@dnd-kit`
  reorder (sections/collections): confirm `KeyboardSensor` + visible move
  up/down buttons; add if missing (**promote to High if missing**). Breadcrumb
  `<ol>` + `aria-current` (L2). Then flip the Phase 0 jsx-a11y rules from `warn`
  → `error` and make the Playwright a11y job blocking.
- **Files:** marketing feature components, `onboarding-page-client.tsx`,
  `features/sections` + `features/collections` DnD components,
  `features/my-account/*`, `features/admin/*`, `apps/web/eslint.config.mjs`,
  `.github/workflows/ci.yml`.
- **Impact:** Closes the long tail; CI now blocks regressions.
- **Risk:** Low, except the DnD keyboard path (could be real work if absent).
- **Tests:** Playwright: reorder a section with the keyboard; onboarding step
  focus; axe pass on marketing + onboarding + admin + my-account.

### Phase 8 — Verification + optional Lighthouse CI

- **Scope:** Full run of `typecheck`, web `lint` (now `error`), `test`,
  Playwright a11y (blocking), `next build`. Add `@lhci/cli` autorun
  (non-blocking, a11y-category budget) on landing + one storefront + login
  **only if** it proves stable. Manual: VoiceOver + NVDA pass on checkout, buyer
  login, seller orders; keyboard-only pass of the storefront buy flow and the
  seller approve-payment flow; 320/375/768 responsive pass. Post-implementation
  code review specifically for regressions introduced by the fixes (new focus
  traps, aria duplication, `id` collisions from the `useId` field hook,
  Server/Client boundary breaks).
- **Deliverable:** the before/after table (below) filled in with real
  axe/Playwright numbers.

---

## Summary table (to be completed after implementation)

| Area                    | Before                                                                                                                      | After | Remaining risk                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------ |
| Semantic HTML           | Placeholder-only forms; `role="button"` divs w/ nested buttons; nav in bare `<aside>`; no `<main>` on key routes            |       | Marketing pages not deeply audited                                       |
| Keyboard navigation     | Proof upload unreachable; 2 modals with no Escape/close; option cards each a tab stop; table actions need horizontal scroll |       | DnD keyboard path (verify)                                               |
| Screen readers          | No error association/announcement anywhere; unlabeled fields; icon-only nav w/o names; charts unlabeled                     |       | `sonner` assertive-region behaviour on older AT                          |
| Forms                   | No `<label>`s; no `aria-invalid`/`describedby`; no autocomplete/inputMode; invisible focus ring                             |       | Complex conditional checkout fields need per-branch verification         |
| Dialogs/overlays        | `RestockInterestDialog` + `PaymentProofLightbox` hand-rolled, no trap/restore/Escape/name                                   |       | Base UI version drift vs. docs                                           |
| Seller dashboard mobile | Row actions off-screen; sidebar text fails contrast; sheets `100vh`; product sheet overflows < 420px                        |       | Dense variant matrix stays horizontal-scroll (acceptable)                |
| Storefront mobile       | Checkout unusable by AT/keyboard; iOS zoom; floating header wrap/obscure; unlabeled variant select                          |       | Seller-theme colors can still under-contrast without the save-time clamp |
| Automated a11y testing  | None (no ESLint in web, no axe, no Playwright, no LHCI)                                                                     |       | Playwright CI time; jsx-a11y false-positive triage                       |

---

## Review rounds

_(Filled in during Phase 6 — adversarial subagent review. Each round records:
reviewer findings, which were verified against code, which were rejected and
why, and the resulting audit/plan deltas. Rounds continue until a full round
yields no new Critical/High issues and no material plan errors.)_

- **Round 1:** _pending_
- **Round 2:** _pending_
