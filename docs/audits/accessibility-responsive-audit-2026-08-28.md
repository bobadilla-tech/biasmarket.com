# Accessibility & Responsive Design Audit

Date: 2026-08-28 (revised 2026-08-29 after Round 1 review)
Scope: `apps/web` (Next.js storefront + seller dashboard + marketing + onboarding + admin)
Target standard: WCAG 2.2 AA (practical), plus common Lighthouse / axe / Accessibility Insights automated criteria.
Status: **Audit + implementation plan — finalized after 3 adversarial review rounds (7 subagent passes). Nothing implemented yet.** See **§ Review rounds** at the end for what each round changed and the stop-condition met.

---

## Executive summary

Turborepo monorepo; `apps/web` is Next.js **16.2.11** (App Router, no `src/`), React **19.2.4**,
Tailwind **v4**, shadcn (`base-nova` style) over **`@base-ui/react` 1.6.0** primitives (not Radix),
`react-hook-form` + `zod`, `@tanstack/react-query`, `lucide-react`, `recharts`, `sonner`, `next-intl`,
`@dnd-kit`. Auth is `better-auth` (sellers) + a separate customer-auth cookie flow (buyers).

**Overall state: below WCAG 2.2 AA on every primary flow, with systemic (not one-off) causes.**
The `@base-ui/react` primitives that _are_ consumed (`Sheet`, `Popover`, `Tooltip`, `Accordion`,
`AlertDialog`) are wired mostly correctly and carry focus trap / Escape / restore / scroll-lock. The
problems live almost entirely in **hand-rolled feature code that bypasses those primitives** — and,
importantly, **the Base UI primitives needed to fix most of this already ship in the installed package
but have no shadcn `components/ui/` wrapper yet** (`@base-ui/react/field`, `/fieldset`, `/form`,
`/dialog`, `/radio-group`, `/radio`, `/checkbox`, `/menu`, `/tabs`, `/select`, `/toast`,
`/number-field`, `/combobox` are all present under `node_modules/@base-ui/react/`). So the remediation
is **"wrap what exists," not "build from scratch."**

Highest-impact systemic problems:

- **Forms have no `<label>` elements.** Checkout, both logins, restock, product create/edit, store
  creation, and the store-settings sections are placeholder-only or use `<p>`/`<span>` pseudo-labels.
  **Error association and announcement are near-absent** across the app: `aria-describedby` /
  `aria-invalid` / `aria-live` / `role="alert"` / `role="status"` appear in feature code essentially
  nowhere (only `components/ui/alert.tsx` has `role="alert"`); RHF errors render as bare `<p>` with no
  link to the field, no `aria-invalid`, no live region, and no focus move on submit failure.
  (`aria-label` / `aria-hidden` _are_ used ad hoc in feature code — the gap is specifically error
  identification and status messages.)
- **Two modals are hand-rolled `<div role="dialog">`** with no focus trap, no Escape, no focus
  restoration; the payment-proof lightbox additionally has **no keyboard way to dismiss** and no
  accessible name.
- **The checkout payment-proof file upload is keyboard-unreachable** (`<input class="hidden">` +
  styled `<label>`) — blocks completing a manual-payment purchase without a mouse. Same pattern in the
  dashboard register-payment upload and two product-image pickers.
- **No skip link; `<main>` missing / duplicated.** Storefront checkout, cart, `/account`, onboarding,
  and marketing pages have no `<main>`; the dashboard has **two `<main>` elements per route** waiting
  to be triggered (`SidebarInset` renders one for `/admin/*`, `StoreThemeFrame` renders one for
  `/dashboard/[slug]/*`) — so a naive "add `<main>` in the shared layout" fix would create a
  duplicate-landmark violation. The dashboard sidebar is an unlabeled `<aside>`, not `<nav>`.
- **Visible focus indication is missing or near-invisible** on most hand-rolled controls; there is no
  global `:focus-visible` fallback and several components set `outline-none` without a replacement.
  The default `--ring` is mid-grey and is invisible on the dark-purple dashboard sidebar.
- **Contrast fails widely**: dashboard sidebar text (`text-white/35`–`/72` on a purple gradient),
  checkout section labels (`text-gray-400`), dashboard table/label text (`#8f7da8`/`#927fac`), error
  text (`text-red-500` ≈ 3.8:1), warning text (`text-amber-600`), `alert-dialog` description
  (`#8f7da8`). Seller-configurable store theme has no contrast floor.
- **No `prefers-reduced-motion` handling anywhere.**
- **Mobile:** the products table has a hard `min-w-205` (820px) floor; seller row actions sit in the
  rightmost column of horizontally-scrolling tables; five Sheets' width overrides are dead classes so
  they render at 75vw (broken width system, not a clip — H12); hand-rolled inputs are `<16px` (iOS
  focus-zoom); the entire auth surface centers with `min-h-screen` (below the iOS fold, and clipped
  at the top in landscape); the mobile dashboard nav trigger scrolls away with the page; no
  `env(safe-area-inset-bottom)` and no 200%-text-zoom (WCAG 1.4.4) handling anywhere.
- **No automated a11y tooling**: `apps/web` has no ESLint config at all (lint = Prettier on changed
  files), no `eslint-plugin-jsx-a11y`, no axe, no vitest-axe, no Playwright, no Lighthouse CI, and
  `vitest.setup.ts` lacks `matchMedia`/`ResizeObserver` stubs.

**Highest risks, in priority order:**

1. Storefront **checkout** cannot be completed by screen-reader or keyboard-only buyers
   (unlabeled fields, unassociated/unannounced errors, keyboard-unreachable proof upload, sheets that
   overflow the phone).
2. Storefront + seller **login/auth** — placeholder-only, unannounced failure, weak focus, `min-h-screen`
   pushing the submit button below the iOS fold.
3. **Seller payment/fulfillment row actions** — off-screen in scrolling tables, and the review sheet
   (`order-detail-sheet`) itself overflows a phone; the proof lightbox has no keyboard dismiss.
4. Hand-rolled dialogs violating modal keyboard/focus requirements.
5. Systemic contrast + focus-visibility failures on nearly every route.

Because the causes are systemic, **~8 shared fixes** remove the bulk of individual violations:
(1) `Field`/`Form` wrappers over `@base-ui/react/field`, (2) a `Dialog` wrapper over
`@base-ui/react/dialog`, (3) a `RadioCardGroup` over `@base-ui/react/radio-group`, (4) a global
`:focus-visible` + `prefers-reduced-motion` CSS block, (5) an AA contrast-token pass coupled with a
seller-theme contrast clamp, (6) skip-link + landmark wiring on the **existing** mains, (7) a minimal
`DataTable` scroll-region/row-action helper, (8) an ESLint + vitest-axe + scoped-Playwright harness
with the missing jsdom stubs.

---

## Architecture observations

| Area | Finding |
| --- | --- |
| Framework | Next.js 16.2.11, App Router only. Route groups `(marketing)` `(onboarding)` `(dashboard)` `(storefront)` under `app/[locale]/`. **No `middleware.ts`.** `i18n/routing.ts` = `defineRouting({ locales:["es","en"], defaultLocale:"es" })`, default `localePrefix:"always"` → every URL is `/es/...` or `/en/...`; bare `/` has no page. `next lint` is **removed** in Next 16; ESLint is flat-config only. `apps/web/AGENTS.md` warns the installed Next differs from training data — check `node_modules/next/dist/docs/`. |
| React | 19.2.4. Server Components by default; interactive surfaces are `"use client"`. Several leaf components (`product-tile.tsx`, `section-primitives.tsx`) have no `"use client"` and work only transitively through a client parent. |
| TypeScript | `typescript@^7.0.2` + `@typescript/native-preview` (7.0.0-dev). Next's build-time typecheck is **disabled** (`next.config.ts`: TS7 "ships no compiler API"); `tsc --noEmit` via `pnpm typecheck` is the source of truth. **This threatens the ESLint plan** — `@typescript-eslint/parser` bootstraps the `typescript` package; must be verified before relying on it. |
| Styling | Tailwind v4, `tw-animate-css`, `shadcn/tailwind.css`. Tokens in `app/globals.css` as OKLCH vars with a `.dark` block **never activated** (no theme toggle) → effectively light-only; hardcoded light hex in some components is a tokenization smell, not a live dark-mode bug. `.store-dashboard-theme` + per-store `getStoreThemeStyle()` inject seller-chosen colors as CSS vars. |
| Component library | shadcn `base-nova` over `@base-ui/react` 1.6.0. **Present under `node_modules/@base-ui/react/`:** `accordion alert-dialog autocomplete avatar button checkbox checkbox-group collapsible combobox context-menu dialog field fieldset form input menu menubar navigation-menu number-field otp-field popover progress radio radio-group scroll-area select separator slider switch tabs toast toggle toggle-group toolbar tooltip` + `merge-props`, `use-render`. **Missing = only the shadcn `components/ui/` wrappers:** no `dialog` (only `alert-dialog`), `label`, `field`/`form`, `checkbox`, `radio-group`, `dropdown-menu`, `tabs`, `table`, `pagination`. `packages/ui` is an empty re-export stub. |
| shadcn primitives present | `accordion, alert, alert-dialog, badge, button, card, initials-avatar, input, phone-input, popover, select, separator, sheet, sidebar, skeleton, switch, textarea, tooltip`. `components/ui/sidebar.tsx` **is used** — by `components/admin/app-sidebar.tsx` via `SidebarProvider`/`SidebarInset` in `(dashboard)/admin/layout.tsx` (not by the store dashboard, which hand-rolls `components/dashboard/store-sidebar.tsx`). |
| Base UI behaviour (verified in 1.6.0 types) | `Dialog.Root` `modal` defaults `true` → focus trapped, page scroll locked, outside pointer disabled, Escape closes, focus restored to trigger automatically. **Accessible name is NOT automatic** — Base UI sets `aria-labelledby` only when a `*.Title` element is actually rendered. `sheet.tsx`/`alert-dialog.tsx` export a Title but **do not enforce** it. `Field.Root` has `invalid?: boolean` for external validators; `Field.Error` has `match` to render unconditionally; `Field.Control` composes refs via `mergeProps`/`useRender`. `RadioGroup` renders `role="radiogroup"` + roving tabindex + arrow keys + `aria-checked`, and `RadioGroupState extends FieldRootState` (composes with `Field.Label` for the group name). |
| Forms | `react-hook-form` + `@hookform/resolvers/zod`. Reference impl per AGENTS.md is `features/auth/components/login-form.tsx` — which is itself placeholder-only, propagating the anti-pattern. |
| Tables | No table library. Hand-written `<table>` in `orders-table.tsx`, `admin-*-table.tsx`, `coupon-redemptions-table.tsx`, `inquiries-table.tsx`; `products-page-client.tsx` renders its own `<table className="w-full min-w-205">`. Wrapped in bare `overflow-x-auto` divs, sometimes doubly (a `Card` `overflow-x-auto` around the component's own `overflow-x-auto`). |
| Menus | Account dropdown (`navbar.tsx`) + notifications (`notifications-bell.tsx`) are Base UI `Popover`s containing links — no `role="menu"`. Acceptable for link lists, but the sign-out `<button>` is mixed in. |
| Selects | Native `<select>` via `components/ui/select.tsx` (spreads `{...props}` so `aria-*`/`id` **do** forward). No `aria-invalid` styling, chevron not `aria-hidden`, `h-full` collapses without a sized parent, and consumers don't pass `aria-label`. |
| Tabs | Rows of `<Button>` (`orders-tabs.tsx` etc.) — no tab semantics, active state color-only, scroller not focusable. |
| Icons | `lucide-react`, bare `<svg>` with no `aria-hidden`. Most icon-only buttons _do_ carry `aria-label` on the button, so the SVG in the a11y tree is low-impact — except where the icon is the only content (`product-sheet`/`product-tile` `×` chips, cart `−/+`). |
| Charts | `recharts` (`revenue-chart`, `new-vs-returning-chart`, `payment-methods-breakdown`). SVG output with no `role="img"`/summary/data-table equivalent. |
| DnD | `@dnd-kit` **is used** — `sections-page-client.tsx` wires `useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })` and `collection-card.tsx` has explicit `moveUp` buttons. So a keyboard reorder path exists; it is just **untested**. |
| Auth | Seller: `better-auth` email+password; `useRequireAuth()` client gate in `(dashboard)/layout.tsx` renders `null` while checking (blank screen, no status). Buyer: `customer-auth` cookie flow, `/store/[slug]/account/*`. `apps/api` e2e notes better-auth rate-limits 3 sign-ins / 10s. |
| Breakpoints | Tailwind defaults; `lg:` (1024px) is the dashboard desktop/mobile switch. `useIsMobile()` (`hooks/use-mobile.ts`) calls `matchMedia` unconditionally. |
| Viewport | No `viewport`/`generateViewport` export → Next 16 default `width=device-width, initial-scale=1`. **Zoom not disabled** — good. |
| i18n | `next-intl`, ES/EN, `<html lang={locale}>` set correctly. Both LTR. A few user-facing strings are hardcoded English inside shared primitives (`phone-input` `"Country code"`, `sheet` `"Close"`). |
| Tests | Vitest + RTL + jsdom. `vitest.config.ts` (no `.mts`). `vitest.setup.ts` polyfills only `PointerEvent` + `URL.createObjectURL` — **no `matchMedia`, `ResizeObserver`, `IntersectionObserver`**. `renderWithProviders` = `NextIntlClientProvider` + fresh `QueryClient`. ~75 colocated `*.test.ts(x)`, mostly schema/api unit tests; component tests mock `@/lib/api-client`. Landing (`__tests__/page.test.tsx`) documents that the hero renders **two `<h1>`** (mobile + desktop, CSS-hidden). `apps/api` has Vitest **e2e** (supertest against Nest, no DOM), run **push-only / opt-in** in CI, backed by `scripts/ci/e2e.sh` (Postgres+Redis+MinIO+migrate+seed). **No Playwright.** |
| Lint | `apps/web` has no ESLint. Root `.eslintrc.json` is a 3-line stub. `pnpm lint` for web = Prettier `--check` on changed files. CI (`.github/workflows/ci.yml`) path-filters per package; nothing checks a11y. |

---

## Critical issues

> Can completely prevent users from completing an important workflow.

### C1 — Checkout form: no labels, unassociated + unannounced errors, missing input semantics
- **Severity:** Critical
- **Route/component:** `/store/[slug]/checkout` — `features/checkout/components/checkout-form.tsx`
- **Files:** `checkout-form.tsx` (~20 `<input>`/`<select>`), `features/checkout/schemas/checkout.schema.ts`
- **Problem:**
  - Every field is **placeholder-only**: `customerName` (`:967`), `customerEmail` (`:987`), all
    `shipping*`, `shippingAgencyName`, `shippingDocumentNumber` — no `<label>`, no `aria-label`. The
    only correctly-labelled control is `#pickup-date-input`.
  - Error `<p className="text-sm text-red-500">` nodes are **not linked** (`aria-describedby`), inputs
    are **not `aria-invalid`**, there is **no error summary / live region**, and focus does not move
    on submit failure. `customerName` and `customerPhone` render **no error node at all**.
  - `customerEmail`: no `type="email"` / `autoComplete="email"` / `inputMode`.
    `shippingDocumentNumber`: no `inputMode="numeric"`. `PhoneInput`: no `autoComplete="tel"`.
  - The submit `<button>` is `disabled` via a large boolean (`:1015`–`1037`). That expression is
    **not** a pure validation mirror — it also carries `submitCheckout.isPending` (removing it
    re-enables **double-submit → a second order created**), `mixedCurrencies` (a hard server rule with
    **no zod equivalent** — an enabled button would let `handleSubmit` fire and hit the API), and
    `deliveryOptions`/`profile` query-loading. When disabled it gives **no indication of what is
    unmet**, and a disabled button is out of the tab order → a keyboard/SR user reaches the end of the
    form with no feedback.
  - Section headers (`t("deliveryTypeLabel")` etc.) are `<span className="text-xs … text-gray-400">`
    — not associated with their group and **failing contrast** (`text-gray-400` ≈ 2.9:1 on white).
- **User impact:** Blind, low-vision, cognitive, and keyboard-only buyers cannot reliably complete the
  single most important storefront flow.
- **WCAG:** 1.3.1, 3.3.2, 3.3.1, 3.3.3, 4.1.2, 4.1.3, 1.4.3, 1.3.5.
- **Automated tools catch it?** Partly — axe/Lighthouse flag missing labels, low contrast,
  `aria-invalid`-without-description. They miss the missing focus-move and the disabled-submit dead
  end.
- **Recommended fix:** Wrap `@base-ui/react/field` as `components/ui/field.tsx`; migrate every control
  (`Field.Root invalid` + `Field.Label` + `Field.Control render={<input {...register()} />}` +
  `Field.Error match`). Add an error-summary region (`role="alert"`, focusable) rendered on submit
  failure and move focus to it (or the first invalid field). Add `type`/`autoComplete`/`inputMode`.
  **Keep `isPending` + `mixedCurrencies` + query-loading in the disable condition**; drop only the
  per-field validation gating and rely on submit-time validation + the summary. If any gate remains,
  give the button `aria-describedby` pointing at a "what's left" list.
- **Shared or local?** **Shared** `Field`/`Form` wrappers + error-summary hook; local wiring.

### C2 — Payment-proof upload is keyboard-unreachable
- **Severity:** Critical
- **Route/component:** checkout proof step — `features/checkout/components/payment-proof-upload.tsx`
  (`:40`–`49`). Same pattern: `features/orders/components/register-payment-form.tsx:111`,
  `features/products/components/product-sheet.tsx` (both image pickers),
  `features/stores/components/create-store-form.tsx:468`.
- **Problem:** `<input type="file" className="hidden">` (`display:none` → not focusable) + a styled
  `<label htmlFor>`. Mouse/touch works; a keyboard user cannot focus or activate it. No announcement
  when a file is chosen or rejected.
- **User impact:** Keyboard-only buyers cannot attach proof of payment → cannot complete a
  manual-payment order (the product's core payment model).
- **WCAG:** 2.1.1, 4.1.2, 4.1.3.
- **Automated tools catch it?** Unlikely — axe does not reliably flag a `display:none` file input
  behind a label. Needs a keyboard tab-order test.
- **Recommended fix:** Visually-hidden-but-focusable pattern (`sr-only`, not `hidden`) **or** a real
  `<button type="button">` that calls `fileInputRef.current.click()` with the `<input>` `sr-only`.
  `aria-describedby` for the hint; a polite live region announcing the selected filename / validation
  error. Extract a shared `FileDropzone` (dashboard needs the same).
- **Shared or local?** Local fix; extract a shared component.

### C3 — Login forms: placeholder-only, unannounced failure, weak focus, iOS zoom, below-the-fold on mobile
- **Severity:** Critical (auth is a gateway)
- **Route/component:** `/login`, `/onboarding` — `features/auth/components/login-form.tsx`; buyer:
  `features/customer-auth/components/customer-login-form.tsx`, `forgot-password-form.tsx`,
  `set-password-form.tsx`, `customer-change-password-form.tsx`, `address-form.tsx`,
  `edit-contact-form.tsx`; also `features/marketing/contact-form.tsx`.
- **Problem:**
  - Email + password are **placeholder-only**; no `autoComplete="email"` / `"current-password"`;
    email has no `type="email"`.
  - `errors.email` / `errors.password` / `errors.root` (wrong credentials) render as plain `<p>` —
    **no `role="alert"` / live region, no focus move**.
  - Focus style is `focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100`. The
    `border-emerald-500` swap against `border-gray-200` **is** a (weak) visible change; the
    `ring-emerald-100` is ~1.1:1 on white and effectively invisible. Net: **insufficient**, not
    "absent."
  - Inputs are `text-sm` (14px) → **iOS focus-zoom**.
  - Page wrapper is `min-h-screen flex items-center justify-center` → on iOS with the URL bar visible,
    the centered card sits partly below the fold; the submit button needs a scroll on first paint.
- **WCAG:** 3.3.2, 4.1.2, 3.3.1, 2.4.7, 1.4.11, 1.3.5, 1.4.4, (1.4.10 for the fold).
- **Automated tools catch it?** Missing label + low-contrast ring: yes. Unannounced error + below-fold:
  no.
- **Recommended fix:** `Field` wrapper; `autoComplete`; `type="email"`; real focus ring from the
  shared token; `role="alert"` on the root error + focus it on failure; 16px mobile font;
  `min-h-dvh` (or `min-h-svh`) on the centered wrapper.
- **Shared or local?** Shared primitive + shared focus token + shared input class; local wiring; the
  Phase-3 file list must name every buyer-auth form above, not "`customer-auth/components/*`".

### C4 — `PaymentProofLightbox`: modal with no keyboard dismiss, no focus management, no name
- **Severity:** Critical (keyboard operability)
- **Route/component:** dashboard order detail — `features/orders/components/payment-proof-lightbox.tsx`
  (20 lines). Opened **from inside** `order-detail-sheet.tsx` (itself a Base UI dialog).
- **Problem:** `<div role="dialog" aria-modal="true" onClick={onClose}>` with an inner
  `stopPropagation` container. **No close button, no Escape, no focus trap, no focus move-in, no
  scroll lock, no accessible name.** Dismissal is mouse-only. The proof `<img alt="">` is the sole
  content and has an empty alt.
- **User impact:** A seller reviewing a proof with the keyboard opens the lightbox and **cannot close
  it**; focus stays behind the overlay.
- **WCAG:** 2.1.1 Keyboard (cannot dismiss), 1.1.1 (empty alt on sole content), 4.1.2 (no name),
  2.4.3. _(Not 2.1.2 "No Keyboard Trap" — focus never enters, so there is no trap; the failure is the
  absence of a dismiss mechanism.)_
- **Automated tools catch it?** axe flags `role="dialog"` without a name and the empty `alt`; not the
  missing Escape.
- **Recommended fix:** Rebuild on the new `Dialog` wrapper. Visible close button, Escape, trap,
  restore, scroll lock, `aria-label` ("Payment proof for order …"), meaningful `alt`. **Verify nested
  behaviour** — opening a `Dialog` inside the order `Sheet`: Escape closes only the lightbox and
  returns focus to the in-sheet "view proof" trigger, sheet stays open and trapped.
- **Shared or local?** **Shared** `Dialog` wrapper + local swap.

---

## High-priority issues

### H1 — No `<label>` across dashboard forms; settings toggles have no accessible name (systemic)
- **Components:** `product-sheet.tsx` (labels are `<p>`), `store-settings/components/*` via
  `section-primitives.tsx` — its `Field` wraps `<span>` + `{children}` in a `<label>` (implicit
  association only; **breaks for `PhoneInput`/`Select`** — two controls in one label), and its
  **`ToggleRow` renders `<p>{label}</p>` + Base UI `<Switch>` with no `aria-label`/`aria-labelledby`
  at all** → every settings toggle (payments enable, delivery, stock alerts, notifications) is a
  nameless `role="switch"`. `create-store-form.tsx` `Field` (`:249`) same `<label>`-wrapping-`<p>`;
  its `PhoneInput` (`:405`) associates the label with the country `<select>` only.
- **WCAG:** 1.3.1, 3.3.2, 4.1.2.
- **Automated:** Yes (axe `label`, `select-name`, `aria-toggle-field-name`).
- **Fix:** `Field` wrapper over `@base-ui/react/field`; `ToggleRow` gets a real `<label htmlFor>` /
  `Field.Label` associated with the `Switch`; composite inputs expose an `id`, label points at the
  primary control, sub-controls get their own `aria-label`.
- **Shared or local?** **Shared.**

### H2 — Errors never programmatically associated or announced (systemic)
- **Evidence:** `aria-describedby`/`aria-invalid`/`aria-live`/`role="status"` do not appear in feature
  code; `role="alert"` only in `components/ui/alert.tsx`.
- **Components:** every RHF form; `submitCheckout.error` and all inline mutation-error `<p>`s.
- **WCAG:** 3.3.1, 3.3.3, 4.1.3.
- **Fix:** `Field` renders `<p id role="alert">` and wires `aria-describedby`/`aria-invalid`.
  `useFormErrorSummary` (evaluate `@base-ui/react/form`'s submit coordination first) renders a
  focusable summary + moves focus on failure. `useAnnounce()` polite/assertive live region for
  non-toast async surfaces; upgrade `components/shared/loading-state.tsx` to `role="status"`.
- **Shared or local?** **Shared.**

### H3 — Missing / near-invisible focus indicators (systemic)
- **Evidence:** `globals.css` `@layer base { * { @apply … outline-ring/50 } }` sets only
  `outline-color` (no style/width) → **no global fallback**. Real `focus-visible:ring-3` exists in
  `button.tsx`/`input.tsx`/`accordion.tsx`/`switch.tsx`. Hand-rolled controls without any: sidebar
  `<Link>` items (`store-sidebar.tsx` — `hover:` only), marketing `NavLinks`, `product-card`
  buttons, `selectable-card.tsx` (none), `orders-tabs.tsx`, `store-theme-*` buttons, `navbar`
  `SearchForm` (`focus:border-primary` — 1px), login (`ring-emerald-100`).
- **WCAG:** 2.4.7, 2.4.11 (2.2), 1.4.11.
- **Automated:** Weak — needs Playwright `:focus-visible` checks / manual.
- **Fix:** `globals.css` global `:focus-visible` outline (2px solid, 2px offset) from a token chosen
  to meet 3:1 on **both** the light content area **and** the dark-purple sidebar (or a scoped
  `.store-dashboard-theme aside :focus-visible` override); a `focus-ring` utility; sweep every
  `outline-none` for a `focus-visible:` replacement.
- **Shared or local?** **Shared** (CSS) + sweep.

### H4 — Widespread text-contrast failures (couple with M12)
- **Values:** `store-sidebar.tsx` `text-white/35` (headings), `/40`, `/50`, `/52`, `/72` on a
  `rgb(45,16,90)`→`rgb(24,8,50)` gradient; `text-[8px]` badge. `checkout-form.tsx` / `selectable-card`
  labels `text-gray-400`, helpers `text-gray-500`. `orders-table.tsx`, `product-tile.tsx`,
  `product-sheet.tsx`, `notifications-bell.tsx`, `section-primitives.tsx` `#8f7da8` / `#927fac` /
  `#9582ad` ≈ 3.3–3.6:1. `checkout-summary.tsx` pending amount `text-gray-500` ≈ 3.9:1;
  `contact-form.tsx` network error `text-red-400` ≈ 3:1; `not-found.tsx` link `text-emerald-600` on
  `bg-gray-50` ≈ 3.5:1. Error `text-red-500` ≈ 3.8:1; warning `text-amber-600` ≈ 3.9:1.
  `alert-dialog.tsx:98` description `#8f7da8`. `--muted-foreground` ≈ 4.6:1 (passes, no margin).
- **WCAG:** 1.4.3.
- **Automated:** Yes (per route).
- **Fix:** AA named tokens (`--error-foreground`, `--warning-foreground`, a sidebar-foreground scale
  meeting ≥4.5:1 on the darkest gradient stop, an `#8f7da8` replacement). **This is one workstream
  with M12** — a fixed sidebar token cannot guarantee AA while the gradient itself is
  seller-controlled.
- **Shared or local?** **Shared** tokens + sweep + M12 clamp.

### H5 — No skip link; `<main>` missing on some routes and doubled on others; nav not a landmark
- **Missing `<main>`:** `(marketing)/layout.tsx`, `(onboarding)` (**no layout file**), checkout page
  (all three render branches of `checkout-page-client.tsx`), cart page,
  `app/[locale]/(dashboard)/account/account-page-client.tsx` (has only an `<h1>`), storefront
  `account/*`, and the terminal states `app/[locale]/not-found.tsx` + `app/[locale]/error.tsx` (both
  `min-h-screen` centered, no `<main>`; `not-found.tsx`'s back-home link `text-emerald-600` on
  `bg-gray-50` ≈ 3.5:1 fails AA — fold into H4).
- **Doubled `<main>` risk:** `components/ui/sidebar.tsx:302` `SidebarInset` **is** a `<main>` (used
  for `/admin/*`); `components/dashboard/store-theme-frame.tsx:62` renders a `<main>` (all
  `/dashboard/[slug]/*`). Adding `<main>` in the shared `(dashboard)/layout.tsx` → **two `main`
  landmarks + nested `<main>`** on every dashboard route. Storefront store-home + product-detail
  pages already have `<main>` (good).
- **Nav:** `store-sidebar.tsx` navigation is a bare `<aside>` — no `<nav>` / `aria-label`.
- **WCAG:** 2.4.1, 1.3.1, 1.3.6.
- **Fix:** Shared `SkipLink` (plain `<a href="#main-content">`, sr-only + `focus:not-sr-only`, a
  client leaf — must **not** add `"use client"` to the root layout). Add `id="main-content"
  tabIndex={-1}` to the **existing** mains: pass through to `SidebarInset` in `admin/layout.tsx`, set
  on `StoreThemeFrame`'s `<main>`. Add a **new** real `<main>` only to `/account` and the storefront
  checkout/cart/account page bodies. Create `(onboarding)/layout.tsx` as **structure-only**
  (`<main id tabIndex={-1}>{children}</main>`, no background/centering — each onboarding page already
  ships its own `min-h-screen` wrapper; nested styling would double the 100vh context). Wrap the
  sidebar nav in `<nav aria-label>` (guard against the desktop `<aside>` + mobile-sheet double render
  — assert exactly one **visible** nav).
- **Shared or local?** **Shared** `SkipLink` + per-layout edits on existing mains.

### H6 — `SelectableCard` uses toggle-button semantics for single-select groups (checkout only)
- **Component:** `features/checkout/components/selectable-card.tsx` (`aria-pressed={selected}`), used
  for delivery type (`:544`), pickup point (`:584`), courier modality (`:718`), payment method
  (`:882`), payment type (`:904`) in `checkout-form.tsx`. **Does not apply to storefront variant
  selection** — that is a native `<Select>` (see H9).
- **Problem:** Mutually-exclusive choices modelled as independent toggle buttons: SR announces
  "toggle button, pressed" with no "n of m" context, no group name (`radiogroup` + `aria-labelledby`),
  each option is a separate Tab stop, no arrow-key nav. Group label is an unassociated `<span>` with
  no `id`.
- **WCAG:** 1.3.1, 4.1.2, 3.3.2; 2.4.3.
- **Fix:** `RadioCardGroup`/`RadioCard` over `@base-ui/react/radio-group` (`role="radiogroup"`, roving
  tabindex, `aria-checked`, group labelled via `aria-labelledby` → **each group needs its own
  generated id**; payment-method and payment-type are both visible when `partialAvailable`, so a
  static id string collides). Wire via `Controller` (like `pickupDate` at `:640`). **Preserve:**
  the `""` (unselected) state must not become a selectable radio; the cross-reset side effects
  (`form.setValue("courierModality","")` at `:686`, `pickupPointId` reset at `:251`); the
  `shouldValidate: true` calls; and the `as "AGENCY" | "HOME"` cast at `:474`. **New risk:** Base UI
  `RadioGroup` can select on focus/arrow with no initial value — must confirm focusing an unselected
  group does not mutate `form` state or flip the submit gate.
- **Shared or local?** **Shared** `RadioCardGroup`; delete `SelectableCard`.

### H7 — Seller tables: hard `min-w` floor, row actions off-screen, nested + inaccessible scrollers
- **Components:** `app/[locale]/(dashboard)/dashboard/[slug]/products/products-page-client.tsx:294`
  `<table className="w-full min-w-205 …">` = **hard 820px minimum** → guaranteed 2-D scroll at every
  phone width on the products list. `features/orders/components/orders-table.tsx:45`
  `<div className="overflow-x-auto"><table>` — 8 columns, actions column rightmost (`:119`), scroller
  has **no `tabindex`/`role`/`aria-label`**, `<th>` has no `scope="col"`, `<table>` has no caption.
  `orders-page-client.tsx:220` / `payments-page-client.tsx:182` / `shipping-page-client.tsx:132` wrap
  a `Card className="overflow-x-auto"` **around** the component's own `overflow-x-auto` → **two nested
  scroll containers**; adding a third "labelled region" wrapper without removing the outer one is a
  keyboard/scroll hazard. Same in `admin-*-table.tsx`, `restock-requests-panel.tsx`.
- **WCAG:** 2.1.1, 1.3.1, 4.1.2, 1.4.10 Reflow, 2.5.8.
- **Fix (do NOT blanket-convert to cards — the brief and the "graceful degradation" section below
  explicitly allow labelled horizontal scroll for dense admin tables):**
  - **Replace** (not wrap) the outer `Card` `overflow-x-auto` with a single labelled, focusable
    scroll region (`role="region"`, `aria-label`, `tabindex="0"`).
  - `scope="col"` + `<caption className="sr-only">` / `aria-label`.
  - Remove `min-w-205` from the products table; use `md`-down **column-priority hiding** with a
    **mandatory** per-row disclosure (`<details>` / Sheet) exposing every hidden value — hiding
    payment status/amount/date at `<md` with no disclosure is a new 1.3.1/1.4.10 failure.
  - Below `md`: sticky-left the identifying column; move row actions into an always-in-viewport
    **row action menu** (Base UI `Menu`), not a far-right button.
  - Orders: ensure `order-detail-sheet` exposes approve/reject/advance. **Do not** bundle the
    AGENTS.md-documented "footer advance bypasses the confirm dialog" fix here — that is a
    payment/fulfillment state-machine behaviour change; split it into its own PR/review.
- **Shared or local?** **Shared** minimal `DataTable` helper (scroll region + column-priority +
  row-action-menu slot); build behind the orders table first, then roll to admin.

### H8 — Collapsed dashboard sidebar has no accessible names; no `aria-current`
- **Component:** `components/dashboard/store-sidebar.tsx`. Collapsed → nav `<Link>` renders only a
  lucide `<Icon>` (no `aria-hidden`, no text) with `title={label}` (`:127`); the text `<span>` is
  removed (`:144`). Active item is `bg-white/13 text-white` only — **no `aria-current="page"`**.
  Badge (`:139`) is a bare number, `text-[8px]`.
- **WCAG:** 2.4.4, 4.1.2, 1.4.1, 1.4.4.
- **Automated:** Yes (link name).
- **Fix:** always render an accessible name (visually-hidden `<span>` when collapsed, not `title`);
  `aria-hidden` decorative icons; `aria-current="page"` on the active link; badge
  `aria-label={t("unreadCount",{count})}`, ≥10px visible.
- **Shared or local?** Local.

### H9 — Storefront variant `<Select>` has no accessible name (product card + PDP)
- **Components:** `components/storefront/product-card.tsx:146`,
  `app/[locale]/(storefront)/store/[slug]/product/[productId]/product-detail-view.tsx:114`. Native
  `<Select>` with no `<label>`/`aria-label`. `product-card` add-to-cart `<button>` has no `type`;
  `<Image fill>` has no `sizes`.
- **WCAG:** 1.3.1, 4.1.2, 3.3.2.
- **Automated:** Yes (`select-name`).
- **Fix:** `aria-label={t("chooseVariant",{product:name})}` (or a visually-hidden label);
  `type="button"`; add `sizes`. `select.tsx` should also add `aria-invalid` styling + `aria-hidden`
  chevron.
- **Shared or local?** Local (both files) + a `select.tsx` polish.

### H10 — `product-tile.tsx`: nested interactive + broken Space key
- **Component:** `features/products/components/product-tile.tsx:78`. `<Card role="button"
  tabIndex={0} onClick onKeyDown>` **contains** `<Button>` Publish/Edit/Delete (`:100`–`133`).
  `onKeyDown` handles `" "` **without `preventDefault()`** → page scrolls on Space. (No `"use
  client"` — works transitively.)
- **WCAG:** 4.1.2 (`nested-interactive`), 2.1.1.
- **Automated:** Yes.
- **Fix:** Make `Card` a plain container; a single real control for "open" (`<Link>` or a stretched
  `<button>` with `::after`, action buttons `position:relative; z-index`), or drop whole-card click.
  Add `"use client"` if it gains a hook. **Test:** exactly N+1 tab stops; each action fires without
  navigating; Space `preventDefault`.
- **Shared or local?** Local.

### H11 — No `prefers-reduced-motion` support anywhere
- **Evidence:** zero `prefers-reduced-motion`/`motion-reduce`/`motion-safe`. Base UI Sheet/AlertDialog
  transitions, `animate-accordion-*`, Tailwind `animate-in`/`zoom-in-95`, `globals.css`
  `@keyframes cart-badge-pop` + `.cart-badge-pulse`, sonner, `tw-animate-css`.
- **WCAG:** 2.3.3 (AAA) + good practice for 2.2.2 / vestibular safety.
- **Fix:** one `@media (prefers-reduced-motion: reduce)` block in `globals.css` reducing
  animation/transition durations to ~0.01ms and `scroll-behavior: auto`. Verify Base UI transitions
  degrade cleanly. **Test:** Playwright `emulateMedia({ reducedMotion: 'reduce' })`.
- **Shared or local?** **Shared** (CSS).

### H12 — Sheet width overrides are dead classes; every Sheet renders at 75vw
- **Severity:** Medium _(corrected in Round 2 — this is a broken width system, **not** a reflow
  blocker: 75vw on a 375px phone is 281px and does not clip)_
- **Components:** `features/products/components/product-sheet.tsx:362` (`w-105`),
  `features/orders/components/order-detail-sheet.tsx:62`,
  `features/customers/components/customer-detail-sheet.tsx:40`,
  `app/[locale]/(dashboard)/dashboard/[slug]/shipping/shipping-page-client.tsx:165` (`w-[420px]`),
  `components/dashboard/mobile-sidebar.tsx:40` (`w-[288px]`, `side="left"`).
- **Problem (verified with a real `@tailwindcss/cli@4` build + `twMerge` check):** `components/ui/sheet.tsx:56`
  base string contains `data-[side=right]:w-3/4` + `data-[side=right]:sm:max-w-sm` (and the `left`
  equivalents), and `SheetContent` always emits `data-side` (default `"right"`). `tailwind-merge` does
  **not** reconcile classes across different modifiers, so a bare `w-105` / `w-[420px]` / `w-[288px]`
  in `className` never removes the base rule. The compiled `data-[side=right]:w-3/4` selector is
  `[data-side="right"]` → specificity **(0,2,0)**, which beats a plain `.w-105` **(0,1,0)** on
  specificity **and** source order. **Every one of these five Sheets currently renders at `w-3/4`
  (75vw)** — the intended `420px`/`288px` widths never apply, and on desktop the width is capped by
  `data-[side=*]:sm:max-w-sm` (**384px**, not the intended 420px). No phone overflow, but the whole
  Sheet-width system is inert.
- **WCAG:** none directly (no clip); it undermines the intended responsive design and the desktop
  reading width.
- **Automated:** No (renders fine, just at the wrong width).
- **Fix (in `sheet.tsx`, not the consumers):** replace the base `data-[side=*]:w-3/4` +
  `data-[side=*]:sm:max-w-sm` rules with a sane responsive default (e.g. `w-full sm:w-[26rem]` for
  side sheets) and expose a `size` prop (or equally-specific `data-[side=*]:` overrides) so
  `product-sheet` / `order-detail-sheet` / `mobile-sidebar` can set their own width. **Then** re-check
  each consumer's `w-*` override actually takes effect.
- **Shared or local?** **Shared** (`sheet.tsx`) — move to Phase 1, not Phase 5.

### H13 — Hand-rolled `RestockInterestDialog`: no focus trap / Escape / restore / name; unannounced success
- **Severity:** High _(downgraded from Critical — this is a secondary "notify me when back in stock"
  flow, not a purchase blocker)_
- **Component:** `features/restock/components/restock-interest-dialog.tsx:70` — `<div role="dialog"
  aria-modal="true">` (`inset-0`, not `100vh`), `<div>` backdrop `onClick`, `<h3>` (`:107`) not
  referenced by `aria-labelledby`, `if (!open) return null`. No trap / Escape / restore / initial
  focus / scroll lock. Success branch (`:89`) swaps the body, unmounts the focused submit button
  (focus → `<body>`), no live region. Inputs placeholder-only; errors unassociated.
- **WCAG:** 2.4.3, 4.1.2, 4.1.3, 1.3.1, 3.3.2. _(Not 2.1.2.)_
- **Automated:** Missing name + missing labels: yes. Focus/Escape: no.
- **Fix:** Rebuild on the `Dialog` wrapper (`open`/`onOpenChange` map 1:1; `Controller` + `PhoneInput`
  matches the `pickupDate` pattern). Success as a `Dialog.Description` / live-region update with
  focus moved to the confirmation heading. **Blocker to resolve first:** the storefront sets
  `--store-*` theme vars on a wrapper `<div>` in `store/[slug]/layout.tsx`, **not `:root`**; a Base UI
  `Dialog.Portal` reparents to `document.body`, outside that div → the portaled dialog renders
  **unthemed**. Either move the storefront theme vars to `:root`, or pass `Dialog.Portal`'s
  `container` back into the themed subtree. (Same consideration for any future storefront dialog.)
- **Shared or local?** **Shared** `Dialog` + storefront theme-scope fix + local rebuild.

### H14 — Cart quantity `−` / `+` buttons have no accessible name; targets too small
- **Component:** `app/[locale]/(storefront)/store/[slug]/cart/cart-page-client.tsx` (`:209`, `:231`) —
  `<button type="button">` whose only content is the literal character `-` / `+`. Multiple pairs per
  page. `size-7` (28px) targets. The `+` gets `disabled`/`aria-disabled` at stock cap with no
  explanation. (The `Trash2` remove button _does_ have `aria-label` — so this is an oversight.) Cart
  page also has **no `<main>`** and `min-h-screen`.
- **WCAG:** 4.1.2, 2.4.6, 2.5.8, 1.3.1 / 2.4.1.
- **Automated:** Yes (`button-name`).
- **Fix:** `aria-label={t("decreaseQuantity")}` / `t("increaseQuantity")` (ideally with the item
  name); ≥40px targets with spacing; announce the new quantity (`aria-live` on the count, or a
  polite `useAnnounce`); `<main>` + `min-h-dvh` from Phase 2.
- **Shared or local?** Local.

### H15 — `phone-input.tsx`: national number field has no name; country label hardcoded English; no autocomplete
- **Component:** `components/ui/phone-input.tsx`. `<Select aria-label="Country code">` — **hardcoded
  English** in an ES/EN app. `<input type="tel">` (`:1043`) has **no accessible name at all** and no
  `autoComplete="tel"`. Used by checkout, both logins, restock, create-store, address form.
- **WCAG:** 1.3.1, 3.3.2, 1.3.5, 3.1.2.
- **Automated:** Yes (input name).
- **Fix:** accept `id`/`aria-label`/`label` props; translate the country label via a passed string;
  add `autoComplete="tel"`; associate the `Field.Label` with the number input.
- **Shared or local?** **Shared** (`phone-input.tsx`).

### H16 — Admin sidebar has no `<nav>` landmark and no `aria-current` (added Round 2)
- **Component:** `components/ui/sidebar.tsx` — `Sidebar` renders `<div data-slot="sidebar">` (no
  `role`), `SidebarMenu` renders `<ul>`; `components/admin/app-sidebar.tsx` adds no `<nav>` and no
  active-item marking. Every `/admin/*` route (users, stores, coupons, inquiries) exposes its primary
  navigation as a bare `<div><ul>`.
- **User impact:** Screen-reader users have no navigation landmark to jump to on any admin route and
  no "current page" cue.
- **WCAG:** 1.3.1, 1.3.6, 4.1.2.
- **Automated:** Partly (Lighthouse "no navigation landmark" on some routes).
- **Fix:** `<nav aria-label>` wrapper in `components/ui/sidebar.tsx` (or `app-sidebar.tsx`);
  `aria-current="page"` on the active `SidebarMenuButton`. H5/H8/Phase 2 originally covered only the
  store sidebar — this extends the same fix.
- **Shared or local?** **Shared** (`components/ui/sidebar.tsx`).

---

## Medium-priority issues

- **M1 — lucide icons announced as content.** Decorative `<Icon>` without `aria-hidden` app-wide.
  Most icon-only buttons have `aria-label` on the button, so impact is low — **except** where the
  icon is the only content: `product-sheet.tsx:527` option-chip remove `<button>×</button>` (no
  `aria-label`), `product-tile` `×`, cart `−/+` (H14). **Fix:** give those specific buttons names;
  rely on `eslint-plugin-jsx-a11y` for the general case; **do not** ship a repo-wide `aria-hidden`
  codemod (risks silencing icon-only controls). WCAG 1.1.1, 4.1.2.
- **M2 — Tabs as button rows; active state color-only.** `orders-tabs.tsx` + analytics/payments/
  products filter rows: `<Button variant="ghost">`, no `aria-pressed`/`aria-current`, active =
  `store-theme-primary-button` styling only, scroller not focusable. WCAG 1.4.1, 4.1.2.
- **M3 — `alert-dialog.tsx` hardcoded hex + low-contrast description + Title not enforced.** `:42`
  `border-[#eadcf7] bg-white`, `:86` `text-[#2d1649]`, `:98` `text-[#8f7da8]` (≈3.5:1). Base UI only
  sets `aria-labelledby` when a `*.Title` renders and this wrapper **doesn't enforce one** → any
  consumer omitting `AlertDialogTitle` gets an unnamed alertdialog. **Fix:** tokens + make Title
  required (TS + runtime dev-warning). WCAG 1.4.3, 4.1.2.
- **M4 — iOS input zoom on hand-rolled inputs.** `navbar.tsx` `SearchForm` (`text-xs`/`text-sm`),
  `login-form.tsx` (`text-sm`), `checkout-form.tsx` `inputClassName` (`text-sm`),
  `restock-interest-dialog.tsx` (`text-sm`), and the `PhoneInput`/`Select` className overrides in
  `create-store-form.tsx` (its `name`/`slug` use the shared `<Input>` — already safe). Shared
  `input.tsx`/`textarea.tsx` correctly use `text-base md:text-sm`. **Fix:** route hand-rolled inputs
  through `input.tsx` or a shared class token; enforce with a lint check ("no `text-xs`/`text-sm` on
  `input|select|textarea` without an `md:` companion").
- **M5 — `100vh` / `h-screen` on mobile.** The only real fixed-`100vh` is
  `components/dashboard/mobile-sidebar.tsx:42` (`h-screen w-[288px]`) → `h-dvh`. `store-theme-frame.tsx:46`
  is `min-h-screen` (benign — content can already exceed it; converting is pointless). Auth wrappers
  use `min-h-screen` on a **centered** flex container — that _does_ push the card below the iOS fold
  (see C3 / M-AUTH). WCAG 1.4.10.
- **M6 — Storefront floating header obscures content / small targets.**
  `features/storefront/components/storefront-header.tsx:53` `fixed top-4 right-4 … max-w-[calc(100vw-2rem)]
  flex-wrap`. For a store with 3–4 social links the cluster (~324px) exceeds `max-w` (~288px at a
  320px viewport) and **wraps to 2 rows** (up to ~360px viewport); two rows ≈ 96px vs the product
  page's `pt-20` (80px) → the wrapped header **overlaps the "← back" link and the top of the H1**.
  Icon buttons are `size-8` (32px). Store-name link is icon-only `<sm`. WCAG 1.4.10, 2.5.8, 2.4.4.
  **Fix:** single row with an overflow affordance, or in-flow header `<sm`; ≥40px targets; make the
  page `pt-*` track header height; keep an accessible name on the store link.
- **M7 — Notifications bell: count not in accessible name; popover width.**
  `notifications-bell.tsx` trigger `aria-label={t("title")}` → the badge count inside is **not
  announced**. `PopoverContent w-80` (320px) edge-to-edge at 320px. Panel title is a `<p>`. WCAG
  4.1.2, 1.4.10. **Fix:** `aria-label` includes the count when `>0`; viewport-bounded width; `<h2>`
  title; polite live region for new items.
- **M8 — Navbar mobile "cart" link: wrong name + wrong destination.** `navbar.tsx:311`
  `aria-label={t("cart")}` but `href="/search"`, `<ShoppingBag>` icon. WCAG 2.4.4, 1.3.1. **Fix:**
  point at the cart or relabel "search."
- **M9 — `MobileSidebar` sheet has no title.** `components/dashboard/mobile-sidebar.tsx:40` renders
  `<StoreSidebar>` with **no `SheetTitle`** → Base UI Dialog has no accessible name (dev-warns). A
  close button _does_ render and Escape _does_ work. WCAG 4.1.2. **Fix:** visually-hidden
  `SheetTitle` ("Store navigation").
- **M10 — Dashboard auth gate renders a blank screen.** `(dashboard)/layout.tsx`
  `if (!isReady) return null;`; `(dashboard)/admin/layout.tsx` similar. WCAG 4.1.3. **Fix:**
  `LoadingState role="status"`; consider server-side auth to remove the flash.
- **M11 — Heading hierarchy gaps.** Dialogs use `<h3>` with no `h1`/`h2` ancestor;
  `create-store-form.tsx:367` starts at `<h2>` with no page `<h1>` (onboarding has no layout).
  Landing renders **two `<h1>`** by design (mobile + desktop, CSS-hidden) — any "exactly one h1" check
  must count **visible** nodes. WCAG 1.3.1, 2.4.6.
- **M12 — Seller-configurable theme can break contrast.** `getStoreThemeStyle()` feeds
  `.store-theme-primary-button` (`color: white` on a seller `accent → primary` gradient),
  `.store-theme-active-text`, `.store-theme-soft-badge`, and the `--store-sidebar-*` gradient behind
  H4's low-contrast text. No contrast floor. WCAG 1.4.3, 1.4.11. **Fix (product decision):** compute
  button text colour from background luminance (auto black/white), and/or clamp seller colours to a
  minimum contrast at save time in `store-settings`, and/or add an outline. **One workstream with
  H4.**
- **M13 — `select.tsx` primitive polish.** `{...props}` already forwards `aria-*`/`id`. Missing:
  `aria-invalid` visual parity with `input.tsx`, `aria-hidden` on the `ChevronDown` (`:23`),
  `h-full` (`:17`) collapses without a sized parent. WCAG 1.3.1, 4.1.2.
- **M14 — `image-gallery.tsx` carousel: no position announcement.** _(Downgraded — thumbnails
  already carry `aria-current` (`:95`), per-thumb `alt={`${alt} ${i+1}`}` (`:107`), and real
  `focus-visible:ring` on arrows and thumbnails.)_ Remaining: no `aria-live` "image X of N"; the
  **main** image (`:56`) uses a bare `alt={alt}` (should include the index). WCAG 4.1.3, 1.1.1.
- **M15 — Toast reliance for critical confirmations.** `sonner` `richColors` (color-leaning
  status); "added to cart" `duration: 1500` (short for AT); cart-count changes elsewhere have no
  announced feedback. WCAG 1.4.1, 4.1.3, 2.2.1. **Fix:** icon/text status prefix; longer duration for
  critical confirmations; a `role="status"` mirror for cart-count.
- **M16 — `recharts` dashboards not accessible.** `revenue-chart`, `new-vs-returning-chart`,
  `payment-methods-breakdown`: no `role="img"`/summary. WCAG 1.1.1, 1.4.1. **Fix:** wrap in a
  labelled `role="img"` with a one-sentence `aria-label` summary (the AA floor); a visually-hidden
  data `<table>` whose cell values match the series is a nice-to-have, not required.
- **M17 — `navbar.tsx` "help" item.** `<span aria-disabled="true">` at `opacity-50` inside `<nav>` —
  `aria-disabled` on a non-interactive `<span>` is inert/misuse; keyboard users skip it silently, SR
  users hear a stray text node in a link list. WCAG 1.4.1, 4.1.2. **Fix:** real disabled `<button>`
  with a "coming soon" text cue, or remove it.
- **M-AUTH — Entire auth surface centers with `min-h-screen`.** `login-page-client.tsx:10`, buyer
  `login`/`forgot-password`/`account/confirm`, `onboarding-page-client.tsx`, `verify-email/page.tsx`,
  `create-store/page.tsx` — `min-h-screen flex items-center justify-center`. On iOS with the URL bar
  the centered card sits partly below the fold; **in landscape / short viewports the card's top is
  clipped above the scroll origin and is unreachable.** WCAG 1.4.10. **Fix:** `min-h-dvh` **and**
  `justify-start` + vertical padding (or `sm:justify-center`).
- **M-ZOOM — WCAG 1.4.4 Resize Text (200% text-only zoom) is unhandled (added Round 2).** Distinct
  from 1.4.10 reflow — fixed-height controls clip labels/descenders when text is zoomed to 200%:
  `order-detail-sheet` `h-11` action buttons, `orders-table.tsx:130` `h-8 … text-xs` row actions,
  fixed-width landing CTAs (`about-section.tsx:102,201` `w-[131px]`/`w-[267px]`,
  `discover-section.tsx:58` `w-[186px]`). **Fix:** `min-h`/`h-auto` + `py-*` on action controls;
  `min-w` instead of fixed `w-[…]` on text CTAs. **Test:** Playwright 200%-text-zoom pass in Phase 8,
  spot-checks in Phase 5/6.
- **M-SAFE — No `env(safe-area-inset-bottom)` anywhere.** Sticky sheet footers holding the primary
  CTA (`product-sheet.tsx:875` `SheetFooter sticky bottom-0`, `order-detail-sheet` footer actions)
  sit under the iOS home-bar. **Fix:** `pb-[env(safe-area-inset-bottom)]` on sticky sheet footers.
- **M-COLL — `collection-form.tsx:38,43`.** Two `flex-1 min-w-[160px]` inputs in one flex row →
  320 + gap exceeds a 320px viewport minus page padding → horizontal scroll on the collections
  create form at 320–360px. WCAG 1.4.10.
- **M-SHEET-I18N — `sheet.tsx:74` `<span className="sr-only">Close</span>`** — hardcoded English in
  the shared primitive; every Sheet close button announces "Close" regardless of locale. WCAG 3.1.2.

---

## Low-priority improvements

- **L1** `orders-table.tsx:130` `title` on a **disabled** `<Button>` is not surfaced to keyboard /
  most SRs; an adjacent `sr-only` span covers SR, but a keyboard-only non-SR user gets nothing —
  same dead-end as C1's disabled submit (mitigation half-present).
- **L2** Breadcrumbs (`checkout-form.tsx`) — `<nav aria-label="breadcrumb">` with `<span>`s; upgrade
  to `<ol>` + `aria-current="step"`.
- **L3** `<Image fill>` without `sizes` (`product-card.tsx`, cart, others) → oversized mobile
  downloads. Perf.
- **L4** `MobileNavStrip` (`navbar.tsx`) links `text-[10px]`; `store-sidebar` "soon" badge
  `text-[10px]`, count badge `text-[8px]` → ≥12px or remove. WCAG 1.4.4.
- **L5** `store-theme-frame.tsx` applies theme CSS vars in `useEffect` on `document.documentElement`
  → brief flash of default theme + stale-var risk if two dashboard subtrees mount during a route
  transition. **Note:** "SSR it" is **not** a trivial CSS move — `StoreThemeFrame` is `"use client"`
  and reads `useDashboardStore()` (client TanStack Query, auth-scoped); SSR needs an authenticated
  server fetch with cookie forwarding in `dashboard/[slug]/layout.tsx`. The **storefront** theme is
  already SSR'd from the public `/api/stores/:slug/public` endpoint (`store/[slug]/layout.tsx:57`).
  Treat the dashboard flash fix as its own scoped task, not L5-trivial.
- **L6** `next.config.ts` `images.dangerouslyAllowSVG: true` with a strict per-image CSP — acceptable;
  confirm remote SVGs can't inject.
- **L7** Language toggle `scale-90` inside `MobileNavStrip`'s horizontal scroller — small target.
- **L8** Product-detail "back" link uses a literal `←` (announced "leftwards arrow") — wrap in
  `aria-hidden`, keep the text label.
- **L9** `initials-avatar` / `store-logo` fallbacks — ensure `role="img"` + `aria-label` with the
  name where there's no photo (adjacent text often covers it; verify per use).
- **L10** `checkout-form.tsx` `shippingDocumentType` options (`DNI/CE/RUC/PASSPORT`) vs the `onSubmit`
  cast to `"DNI" | "PASSPORT"` only (`:482`) — latent functional bug (not a11y); flag, don't fix
  here.
- **L11** `store-sidebar.tsx` raw `<a href={`/${locale}/store/${slug}`}>` — **correct** under
  `localePrefix:"always"`; converting to next-intl `<Link>` is a consistency nit, not an a11y issue —
  leave it out of this work.

---

## Mobile seller dashboard

**Context:** desktop-first by design; sellers operate it from phones in the field. Goal: operable and
readable, not native-app polish.

### Must-fix mobile workflows
| Workflow | Route | Mobile blocker today | Required outcome |
| --- | --- | --- | --- |
| Review a payment proof & approve/reject | `/dashboard/[slug]/orders` + `order-detail-sheet` | Row actions in the rightmost column of a scrolling table (H7); **`order-detail-sheet` itself is `w-[420px]` → clips on any phone** (H12); proof lightbox has no keyboard dismiss / no name (C4); sticky footer under the home-bar (M-SAFE) | Actions reachable without horizontal scroll (row action menu); sheet fits the viewport; lightbox is a real `Dialog`; footer respects safe-area |
| Advance fulfillment status | same | same H7/H12; AGENTS.md notes the sheet footer "advance" bypasses the confirm dialog | Action in-viewport; confirm-bypass fixed **separately** |
| Add / edit a product | `/dashboard/[slug]/products` | products table `min-w-205` = 820px forced scroll (H7); `product-sheet` `w-105` overflows (H12); `<p>` labels not associated (H1); sticky footer safe-area (M-SAFE) | Table column-priority + disclosure; sheet fits; fields labelled |
| Update store settings (payments/shipping) | `/dashboard/[slug]/settings`, `/payments`, `/shipping` | `Field` labels are `<p>`; **`ToggleRow` switches have no name** (H1); `shipping-page-client` sheet `w-[420px]` (H12); saves/errors not announced (H2) | Labelled fields + named toggles; sheet fits; announced saves (there's a "Saved" flash — mirror it in a live region) |
| Check notifications | dashboard top-bar bell | popover width at 320px; count not announced (M7) | Popover fits; count in the accessible name |
| Navigate between sections | mobile sidebar sheet | `h-screen` (M5); no `SheetTitle` (M9); low-contrast text (H4); no `aria-current` (H8); duplicate-nav risk when both sidebar copies mount | `h-dvh`; titled; AA contrast; current page marked; exactly one visible nav landmark |
| Register a manual payment | order sheet → `RegisterPaymentForm` | file upload keyboard-unreachable (C2); errors unassociated (H2) | Keyboard-usable upload; associated errors |
| Reorder sections / collections | `/sections`, `/collections` | keyboard path **exists** (`KeyboardSensor` + `moveUp` buttons) but **untested** | Verified keyboard reorder + a test |

### Where graceful degradation is acceptable
- **Analytics / charts:** a phone seller needs the headline numbers, not full cross-filtered recharts
  interaction — `role="img"` + summary is enough (M16); the hidden data table is optional.
- **Bulk admin tables** (`/admin/*`): labelled **horizontal scroll is acceptable** provided the
  scroll region is `role="region"` + `tabindex="0"` + `aria-label` and per-row actions use a row
  menu, not only a far-right button.
- **Product option/variant matrix** in `product-sheet`: a wide, labelled, horizontally-scrolling grid
  is fine — it does not need to become stacked cards.

**Net:** no mobile redesign. Needs: named/labelled fields + toggles, a `DataTable` scaffold keeping
row actions in-viewport, the four sheet-width fixes, `h-dvh` on the mobile sidebar, safe-area on
sticky footers, contrast tokens (+ seller-theme clamp), `Dialog` primitives, `aria-current` /
live-region polish.

---

## Storefront mobile experience — higher standard

| Flow | Route(s) | Key problems | Severity |
| --- | --- | --- | --- |
| Landing / discovery | `/`, `/search` | navbar `text-[10px]` strip (L4), search input `text-xs` → iOS zoom (M4), "cart"→search mislabel (M8), no `<main>` (H5), missing focus rings (H3), dual-`<h1>` by design (M11) | High (aggregate) |
| Store home | `/store/[slug]` | `<main>` ✓; floating header wrap/obscure (M6); `ProductCard` variant select unlabeled (H9); add-to-cart feedback is a 1.5s toast only (M15); theme-driven contrast (M12) | High |
| Product detail | `/store/[slug]/product/[id]` | `<main>` ✓ + `pt-20` fragile vs wrapped header (M6); variant `<Select>` unlabeled (H9); gallery has no position announcement (M14); `min-h-screen` not-found state | High |
| Variant / options selection | product detail / card | native `<Select>`, unlabeled (H9) — **not** `SelectableCard`; announce selected-variant + price change | High |
| Cart | `/store/[slug]/cart` | `−/+` buttons nameless + 28px targets + unannounced qty (H14); no `<main>` / `min-h-screen` (H14/H5); mixed-currency hides the checkout button and shows an unannounced `<p>` (H2) | High |
| Checkout | `/store/[slug]/checkout` | **C1** (labels/errors/disabled-submit), **C2** (keyboard-unreachable proof upload), **H6** (option cards), section-label contrast (H4), `text-sm` inputs → iOS zoom (M4), submit-error not announced (H2), no `<main>` (H5) | **Critical** |
| Auth (buyer) | `/store/[slug]/account/*` | same as C3 (placeholder-only, unannounced error, weak focus); `min-h-screen` centered card below the iOS fold (M-AUTH); no `<main>` | Critical |
| Success / error states | post-checkout confirmation, `submitCheckout.error` | verify the confirmation view has an `<h1>`, moves focus, announces; error is a bare `<p>` (H2) | High |
| Navigation (storefront) | `storefront-header.tsx` | floating overlay only; no `<nav>`; social links open new tabs with `rel` ✓ + `aria-label` ✓; small targets (M6) | Medium |
| Search / filtering | `/search`, discovery filters | verify filter controls have labels, results count is announced (`role="status"`), "no results" isn't color-only | Medium (verify) |

**Storefront responsive specifics:** 16px inputs everywhere (M4); no page-level horizontal scroll at
320/360/390/430 on landing / store home / product detail / cart / checkout (verify — the checkout
`grid-cols-2` option grids use `minmax(0,1fr)` and do **not** overflow, they are just cramped, so
do **not** force them to `grid-cols-1`); `collection-form` overflow (M-COLL); floating-header wrap
(M6); touch targets ≥44px on product-card, cart, storefront header; if a sticky CTA is ever added,
`env(safe-area-inset-bottom)`.

---

## Shared component problems (fix once, resolve many)

| # | Shared gap | Downstream | Fix (wrap, don't build) |
| --- | --- | --- | --- |
| S1 | No `Field`/`Label`/`Form` wrapper — but `@base-ui/react/field` + `/fieldset` + `/form` **ship** | every form | `components/ui/field.tsx` over `@base-ui/react/field` (auto id/`htmlFor`/`aria-describedby`/`aria-invalid`, `invalid` prop for RHF, `Field.Error match`); evaluate `@base-ui/react/form` for the submit/focus-summary before hand-rolling `useFormErrorSummary` |
| S2 | No non-alert `Dialog` wrapper — `@base-ui/react/dialog` **ships** | `RestockInterestDialog` (H13), `PaymentProofLightbox` (C4) | `components/ui/dialog.tsx` mirroring `sheet.tsx`; **enforce `DialogTitle`**; resolve the portal + storefront-theme-scope issue (H13) |
| S3 | `SelectableCard` wrong ARIA — `@base-ui/react/radio-group` **ships** | 5 checkout groups | `RadioCardGroup`/`RadioCard`; per-group generated ids; preserve `""`-unselected + cross-resets; no select-on-focus; delete `SelectableCard` |
| S4 | No global focus-visible fallback; `--ring` invisible on the dark sidebar | nav, sidebar, cards, tabs, theme buttons, custom inputs | `globals.css` `:focus-visible` rule with a token that meets 3:1 on light **and** dark surfaces (or a scoped sidebar override); `focus-ring` utility; audit every `outline-none` |
| S5 | No reduced-motion handling | all animated primitives + keyframes | one `@media (prefers-reduced-motion)` block |
| S6 | Contrast tokens + seller-theme clamp = **one** workstream | sidebar, tables, checkout labels, error/warning text, alert-dialog, theme buttons | AA tokens (`--error-foreground`, `--warning-foreground`, sidebar scale, `#8f7da8` replacement) **and** the M12 luminance clamp / auto text colour |
| S7 | No skip link; landmarks missing/doubled | every route group | `SkipLink` + `id`/`tabIndex` on the **existing** mains (`SidebarInset`, `StoreThemeFrame`); new `<main>` only for `/account` + storefront checkout/cart/account; structure-only `(onboarding)/layout.tsx`; `<nav aria-label>` for the sidebar |
| S8 | No `DataTable` scaffold | orders + 5 admin/restock tables | minimal: replace outer scroller with a labelled focusable region; `scope="col"` + sr-only caption; `md`-down column-priority + **mandatory** row disclosure; row-action menu for orders |
| S9 | `select.tsx` polish | phone-input, product-card, product-detail-view, checkout | `aria-invalid` styling parity; `aria-hidden` chevron; document label requirement |
| S10 | Hand-rolled inputs bypass `input.tsx` (iOS zoom) | navbar, login, checkout, restock, create-store overrides | route through `input.tsx` / shared class; lint guard |
| S11 | No async-status announcement convention | every mutation surface | `useAnnounce()` polite/assertive hook + `LoadingState role="status"` |
| S12 | Shared primitives leak hardcoded English | `sheet.tsx` "Close", `phone-input` "Country code" | prop-drill translated strings |
| S13 | `alert-dialog.tsx` doesn't enforce a Title | every consumer | make `AlertDialogTitle` required + dev-warn |

---

## Testing gaps

### Current state
- Vitest + RTL + jsdom. `vitest.setup.ts` polyfills **only** `PointerEvent` + `URL.createObjectURL`
  — **no `matchMedia` / `ResizeObserver` / `IntersectionObserver`**, so any test that mounts
  `useIsMobile`, `recharts`, or certain Base UI positioners throws.
- ~75 colocated tests, mostly zod/api. Component tests mock `@/lib/api-client`. **No a11y
  assertions** — no axe, no role/name contracts, no keyboard-interaction tests.
- **No browser tests.** `apps/api` Vitest e2e is supertest-only (no DOM), run **push-only / opt-in**.
- No web ESLint; no `eslint-plugin-jsx-a11y`; no Lighthouse.
- `checkout-form.test.tsx` **pins the behaviour this plan changes**: `submitButton.disabled` at
  `:211/:222/:266/:303/:705`, `card.closest("button")` + `aria-pressed` at
  `:292/:330/:383/:662/:665/:788/:795/:798/:805`, and 15+ `getByPlaceholderText` queries.
  `checkout-page-client.test.tsx:131` waits on `confirmButton.disabled`.

### Missing coverage (by risk)
1. **Keyboard-only checkout completion against a real backend** (C1 + C2) — storefront pages fetch in
   server components; `page.route()` can't stub them. Needs a live API + seeded store/products.
2. **Seller approve-payment + advance at 375px with real data** (H7 + C4 + H12) — needs a seeded
   order in `PAYMENT_SUBMITTED` with a `PaymentProof` row + a better-auth seller session.
3. **Proof-upload keyboard reachability** (C2) at the unit level — a ~10-line RTL test
   (tab → `activeElement` is a `<button>`/`<input>`, never a bare `<label>`) is possible today and
   absent.
4. **Modal Escape / focus-trap / focus-restore** on any dialog — none.
5. **Nested overlay** — proof lightbox inside the order sheet: Escape closes only the lightbox and
   restores focus to the in-sheet trigger (C4).
6. **`RadioCardGroup` not-select-on-focus** — focusing an unselected group must not mutate `form`
   state or flip the submit gate (H6).
7. **Duplicate sidebar landmark / `aria-current`** — desktop `<aside>` + mobile sheet both mount
   `StoreSidebar`; component-level RTL can't see the collision; needs Playwright at `<lg` with the
   menu open.
8. **`DataTable` hidden-column recoverability** — every value hidden at `<md` must be reachable by
   keyboard/AT via the disclosure (H7).
9. **SSR store-theme hydration** — if the dashboard flash fix moves vars to SSR, assert zero
   `/hydrat/i` console errors and the correct computed `--store-primary` on first paint.
10. **Contrast tokens** — a deterministic unit test (WCAG ratio fn over every semantic token pair,
    including the sidebar scale on both gradient stops) — nothing like it exists.
11. **`prefers-reduced-motion`** — Playwright `emulateMedia`.
12. **Focus visibility** (H3) — axe/Lighthouse can't measure it; needs Playwright `:focus-visible`
    screenshot checks or a mandatory manual pass.
13. **Reflow at 320–430px** — nothing checks for page-level horizontal overflow.
14. **Regression guard** — no lint rule stops the next form being placeholder-only.
15. **Charts** (M16) — if a hidden data table is added, assert cell values match the series, not just
    that a table exists (recharts needs `ResizeObserver` to render).

### False-confidence traps to avoid
- `vitest-axe` under jsdom **cannot** see contrast / focus / reflow / visibility; `color-contrast`
  returns **incomplete**, not pass. The helper must also assert `results.incomplete` is empty (or
  allowlisted). All contrast / focus / reflow checks are **Playwright-only** against `next start`.
- jsdom applies no Tailwind `@media`; components render mobile **and** desktop variants in the DOM
  (landing = two `<h1>`; `StoreSidebar` rendered twice). Landmark / heading-count and
  `landmark-unique` / `duplicate-id` assertions must run in Playwright and count **visible** nodes —
  a vitest "exactly one h1/main" check fails on correct code.
- "has an accessible name" ≠ correct name. Assert name **content** including dynamic parts (bell
  count, variant-select product name, row-action order id).
- Live-region tests in jsdom only prove structure, never announcement (they miss the "region inserted
  together with its content" bug). Mark those structure-only; make the NVDA/VoiceOver pass a
  **mandatory sign-off** for C1/C2/H2/M14.

---

## Implementation plan

Ordered so foundational shared fixes land first. Each phase is independently shippable and testable.
No cosmetic refactors — every item traces to a finding.

> Global constraints: preserve behaviour and business logic; keep Server/Client boundaries (`SkipLink`
> must be a client leaf, never `"use client"` on the root layout); maintain TS strictness
> (`pnpm turbo run typecheck --filter=web`); run `pnpm turbo run test --filter=web`; check
> `node_modules/next/dist/docs/` before any Next-API change; regenerate nothing in `packages/types`.
> **Wrap `@base-ui/react` primitives; do not hand-roll what ships.**

### Phase 0 — Automated a11y harness (do first; guards every later phase)
- **Scope:**
  - **jsdom stubs (blocking):** add `matchMedia`, `ResizeObserver`, `IntersectionObserver` to
    `apps/web/vitest.setup.ts` + a `setViewport(width)` helper driving `matchMedia.matches`.
  - **ESLint:** flat config for `apps/web`. **First verify `pnpm exec eslint .` boots under the
    TS7-native-preview toolchain.** If `eslint-config-next` / `@typescript-eslint/parser` fails to
    instantiate, either add `eslint-plugin-jsx-a11y` **standalone** (AST-only, needs no type info)
    and skip the Next typed config, or add a real `typescript@5.x` as an ESLint-only devDependency.
    Next 16 has **no `next lint`**; the flat entry is `eslint-config-next/core-web-vitals` (spread),
    which bundles react/react-hooks/`@next/next` **only — no jsx-a11y** → add
    `eslint-plugin-jsx-a11y` as its own flat block (`label-has-associated-control`,
    `no-static-element-interactions`, `interactive-supports-focus`, `anchor-is-valid`,
    `no-noninteractive-element-interactions`, `role-has-required-aria-props`, …). Land as **`warn`**.
    Wire `web#lint` in `turbo.json` (keep the Prettier step).
  - **vitest-axe:** `test-utils/axe.ts` with `expectNoA11yViolations` that fails on `violations`
    **and** non-allowlisted `incomplete`. Use only for the **new** `Field`/`Dialog`/`RadioCardGroup`
    (not the thin Base UI re-exports).
  - **Playwright (scoped):** `apps/web/playwright.config.ts` + `apps/web/e2e/`, `@axe-core/playwright`.
    **Backend — this is new infra, not "reuse":** `scripts/ci/e2e.sh` reusably provides only the GH
    `services:` Postgres/Redis, `load-e2e-env.sh`, the MinIO bring-up, and `prisma migrate deploy` —
    it starts **workers only** (`node apps/workers/dist/main.js`), no HTTP API server, and **no
    seed**. The web-e2e job must additionally: web install/build, run a real
    `node apps/api/dist/main.js` on :3000 (health-gate + teardown), `next build && next start` on
    :3001 (health-gate + teardown), and invoke `seed:base`. Obtain a seller `storageState` once
    (`SEED_PASSWORD = 'seedpassword123'`; better-auth rate-limits → `workers: 1` or shared state). All
    `goto` targets are locale-prefixed (`/es/...` — no `middleware.ts`). Use `next build && next start`
    (not `next dev`; `output: "standalone"` is additive and fine). Cap: ≤6 routes × ≤3 viewports (375
    / 768 / desktop). Add `web#test:e2e` to `turbo.json`; gitignore `playwright-report/` +
    `test-results/`.
  - **New seed data (blocking for the Phase 4/5 seller specs) — corrected in Round 3:** there is **no
    `PaymentProof` model / `ProofStatus` enum** (CLAUDE.md is stale); buyer proof lives on
    `OrderPayment` — `source PaymentSource` (`SELLER_RECORDED | BUYER_SUBMITTED`), `reviewStatus
    PaymentReviewStatus` (`N_A | PENDING_REVIEW | APPROVED | REJECTED`), `imageUrl String?`
    (`packages/db/prisma/schema.prisma:350,369,374`). `ensureOrderPayment`
    (`apps/api/scripts/seed/helpers.ts:481`) already exists and already takes `imageUrl`;
    `OrderPaymentSpec` (`fixtures.ts:88`) already has `imageUrl?`; `apply.ts:394` already loops
    `order.payments`. **What to add:** (a) `source` / `reviewStatus` passthrough in
    `ensureOrderPayment` (it currently hard-defaults `SELLER_RECORDED` / `N_A`); (b) on a
    `PAYMENT_SUBMITTED` fixture order, a `payments:[…]` entry with `imageUrl` set (a MinIO-hosted
    image) — this alone unblocks the **proof-lightbox** spec (`PaymentHistoryList` shows the preview
    whenever `imageUrl` is truthy); (c) **also** a `SELLER_RECORDED` (or `APPROVED`) payment on that
    order so `paidAmount > 0` — `countsTowardPaid` (`apps/api/src/common/payment-summary.ts:27`) is
    `source === 'SELLER_RECORDED' || reviewStatus === 'APPROVED'`, so a `BUYER_SUBMITTED` +
    `PENDING_REVIEW` payment alone leaves `paidAmount === 0` and the **Approve** control stays
    `disabled` (`orders-table.tsx:129`, `order-detail-sheet.tsx:251`). No `ensurePaymentProof`, no
    schema change.
  - **CI:** a **dedicated job** with its own `timeout-minutes` (realistically +6–12 min: first-run
    ESLint, browser download/cache, both servers + seed bring-up, axe scans), path-filtered on
    `apps/web/**` **and** `apps/api/prisma/**` + `apps/api/scripts/seed/**`. **Two targeted specs
    PR-gate** (≈2 min) — keyboard checkout (C1+C2) once Phase 3 lands it, seller approve-payment +
    proof lightbox (C4+H7) once Phase 5 lands it. The **broader** axe/reflow/contrast matrix stays
    **push-only / opt-in** until Phase 7. Note: the existing `e2e` job is a **CD gate**
    (`.github/workflows/ci.yml:566-568`) — keep the opt-in matrix out of that gate so a lagging sweep
    can't block deploys; the two PR-gated specs are cheap and stable enough to gate.
  - **Lighthouse CI: dropped**, not deferred — `@axe-core/playwright` covers the a11y category; LHCI
    adds perf/SEO/PWA score noise and its own served build.
- **Files:** `apps/web/vitest.setup.ts`, `apps/web/eslint.config.mjs` (new), `apps/web/package.json`,
  `turbo.json`, `apps/web/playwright.config.ts` + `apps/web/e2e/` (new), `apps/web/test-utils/axe.ts`
  (new), `.github/workflows/ci.yml` (new `web-e2e` job + the hand-maintained `ci-success` "Check all
  required jobs" `*_RESULT`/`*_CHANGED` env block, ~`:678`), `apps/api/scripts/seed/{helpers.ts,fixtures.ts}`
  (`source`/`reviewStatus` passthrough + the proof/paid fixture above).
- **Impact:** regression floor + the baseline violation list Phases 1–7 burn down.
- **Risk:** Low–Medium. ESLint/TS7 compatibility is the real unknown — spike before committing.
- **Tests:** the harness itself; `e2e/smoke.spec.ts` loads `/es` + `/es/login` and runs axe.

### Phase 1 — Shared primitives + global CSS (S1–S6, S9, S11, S12, S13, S14, H12)
- **Scope:**
  - `components/ui/field.tsx` + `label.tsx` over `@base-ui/react/field` (RHF glue: `Field.Root
    invalid={!!errors.x}`, `Field.Control render={<input {...register("x")} />}`. **`Field.Error` MUST
    get `match={!!errors.x}`** — without an explicit `match` it renders off Base UI's own form
    context, not RHF's, and is inert. Leave Base UI `validationMode` unused so it doesn't double with
    `zodResolver`.) Evaluate `@base-ui/react/form` for the error-summary/focus before hand-rolling.
  - `components/ui/dialog.tsx` over `@base-ui/react/dialog` (mirror `sheet.tsx`; **require**
    `DialogTitle`; portal `container` prop for themed subtrees).
  - `components/ui/menu.tsx` over `@base-ui/react/menu` (S14 — the row-action menu Phase 5 needs;
    roving focus, Escape, typeahead, `role="menu"`/`menuitem`).
  - `components/ui/radio-card-group.tsx` over `@base-ui/react/radio-group` (verified safe: no
    select-on-focus — `RadioRoot.onFocus` bails unless the group is `touched`, set only on arrow keys;
    `value=""` is safe as "unselected").
  - `components/ui/sheet.tsx` (H12): replace the base `data-[side=*]:w-3/4` + `data-[side=*]:sm:max-w-sm`
    rules (dead-class specificity trap — bare `w-*` overrides never win) with a real responsive
    default + a `size` prop; keep the replacement width rules `data-[side=left/right]:`-scoped so
    bottom/top sheets are untouched. Then re-check **all seven** `SheetContent` consumers' widths
    actually apply: `product-sheet.tsx`, `order-detail-sheet.tsx`, `customer-detail-sheet.tsx`,
    `shipping-page-client.tsx`, `mobile-sidebar.tsx`, **`components/ui/sidebar.tsx:184`** (admin mobile
    nav — `w-(--sidebar-width)`, same trap), **`store-settings/components/delivery-section.tsx:298`**
    (no width class — will adopt whatever new default is chosen).
  - `globals.css`: `:focus-visible` outline from a dual-surface-safe token (+ scoped
    `.store-dashboard-theme aside` override); `@media (prefers-reduced-motion: reduce)` block; new AA
    tokens `--error-foreground`, `--warning-foreground`, sidebar-foreground scale, `#8f7da8`
    replacement.
  - `components/ui/select.tsx`: `aria-invalid` styling parity, `aria-hidden` chevron.
  - `components/ui/phone-input.tsx` (H15): `id`/`aria-label`/`label` props, translated country label,
    `autoComplete="tel"`, label→number-input association.
  - `components/ui/sheet.tsx` (S12): translated "Close".
  - `hooks/use-announce.ts`; `components/shared/loading-state.tsx` → `role="status"`;
    `components/shared/error-state.tsx` → `role="alert"` (consumed by `app/[locale]/error.tsx`).
  - `components/ui/alert-dialog.tsx` (S13): enforce Title + tokens.
- **Impact:** no visible change yet; every later phase gets correct building blocks.
- **Risk:** Low–Medium. Read the installed `@base-ui/react` types; mirror existing `sheet.tsx`
  usage. The global `:focus-visible` must be validated on the dark sidebar.
- **Tests:** vitest-axe on the 3 new primitives; RTL — `Dialog` (Escape closes, focus starts inside,
  returns to trigger, `aria-labelledby` set), `RadioCardGroup` (arrow keys move selection, one tab
  stop, **focusing an unselected group does not fire onValueChange**), `Field` (error sets
  `aria-invalid` + `aria-describedby`, no `duplicate-id` when a field has both description and error);
  **deterministic contrast unit test** over every semantic token pair (≥4.5 / ≥3 large); Playwright
  `emulateMedia({ reducedMotion: 'reduce' })` → a representative animation resolves to ~0s.

### Phase 2 — Layouts & navigation (S7, H5, H8, H16, M9, M10, M11, M-AUTH, L5-note)
- **Scope:** `SkipLink` (plain `<a>`, sr-only + `focus:not-sr-only`) in the root layout. Add
  `id="main-content" tabIndex={-1}` to the **existing** mains — `<SidebarInset id="main-content"
  tabIndex={-1}>` directly in `admin/layout.tsx` (it already spreads `{...props}` onto its `<main>` —
  **no `app-sidebar.tsx` edit**), and set the same on `StoreThemeFrame`'s `<main>`. Add a **new**
  real `<main>` only to `account-page-client.tsx` and the storefront checkout / cart / account page
  bodies (`checkout-page-client.tsx` must wrap **all three** of its render branches). New
  **structure-only** `app/[locale]/(onboarding)/layout.tsx` (`<main id tabIndex={-1}>`, no styling) —
  and give onboarding pages an `<h1>`. `store-sidebar.tsx` **and the admin sidebar** (H16 —
  `components/ui/sidebar.tsx` `Sidebar` is a bare `<div>`, `SidebarMenu` a `<ul>`;
  `components/admin/app-sidebar.tsx` adds no `<nav>`): wrap nav in `<nav aria-label>`,
  `aria-current="page"` on the active item, always-rendered accessible names, `aria-hidden` icons,
  badge `aria-label`. `mobile-sidebar.tsx`: visually-hidden `SheetTitle`. `(dashboard)/layout.tsx` +
  `admin/layout.tsx`: `LoadingState role="status"` instead of `return null`. Auth wrappers:
  `min-h-screen` → `min-h-dvh` **and** `justify-start` + vertical padding (or `sm:justify-center`) so
  the card top isn't clipped in landscape (M-AUTH).
- **Files:** `app/[locale]/layout.tsx`, `(marketing)/layout.tsx`, `(onboarding)/layout.tsx` (new),
  `(dashboard)/layout.tsx`, `(dashboard)/admin/layout.tsx`, `components/dashboard/store-theme-frame.tsx`,
  `components/ui/sidebar.tsx` + `components/admin/app-sidebar.tsx` (nav landmark + `aria-current`),
  `components/dashboard/store-sidebar.tsx`, `components/dashboard/mobile-sidebar.tsx`,
  `account-page-client.tsx`, `checkout-page-client.tsx` + cart/account `page.tsx`, the ~7 auth
  wrappers, `components/shared/skip-link.tsx` (new).
- **Impact:** bypass-blocks, landmark nav (store **and** admin), "where am I", and the auth
  below-fold / landscape-clip fixed.
- **Risk:** Low–Medium. **Do not** add `<main>` in the shared `(dashboard)/layout.tsx` (double-main).
  `(onboarding)/layout.tsx` must add no `min-h-screen`/centering. Editing `components/ui/sidebar.tsx`
  touches the admin shell — keep it to the nav landmark + `aria-current`, no restructure.
- **Tests:** Playwright — skip link is the first tab stop and moves focus to `<main>`; every audited
  route exposes exactly **one visible** `main` and **one visible** `h1`; dashboard at `<lg` with the
  menu open → exactly one visible `navigation` named "Primary" + one `aria-current="page"`;
  `duplicate-id` / `landmark-unique` axe pass.

### Phase 3 — Forms (C1, C3, H1, H2, H15, M4, M11, M17, L1; R2-7, R2-8)
- **Scope:** Migrate to `Field` + wire errors + announcements: `login-form.tsx`,
  `customer-login-form.tsx`, `forgot-password-form.tsx`, `set-password-form.tsx`,
  `customer-change-password-form.tsx`, `address-form.tsx`, `edit-contact-form.tsx`,
  `contact-form.tsx`, `checkout-form.tsx`, `product-sheet.tsx`, `create-store-form.tsx`,
  `register-payment-form.tsx`, **`features/my-account/components/change-password-form.tsx`** (seller
  `/account`), `store-settings/components/*` (`section-primitives.tsx` `Field` → real `<label>`;
  **`ToggleRow` → labelled `Switch`**), `restock-interest-dialog.tsx` (form part; shell in Phase 4).
  For `contact-form.tsx` and `register-payment-form.tsx` the fix is to **add** error rendering
  (`formState.errors` is never destructured / never displayed today), not "convert a bare `<p>`."
  Add `type`/`autoComplete`/`inputMode`; 16px mobile font via the shared class. Error-summary +
  focus-move-on-submit. **`checkout-form.tsx`: keep `isPending` + `mixedCurrencies` + query-loading in
  the disable condition**; drop only per-field validation gating; add the summary.
  `register-payment-form.tsx`: same — keep the real gates, add a summary, no silent dead-end.
  **Success-state focus (R2-8):** any branch that unmounts its form on success
  (`checkout-page-client.tsx` `if (order)`, `set-password-form.tsx`, `contact-form.tsx`) must move
  focus to the confirmation heading and announce via `role="status"`; `checkout-page-client.tsx` also
  gets `<main>` on all three branches + `min-h-dvh`.
  **Test-query migration (default, R2-11):** migrate the ~15 `getByPlaceholderText` test files to
  `getByLabelText` (Testing Library's preferred query) in the same PR and drop label-echo
  placeholders (keep only genuine format hints like `you@example.com`) — do **not** keep a label + an
  identical-string placeholder (double announcement on VO/NVDA).
  C2 proof-upload keyboard fix lands here (it's a form control).
- **Files:** the forms above + `checkout-page-client.tsx` + `payment-proof-upload.tsx` +
  `phone-input.tsx` consumers.
- **Impact:** checkout, both logins, product create/edit, store creation, contact, payment
  registration, settings toggles become operable by AT and keyboard; mobile gets persistent labels +
  no zoom.
- **Risk:** **Medium–High.** `checkout-form.tsx` is large with intricate conditional fields.
  **Explicitly rewrite `checkout-form.test.tsx` + `checkout-page-client.test.tsx`** in this phase
  (the `disabled` assertions at `:211/:222/:266/:303/:705` and the placeholder queries). Do it
  field-group by field-group with the Playwright checkout spec green after each.
- **Tests:** RTL per form (every control has an accessible name whose **content** is right; invalid
  submit sets `aria-invalid` + describes the error + moves focus; wrong-credentials error is
  `role="alert"`; **submit still disabled while `isPending`/`mixedCurrencies`**). RTL: proof upload
  keyboard reach (`activeElement` is a `<button>`/`<input>`, never a `<label>`). Playwright: complete
  checkout at 375px with keyboard only incl. the proof upload; static lint guard for iOS-zoom;
  `duplicate-id` axe pass on every migrated form route.

### Phase 4 — Overlays (C4, H6, H13, M14, M15)
- **Scope:** **First** resolve the storefront theme-scope issue (H13 / portal): move `--store-*`
  vars to `:root` in `store/[slug]/layout.tsx` **or** give the `Dialog` a portal `container` prop
  pointing into the themed subtree. Then rebuild `RestockInterestDialog` and `PaymentProofLightbox`
  on `components/ui/dialog.tsx` (visible close, Escape, trap, restore, scroll-lock,
  `aria-labelledby`, meaningful `alt`; success as a live-region update with focus moved to the
  confirmation heading). Replace all `SelectableCard` uses with `RadioCardGroup`/`RadioCard`
  (per-group generated `aria-labelledby` ids on the now-`id`'d section headings; keep `""` unselected;
  preserve the `courierModality`/`pickupPointId` cross-resets and the `as "AGENCY"|"HOME"` cast;
  `Controller` per group). `image-gallery.tsx`: "image X of N" live region + main-image alt index.
  Toasts: icon/text status prefix, longer duration for critical confirmations, `role="status"` mirror
  for cart-count.
- **Files:** `restock-interest-dialog.tsx`, `payment-proof-lightbox.tsx`,
  `store/[slug]/layout.tsx` / `globals.css` (theme scope), `selectable-card.tsx` (delete) +
  `checkout-form.tsx`, `image-gallery.tsx`, `product-card.tsx`, `app/[locale]/layout.tsx` (Toaster),
  `lib/cart.ts` consumers.
- **Impact:** every modal meets keyboard/focus/name requirements; checkout option selection is a real
  radio group; galleries and async results announced.
- **Risk:** **Medium–High.** `SelectableCard` → `RadioCardGroup` touches the checkout submit-enable
  logic (it reads `form.watch`, not the component — should hold, but verify all 5 groups) and the
  Base UI select-on-focus risk. The proof lightbox opens **inside** the order Sheet — verify nested
  Escape/focus-restore.
- **Tests:** RTL/axe on both dialogs (Escape, trap, restore, name); RTL — focusing an unselected
  `RadioCardGroup` does **not** mutate `form` or enable submit; RTL — "does not preselect a
  closed-today pickup point" still holds (`checkout-form.test.tsx:269` rewritten to `role="radio"`).
  Playwright: open restock dialog with keyboard → submit → confirmation announced → Escape restores
  focus to the trigger; nested — open order sheet → open lightbox → Escape → focus on the in-sheet
  trigger, sheet still open + trapped; checkout radio groups arrow-navigable.

### Phase 5 — Seller dashboard responsive (H4+M12, H7, H10, M2, M5, M7, M16, M-SAFE, M-ZOOM, R2-13)
- **Scope:** Minimal `components/ui/data-table.tsx` (labelled focusable scroll region — **replacing**
  the outer `Card overflow-x-auto`, not nesting; `scope="col"` + sr-only caption). **Row disclosure
  (concrete shape — R2-15):** a dedicated **leading `<td>`** per data row with a
  `<button aria-expanded aria-controls>` toggling **one** sibling `<tr class="md:hidden" role="row">`
  that holds a `<td colSpan={N}>` listing every column value hidden at `<md`. Accept the doubled
  `<tbody>` row count — fix `tr:hover`, `last:border-0`, and any `aria-rowcount` to match. The
  **row-action `Menu`** (from Phase 1's `components/ui/menu.tsx`) lives in a **separate** sticky
  trailing `<td>`, never the disclosure cell. For the **products** table, either the same disclosure
  pattern or a **new read-only products-row detail Sheet** (there is no existing one — `product-sheet`
  is create/edit only). Apply to `orders-table.tsx` first, then `admin-*`, `coupon-redemptions`,
  `inquiries`, `restock-requests-panel`. **Remove `min-w-205`** from `products-page-client.tsx:294`.
  `mobile-sidebar.tsx:42` `h-screen` → `h-dvh`. Sticky sheet footers → `pb-[env(safe-area-inset-bottom)]`.
  **`store-theme-frame.tsx:52` mobile top bar → `sticky top-0` (R2-13)** so the nav trigger doesn't
  scroll away. `orders-tabs.tsx` + sibling filter rows: `aria-pressed`/`aria-current` + non-color
  indicator + focusable scroller. **Sidebar contrast tokens + the M12 seller-theme clamp /
  auto-text-colour as one change.** **Fixed-height action controls → allow growth for 200% text zoom
  (M-ZOOM):** `order-detail-sheet` `h-11` buttons, `orders-table.tsx:130` `h-8 text-xs` actions.
  `product-tile.tsx`: remove `role="button"` nesting, real open control, `preventDefault` on Space,
  add `"use client"`. `notifications-bell.tsx`: count in `aria-label`, viewport-bounded popover,
  `<h2>` title. Charts: `role="img"` + summary. **Split out (separate PR):** the `order-detail-sheet`
  footer confirm-bypass fix.
- **Files:** new `components/ui/data-table.tsx`; `orders-table.tsx`, `orders-tabs.tsx`,
  `orders-page-client.tsx` / `payments-page-client.tsx` / `shipping-page-client.tsx` (remove outer
  scroller), `order-detail-sheet.tsx`, `customer-detail-sheet.tsx`, `products-page-client.tsx`
  (+ new products-row detail sheet if chosen), `product-tile.tsx`, `admin/components/*-table.tsx`,
  `restock-requests-panel.tsx`, `components/dashboard/{store-sidebar,mobile-sidebar,store-theme-frame}.tsx`,
  `notifications-bell.tsx`, `features/stats/components/*chart*.tsx`, `payment-methods-breakdown.tsx`,
  `lib/store-theme.ts` + `store-settings` appearance section. _(H12 sheet-width fix moved to Phase 1.)_
- **Impact:** must-fix mobile seller workflows completable; dashboard text meets AA; charts have a
  name.
- **Risk:** **Medium–High.** `DataTable` responsive behaviour is the biggest new surface — behind the
  orders table first, Playwright 375px order-action spec green, then roll out. Seller-theme clamp is a
  **product decision** (may change saved colors) — flag before enforcing at save time; the auto
  text-color + outline ships regardless. `product-tile` stretched-link can break inner-button clicks —
  test tab-stop count + no navigation on action click.
- **Tests:** Playwright at 375px — approve a payment and advance fulfillment from the orders list with
  no horizontal scroll; every column value hidden at `<md` is present in the row disclosure and
  reachable by keyboard; sidebar current-page marked; axe contrast pass on overview / orders /
  products / settings; chart has an accessible name. RTL — `product-tile` N+1 tab stops, action
  handlers fire without navigating.

### Phase 6 — Storefront responsive / mobile (H9, H14, M4-remainder, M6, M8, M-COLL, L3, L4, L7, L8)
- **Scope:** `product-card.tsx` + `product-detail-view.tsx`: label the variant `<select>`,
  `type="button"`, `Image sizes`, ≥44px targets, focus rings. `storefront-header.tsx`: single row
  with an overflow affordance (or in-flow `<sm`), ≥40px targets, keep the store-link accessible name,
  make page `pt-*` track header height. `navbar.tsx`: fix "cart"→search label, raise `text-[10px]`,
  16px search input, focus rings, language-toggle target. `cart-page-client.tsx`: `−/+` names +
  ≥40px targets + announced quantity; `<main>` + `min-h-dvh` (from Phase 2); mixed-currency warning
  via live region. `collection-form.tsx`: fix the two-`min-w-[160px]` overflow. Verify no page-level
  horizontal scroll at 320/360/390/430 on landing / store home / product detail / cart / checkout.
  Search/discovery filters: labels + `role="status"` results count + non-color "no results".
- **Files:** `components/storefront/product-card.tsx`, `product-detail-view.tsx`,
  `app/[locale]/(storefront)/store/[slug]/page.tsx` (store-home also uses `pt-20` vs the wrappable
  header — R2-16), `product/[productId]/page.tsx`,
  `features/storefront/components/storefront-header.tsx`, `components/marketing/navbar.tsx`,
  `cart-page-client.tsx`, `features/collections/components/collection-form.tsx`, `app/[locale]/search/*`,
  discovery filter components.
- **Impact:** meets the higher storefront bar: readable text, real targets, visible focus, no
  accidental horizontal scroll, announced results.
- **Risk:** Low–Medium. `storefront-header.tsx` is a documented deliberate floating cluster — prefer
  single-row-with-overflow over a full redesign.
- **Tests:** Playwright at 320/375/430 — no `scrollWidth > innerWidth` on the 5 storefront routes;
  product-card/PDP variant select has a name; tab through the storefront header; cart `−/+` have
  names and announce; axe pass on landing / store home / product detail / cart.

### Phase 7 — Remaining route-specific + flip lint to error (M1-remainder, M2-remainder, L2, DnD test)
- **Scope:** Name the specific icon-only controls (`product-sheet`/`product-tile` `×`, any others
  jsx-a11y flags) — **no repo-wide `aria-hidden` codemod**. Marketing pages (`founder`, `enterprise`,
  `contact`, `blog`) heading/landmark pass. Onboarding wizard (`onboarding-page-client.tsx`) step
  semantics + per-step focus. `my-account`, admin `inquiries` detail. **Add a test for the existing
  DnD keyboard reorder path** (`sections-page-client.tsx` `KeyboardSensor` + `collection-card`
  `moveUp`) — the path exists; confirm it works and guard it. Breadcrumb `<ol>` + `aria-current`
  (L2). Then flip jsx-a11y `warn` → `error`; decide whether the Playwright a11y job becomes a
  blocking PR gate (recommended: yes, now that the baseline is clean).
- **Files:** marketing feature components, `onboarding-page-client.tsx`, `features/sections` /
  `features/collections` DnD components (test only), `features/my-account/*`, `features/admin/*`,
  `apps/web/eslint.config.mjs`, `.github/workflows/ci.yml`.
- **Impact:** long tail closed; CI blocks regressions.
- **Risk:** Low. DnD keyboard automation is historically flaky — keep that spec `workers: 1` and
  tolerant.
- **Tests:** Playwright — reorder a section with the keyboard; onboarding step focus; axe pass on
  marketing / onboarding / admin / my-account.

### Phase 8 — Verification + regression review
- **Scope:** full `typecheck` + web `lint` (now `error`) + `test` + Playwright a11y (now blocking) +
  `next build`. **Playwright 200%-text-zoom pass** (`emulateMedia` / a text-only zoom fixture) on
  checkout, orders, landing — no clipped labels on fixed-height controls (M-ZOOM). **Mandatory manual
  sign-off:** VoiceOver + NVDA on checkout (incl. the proof upload + the post-submit confirmation
  announcement), buyer login, seller orders; keyboard-only pass of the storefront buy flow and the
  seller approve-payment flow; 320 / 375 / 768 responsive pass **plus one landscape / short-height
  pass** on an auth screen. Post-implementation code review specifically for regressions introduced by
  the fixes: new focus traps (nested dialogs), `aria-describedby` duplication / `id` collisions from
  the Field wrapper, `Field.Error` missing `match` (renders nothing), duplicate sidebar landmark,
  doubled `<tbody>` rows breaking `tr:hover`/`aria-rowcount` in the `DataTable`, SSR-theme hydration
  mismatch, `sheet.tsx` width rework regressing desktop sheets, Server/Client boundary breaks.
- **Deliverable:** the before/after table filled with real axe/Playwright numbers.

---

## Summary table (to be completed after implementation)

| Area | Before | After | Remaining risk |
| --- | --- | --- | --- |
| Semantic HTML | Placeholder-only forms; `role="button"` div w/ nested buttons; nav in bare `<aside>`; `<main>` missing on some routes and doubled on dashboard | | Marketing pages not deeply audited |
| Keyboard navigation | Proof upload unreachable; 2 modals with no Escape/dismiss; option cards each a tab stop; table actions need horizontal scroll; nested-dialog focus untested | | Base UI `RadioGroup` select-on-focus; nested overlay restore |
| Screen readers | No error association/announcement; unlabeled fields + nameless settings toggles; icon-only nav w/o names; cart `−/+` nameless; charts unlabeled | | sonner assertive-region behaviour on older AT |
| Forms | No `<label>`s; no `aria-invalid`/`describedby`; no autocomplete/inputMode; weak focus ring; disabled-submit dead end | | `checkout-form` conditional branches need per-branch verification; test rewrite scope |
| Dialogs/overlays | `RestockInterestDialog` + `PaymentProofLightbox` hand-rolled, no trap/restore/Escape/name; `alert-dialog` Title not enforced | | Base UI version drift; portal + storefront scoped-theme vars |
| Seller dashboard mobile | products table `min-w-205` (820px); row actions off-screen; nameless toggles; `h-screen` sidebar; nav trigger scrolls away; no safe-area; 5 Sheet width overrides are dead classes (75vw); admin sidebar no nav landmark | | Dense variant matrix stays horizontal-scroll (acceptable); seller-theme clamp is a product decision; doubled `DataTable` rows |
| Storefront mobile | Checkout unusable by AT/keyboard; iOS zoom; floating header wrap/obscure; unlabeled variant select; cart `−/+`; auth card below the iOS fold | | Seller-theme colours can still under-contrast without the save-time clamp |
| Automated a11y testing | None; `vitest.setup.ts` missing `matchMedia`; no ESLint in web; no Playwright | | ESLint × TS7-native compatibility; Playwright CI time + flake (locale prefix, auth session, rate limiter) |

---

## Review rounds

### Round 1 — four adversarial subagents (accessibility, mobile/responsive, React/Next, QA/testing), each inspecting the code independently

**Meaningful changes made to the audit + plan (all verified against the code):**

1. **`@base-ui/react/field`, `/fieldset`, `/form`, `/dialog`, `/radio-group`, `/radio`, `/checkbox`,
   `/menu`, `/tabs`, `/select`, `/toast`, `/number-field`, `/combobox` all ship in the installed
   package.** The "Missing" list was rewritten to "missing shadcn wrappers only." S1/S2/S3 and
   Phase 1 changed from "build from scratch" to "wrap the primitive" — materially smaller and safer
   (Base UI's `Field.Control` composes refs and auto-wires `aria-describedby`/`aria-invalid`,
   avoiding the `{...register()}` spread-order / ref-merge footguns of a hand-rolled version).
2. **Landmark fix reversed direction.** `components/ui/sidebar.tsx:302` `SidebarInset` **is** a
   `<main>` (used for `/admin/*`) and `store-theme-frame.tsx:62` renders a `<main>` (all
   `/dashboard/[slug]/*`). Adding `<main>` in the shared `(dashboard)/layout.tsx` — as the first
   draft proposed — would create **two `main` landmarks + nested `<main>`**. Phase 2 now adds
   `id`/`tabIndex` to the **existing** mains and a new `<main>` only for `/account` + the storefront
   pages that lack one.
3. **Checkout submit gate is not a pure validation mirror.** It also carries `submitCheckout.isPending`
   (removing → **double order**) and `mixedCurrencies` (a hard server rule with no zod equivalent).
   C1 / Phase 3 now says "keep those, drop only per-field validation gating."
4. **Four Sheets overflow the phone**, not one. Added H12 for `product-sheet` (`w-105`) +
   `order-detail-sheet` / `customer-detail-sheet` / `shipping-page-client` (`w-[420px]`) — the
   order-detail sheet is the #1 seller mobile workflow. `min-w-205` on the products table (820px hard
   floor) added as the strongest H7 evidence. Nested `overflow-x-auto` (Card + component) means the
   `DataTable` fix must **replace**, not wrap.
5. **New findings promoted to High:** H14 cart `−/+` nameless buttons (was "verify" → confirmed
   missing); H15 `phone-input` national field nameless + hardcoded-English country label + no
   autocomplete; **`ToggleRow` settings switches have no accessible name** (folded into H1).
6. **Severity corrections:** `RestockInterestDialog` Critical → **High** (H13; secondary notify-me
   flow). `image-gallery` M14 downgraded (thumbnails already have `aria-current` + per-thumb alt +
   focus rings; only the "image X of N" live region + main-image alt index remain). `select.tsx` M13
   reworded (`{...props}` already forwards `aria-*`/`id`).
7. **WCAG citation fix:** C4/H13 are **not** 2.1.2 "No Keyboard Trap" (focus never enters) — they are
   2.1.1 (no dismiss), 1.1.1 (empty alt on sole content), 4.1.2 (no name).
8. **New mobile findings:** entire auth surface centers with `min-h-screen` (below the iOS fold,
   M-AUTH); no `env(safe-area-inset-bottom)` anywhere (M-SAFE — sticky sheet CTAs under the
   home-bar); `collection-form.tsx` two-`min-w-[160px]` overflow (M-COLL); checkout `grid-cols-2`
   grids do **not** overflow (`minmax(0,1fr)`) → removed from the reflow list (cramped, not broken).
9. **Storefront variant selection is a native `<Select>`**, not `SelectableCard` → H6 scoped to
   checkout only; the storefront flow gets the milder H9.
10. **Portal + scoped theme vars:** storefront `--store-*` vars live on a wrapper `<div>`, not
    `:root`; a Base UI `Dialog.Portal` reparents to `document.body` → a portaled storefront dialog
    renders unthemed. Phase 4 now fixes this **first**.
11. **"SSR the dashboard theme" is not L5-trivial** — `StoreThemeFrame` is client + auth-scoped;
    only the storefront theme is already SSR-able (public endpoint). Reworded L5.
12. **DnD keyboard path exists** (`sections-page-client.tsx` `KeyboardSensor` + `collection-card`
    `moveUp`) — Phase 7 changed from "build the fallback (High if missing)" to "test the existing
    path."
13. **Phase 0 substantially expanded:** `vitest.setup.ts` is missing `matchMedia` /
    `ResizeObserver` / `IntersectionObserver` (blocks every responsive RTL test); Next 16 removed
    `next lint` and its flat `core-web-vitals` ships **no jsx-a11y** (add it as a separate block);
    ESLint may not boot under the TS7-native-preview toolchain (spike first, fallback = standalone
    jsx-a11y or a pinned `typescript@5.x`); Playwright needs locale-prefixed URLs (no
    `middleware.ts`), a real API + seeded data + a shared better-auth `storageState` (rate limiter →
    `workers: 1`), `next build && next start` (not `next dev`), its **own** CI job with its own
    timeout (+6–12 min), and push-only/opt-in posture initially; **Lighthouse CI dropped** (not
    deferred).
14. **Test false-confidence traps documented:** jsdom `color-contrast` returns *incomplete* not
    *pass* (assert `incomplete` too); components render mobile+desktop in the DOM (landing = two
    `<h1>`; sidebar rendered twice) → landmark/heading-count + `landmark-unique`/`duplicate-id`
    checks are Playwright-only on **visible** nodes; "has an accessible name" must assert name
    **content**; live-region tests in jsdom are structure-only → NVDA/VoiceOver sign-off is
    mandatory for C1/C2/H2/M14.
15. **New regression guards added to phase test lists:** Base UI `RadioGroup` select-on-focus (must
    not mutate `form`); duplicate `<nav aria-label>` / `aria-current` from the twice-mounted sidebar;
    `DataTable` hidden-column recoverability (disclosure made **mandatory**, not optional);
    SSR-theme hydration; nested proof-lightbox-inside-order-sheet focus restore; a deterministic
    contrast-token unit test in Phase 1.
16. **Explicit test-rewrite scope:** `checkout-form.test.tsx` pins `submitButton.disabled` (`:211`,
    `:222`, `:266`, `:303`, `:705`) and `card.closest("button")` + `aria-pressed`
    (`:292`…`:805`), plus 15+ `getByPlaceholderText`; `checkout-page-client.test.tsx:131` waits on
    `confirmButton.disabled`. Phase 3/4 now name these rewrites and the "keep placeholders alongside
    labels" decision.
17. **Order-sheet footer confirm-bypass fix split out** of Phase 5 — it is a payment/fulfillment
    state-machine behaviour change (AGENTS.md documents it as a known quirk), not a11y/responsive
    work.

**Rejected / not adopted:**
- Converting `store-sidebar.tsx`'s raw locale-prefixed `<a>` to a next-intl `<Link>` — it is
  **correct** under `localePrefix:"always"`; a consistency nit, out of scope (L11).
- A repo-wide `aria-hidden` codemod for lucide icons — jsx-a11y covers icon-only controls; a blanket
  sweep risks silencing icons that are a control's only content. Kept as targeted per-button fixes.
- A general column-priority `DataTable` engine retrofitted onto all six tables — the brief allows
  labelled horizontal scroll for dense admin tables; kept the minimal shared helper + a row-action
  menu for orders only.
- Per-chart visually-hidden data tables as an AA requirement — `role="img"` + summary is the floor;
  the data table is optional.

### Round 2 — two adversarial subagents (a11y+React, mobile+QA) against the revised doc

**No new Critical.** Round 1's two riskiest pivots verified sound against the installed `@base-ui/react`
1.6.0 **compiled source**: (a) `Field.Control render={<input {...register()} />}` genuinely
composes refs (`useMergedRefsN` includes register's ref callback) and chains handlers
(`mergeProps.mergeEventHandlers`); (b) the landmark reversal is correct — `SidebarInset` **is** a
`<main>` (spreads `{...props}`, typed `ComponentProps<"main">`), `StoreThemeFrame` renders the other,
and `/account` is confirmed the only `(dashboard)` route with no `<main>`.

**Meaningful changes made (all verified against code):**

R2-1. **H12 was a wrong finding — rewritten.** A real `@tailwindcss/cli@4` build + `twMerge` check
shows `sheet.tsx:56`'s base `data-[side=right]:w-3/4` (selector specificity (0,2,0)) beats the
consumers' bare `w-105`/`w-[420px]`/`w-[288px]` (0,1,0), and `tailwind-merge` doesn't reconcile
across modifiers. So the five Sheets render at **75vw** — no phone clip; the intended widths and the
420px desktop cap are dead. Severity High→**Medium**; fix moved from Phase 5 (×4 local edits) to
**Phase 1** (`sheet.tsx` itself, + a `size` prop). Exec summary + mobile table + Round-1 note #4
corrected.

R2-2. **Phase 0 test infra was understated.** `scripts/ci/e2e.sh` starts **workers only**
(`node apps/workers/dist/main.js`), runs **no HTTP API server** (specs use
`Test.createTestingModule` + `app.init()`, no `.listen()`), and runs **no seed**. Reusable: the GH
`services:` Postgres/Redis, `load-e2e-env.sh`, the MinIO bring-up, `prisma migrate deploy` (~1/3).
The web-e2e job must **build** — web install/build, a real `node apps/api/dist/main.js` on :3000
(health-gate + teardown), `next build && next start` on :3001 (health-gate + teardown), and a
`seed:base` invocation. Phase 0 reworded from "reuse" to "reuse the DB/infra bring-up; add the two
servers + seed."

R2-3. **The seed cannot drive the Phase 4/5 seller specs.** The seed's two `PAYMENT_SUBMITTED`
orders (`apps/api/scripts/seed/fixtures.ts:397,803`) have no `payments` array, and the seed **never**
creates a `PaymentProof` (`grep` confirms). So `paidAmount === 0` → the Approve control is `disabled`
(`order-detail-sheet.tsx:243`, `orders-table.tsx:120`) → the seller-approve-payment spec can't run;
`PaymentHistoryList` gets `[]` → `PaymentProofLightbox` never opens → the nested-focus spec (C4) has
nothing. **Phase 0 must add a seed fixture:** a `PAYMENT_SUBMITTED` order + an `OrderPayment` + a
`PaymentProof` (`ProofStatus = PENDING_REVIEW`) + an `ensurePaymentProof` seed helper + a
MinIO-hosted proof image. (Seller session is fine — `SEED_PASSWORD = 'seedpassword123'`.)

R2-4. **Criticals had no PR-gated browser verification.** RTL/jsdom cannot see contrast / focus /
reflow / real announcement / portal-theme / nested focus, and Phase 0 kept Playwright "push-only /
opt-in" until Phase 7 — so C1/C2/C3/C4/H6/H7 would ship Phases 1–6 with their acceptance criteria
unchecked pre-merge. Worse, the `e2e` job is a **CD gate** (`.github/workflows/ci.yml:566-568`,
commit 9bdc4a3): a regressing fix merges green, fails the post-merge run, and **blocks all deploys**.
**Change:** PR-gate **two** targeted specs (≈2 min) — keyboard checkout (C1+C2) from Phase 3 onward,
seller approve-payment + proof lightbox (C4+H7) from Phase 5 onward — while the broader
axe/reflow/contrast matrix stays opt-in until Phase 7.

R2-5. **Phase 5's row-action menu has no primitive.** H7/S8 mandate a Base UI `Menu` row-action
menu; there is no `components/ui/menu.tsx`, nothing imports `@base-ui/react/menu`, and no phase
creates it. **Added S14 + a `components/ui/menu.tsx` wrapper to Phase 1.**

R2-6. **Admin sidebar has no nav landmark / `aria-current` (High).** `components/ui/sidebar.tsx`
`Sidebar` renders `<div data-slot="sidebar">` (no `role`), `SidebarMenu` renders `<ul>`;
`components/admin/app-sidebar.tsx` adds no `<nav>`. Every `/admin/*` route has nav as a bare
`<div><ul>`. H5/H8/Phase 2 only covered `store-sidebar.tsx` + `mobile-sidebar.tsx`. **Added H16;
Phase 2 now covers the admin sidebar too.** Also: Phase 2's `components/admin/app-sidebar.tsx
(id passthrough)` line is **removed** — `<SidebarInset id="main-content" tabIndex={-1}>` in
`admin/layout.tsx` needs zero plumbing.

R2-7. **Five forms fell between the phase file-lists (High).** Added explicitly to Phase 3:
`features/my-account/components/change-password-form.tsx` (seller `/account` — `<label>` with no
`htmlFor`, missing error nodes for `currentPassword`/`newPassword`, unannounced `isError`, no
`autoComplete`); `features/orders/components/register-payment-form.tsx` (amount/method unlabeled, **no
error rendering at all**, `disabled={… || !amount || !method}` dead-end — same C1 pattern);
`components/marketing/contact-form.tsx` (`formState.errors` **never destructured** → zod-invalid
submit is a silent no-op; success unmounts the form → focus lost; `text-red-400` ≈ 3:1). Added to
Phase 7: `features/coupons/components/redeem-coupon-section.tsx` (bare `<p text-red-500>`, `text-sm`,
`ring-emerald-100`, errors via toast only). **Reframe:** for `contact-form` / `register-payment-form`
the fix is to **add** error rendering, not "convert bare `<p>` to `Field.Error`."

R2-8. **Post-checkout confirmation focus loss (High).** `checkout-page-client.tsx` `if (order)`
branch (~`:78`): no `<main>`, `min-h-screen` centered (below the iOS fold), and `setOrder()` unmounts
the form subtree → focus drops to `<body>`, nothing announced. Same unmount-on-success focus-loss in
`set-password-form.tsx`, `contact-form.tsx`, and `RestockInterestDialog` (H13). **Generalized
convention added:** any success state that unmounts its form must move focus to the confirmation
heading and announce via `role="status"`. Assigned: `checkout-page-client.tsx` (all three render
branches get `<main>`; confirmation focus + announce) → Phase 3.

R2-9. **`Field.Error` without an explicit `match` is inert under RHF.** `field/error/FieldError.js`
renders off Base UI's **own** `useFormContext().errors[name]`, not RHF's — with no Base UI `<Form>`
ancestor it never shows. **Rule added to S1 / Phase 1:** every migrated field passes
`match={!!errors.x}` (a boolean expression, not `match` bare).

R2-10. **RadioGroup select-on-focus resolves in the plan's favour.** `radio/root/RadioRoot.js`
`onFocus` bails unless `groupContext.touched`, which `radio-group/RadioGroup.js` sets **only** on
`Arrow*` keys. Tab-into an unselected group does **not** mutate `form`. H6's "New risk" downgraded
from "must confirm" to "confirmed safe; keep the regression test." Also: `value=""` is safe as
"unselected" (no `RadioCard` carries it), and per-`Field.Root` `LabelableProvider` means the
payment-method/payment-type id-collision is auto-handled — the audit's worry there was unfounded.

R2-11. **"Keep placeholders alongside labels" flipped to the non-default.** Label + identical-string
placeholder double-announces on VoiceOver/NVDA. Phase 3 now **defaults** to migrating the ~15
`getByPlaceholderText` test files to `getByLabelText` (Testing Library's preferred query) and
dropping label-echo placeholders (or making them real format hints, `you@example.com`).

R2-12. **New: WCAG 1.4.4 Resize Text (200% text-only zoom)** — never mentioned. Distinct from 1.4.10;
fixed-height controls clip descenders/labels at 200% text zoom: `order-detail-sheet` `h-11` action
buttons, `orders-table.tsx:130` `h-8 text-xs` actions, fixed-width landing CTAs
(`about-section.tsx:102,201` `w-[131px]`/`w-[267px]`, `discover-section.tsx:58` `w-[186px]`). **Added
M-ZOOM; Phase 8 gets a Playwright 200%-text-zoom pass, Phase 5/6 spot-checks.**

R2-13. **New (Medium): mobile dashboard nav trigger scrolls away.** `store-theme-frame.tsx:52`
top-bar row is a plain flex child (not sticky); `MobileSidebar` (`lg:hidden`) scrolls off with the
page → after scrolling a long orders/products table the seller has no persistent way to open nav.
**Fix:** `sticky top-0` on the mobile top bar (with safe-area). Added to Phase 5.

R2-14. **M-AUTH extended for landscape.** `min-h-dvh` alone doesn't fix short/landscape viewports —
`flex items-center justify-center` at ~375px viewport *height* clips the card's **top** above the
scroll origin. Fix: `justify-start` + vertical padding (or `min-h-dvh sm:justify-center`).

R2-15. **New (plan under-spec): the `DataTable` row disclosure needs a concrete shape.** `<details>`
cannot be a `<tr>` child (foster-parented). Phase 5 now specifies: a dedicated **leading `<td>`**
per row with a `<button aria-expanded aria-controls>` that toggles a single sibling
`<tr class="md:hidden" role="row">` holding a `<td colSpan={N}>` with the hidden-column values;
accept the doubled `<tbody>` row count and fix `tr:hover` / `last:border-0` / any `aria-rowcount`
accordingly; the row-action `Menu` lives in a **separate** sticky trailing `<td>`, not the same cell.
The products table's "or Sheet" option = **building a new read-only products-row detail Sheet** (not
`product-sheet`) — added to Phase 5's file list if that route is taken.

R2-16. **Phase 6 file list:** added `app/[locale]/(storefront)/store/[slug]/page.tsx` — store-home
also uses `pt-20` against the wrappable floating header (M6), not just the product page.

R2-17. **280px (Galaxy Fold) is deliberately out of scope** — below the WCAG 1.4.10 320px floor.
Responsive test widths stay 320 / 360 / 390 / 430 / 768.

**Non-findings (checked, plan unchanged):** `SidebarInset` `{...props}` forwarding; structure-only
`(onboarding)/layout.tsx` is safe; `change-password-form.tsx` error hex `#b24368` ≈ 5.4:1 **passes**
(do not re-flag); `RadioGroup` `Controller` + `value=""` round-trip is safe.

### Round 3 — one adversarial reviewer, targeted verification of the Round 2 revisions

**Outcome: no new Critical/High accessibility issue on any primary flow.** The Round 2 revisions to
H12 (sheet specificity), the `DataTable` doubled-row disclosure, the PR-gate split, and H16 (admin
sidebar) were independently re-verified against the code and are **sound with no regressions**. One
material plan error and three minor gaps were found and are now fixed in the text above:

R3-1. **Material — the R2-3 seed-fixture spec was wrong against the schema.** There is **no
`PaymentProof` model / `ProofStatus` enum** (`packages/db/prisma/schema.prisma` — CLAUDE.md is
stale); buyer proof is `OrderPayment.{source: PaymentSource, reviewStatus: PaymentReviewStatus,
imageUrl}`. `ensureOrderPayment` (`helpers.ts:481`) already exists and takes `imageUrl`; no
`ensurePaymentProof` is needed. **And** `countsTowardPaid` (`apps/api/src/common/payment-summary.ts:27`)
= `source === 'SELLER_RECORDED' || reviewStatus === 'APPROVED'`, so a `BUYER_SUBMITTED` +
`PENDING_REVIEW` payment leaves `paidAmount === 0` and the **Approve** control stays `disabled` — the
fixture must **also** carry a `SELLER_RECORDED`/`APPROVED` payment for the approve-path spec, plus
`imageUrl` for the lightbox spec. Phase 0's seed bullet + file list corrected.

R3-2. **Minor — H12 lists 5 of 7 `SheetContent` consumers.** Added `components/ui/sidebar.tsx:184`
(admin mobile nav, same dead-class trap, currently 75vw) and
`store-settings/components/delivery-section.tsx:298` (no width class) to Phase 1's re-check list;
noted that the `sheet.tsx` replacement rules must stay `data-[side=left/right]:`-scoped so bottom/top
sheets are untouched.

R3-3. **Minor — Phase 0 CI.** Named the hand-maintained `ci-success` "Check all required jobs"
`*_RESULT`/`*_CHANGED` env block (~`ci.yml:678`) as an explicit edit when adding the PR-gated
`web-e2e` job (the `e2e` job's CD-gate wiring: `e2e ∈ ci-success.needs :668` → required check →
`cd.yml` `workflow_run` gate).

R3-4. **Minor — terminal states.** `app/[locale]/not-found.tsx` + `error.tsx` had no coverage:
no `<main>`, `min-h-screen` centered, `not-found` link `text-emerald-600` on `bg-gray-50` ≈ 3.5:1.
Added to H5 (+ H4 for the link) and `components/shared/error-state.tsx` → `role="alert"` to Phase 1.

**Non-findings (Round 3):** `order-status-badge.tsx` renders a text label, not colour-only (fine);
`checkout-summary.tsx` `text-gray-500` pending amount ≈ 3.9:1 is the same token as H4's existing
`text-gray-500` sweep (not new); `redeem-coupon-section.tsx` already added to Phase 7 in Round 2; a
lighter single-`<td>` disclosure alternative exists but is a design preference, not a plan error.

### Stop condition met
A full review round (Round 3) produced **no new Critical or High findings** and only plan-precision
corrections (all applied). Per the iterative protocol, review stops here. Total: **3 rounds** (Round
1: 4 subagents; Round 2: 2 subagents; Round 3: 1 subagent).
