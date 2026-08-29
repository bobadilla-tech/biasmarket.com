# Issue batch #138 / #137 / #136 / #135 / #120 / #100 / #99 — verification & hardening plan

Written before execution, at the user's explicit request (deviates from this
directory's normal "record after the work lands" convention — see
`docs/plans/README.md`). Revised twice after subagent review rounds (fact-check
against `main` at `d4fe64c`, plus a senior-review critique). Every `file:line`
below was verified against `main` at `d4fe64c`.

## Why this plan exists

Seven issues were marked "ready to check". A live-code audit found that **all
seven already have substantial implementations merged** — schema, API, and most
of the UI. The reviewer comments on #120 / #100 / #99 ("no se visualiza ningún
cambio") have **two possible causes that must be verified separately**:

- **(a) Stale production** — the blue/green prod containers are not yet running
  `main` at/after `d4fe64c`.
- **(b) Demo store not configured** — the feature is deployed but the demo store
  (`ki`, `demo-kpop-corner`) has no partial-eligible payment method / no
  couriers / no enabled `COURIER` `DeliveryMethodConfig`, so the UI correctly
  renders nothing new.

These are different problems with different fixes (redeploy vs. seed). **The
plan must not attribute anything to "stale prod" without the deploy-SHA check in
"Cross-cutting work" below.** If prod is at/past `d4fe64c` and the reviewer
still sees nothing, the "stale prod" hypothesis is dead and those become live
bugs to chase.

This plan is therefore:

1. Verify each issue against its acceptance criteria on current `main`.
2. Close the concrete gaps the audit found (per issue below).
3. Add / extend the regression test coverage — most of these areas have
   **none**.
4. Seed demo data + confirm the production deploy.

Nothing in "what already works" below should be rebuilt.

---

## Audit result summary

| #   | Feature                       | Impl status on `main`                                                                                                                                                                                                                                                                                                                                                                   | Real gaps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 138 | Clickable store logo          | Home + product-detail wrap logo in `<Link>` (`page.tsx:198,230`; product `page.tsx:69`)                                                                                                                                                                                                                                                                                                 | **Cart + checkout have no logo** (`cart-page-client.tsx:155`, `checkout-page-client.tsx:279` = text link only); layout chrome is a `fixed` cart/account cluster (`layout.tsx:34`); **3** duplicated header blocks                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 137 | Social icons not text         | `SocialIcon` SVG glyphs, icon-only anchors on home only (`social-icon.tsx`, `page.tsx:82`)                                                                                                                                                                                                                                                                                              | Home page only; **anchor has no `aria-label`** (`page.tsx:82`); model has 4 platforms; twitter label is `"X"`; zero tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 136 | Slow cart counter             | `da92c51` added toast + `cart-badge-pulse`; cart is 100% localStorage, `saveCart` fires a synchronous `CustomEvent` (`lib/cart.ts:32`); no backend call in add path                                                                                                                                                                                                                     | `CartLink` SSR-inits to `0`, count set in a post-mount effect (`cart-link.tsx:11,23`) → badge pops in on **hard load / new tab** (not every client nav — `CartLink` stays mounted in the layout); `use-cart-stock.ts` fetches the whole `findPublic` payload, no `staleTime` (`use-cart-stock.ts:49`) — **cart page only**, not checkout; no cross-tab `storage` listener; zero tests                                                                                                                                                                                                                                                                 |
| 135 | Product image gallery         | `52eab57` fixed the out-of-bounds crash (`safeCurrent` clamp + reset effect)                                                                                                                                                                                                                                                                                                            | `ProductVariant.imageOverride` is one `String?` (`schema.prisma:152`), issue wants many; active-thumb border hardcoded `border-[#2d1649]` (`image-gallery.tsx:87`); arrows have no `aria-label`, no `aria-current` on active thumb, focus ring swallowed by `border-transparent`; `key={img}` collides on dup URL; zero gallery tests                                                                                                                                                                                                                                                                                                                 |
| 120 | Full / partial payment        | Full stack — `depositPercent` column + `@Min(1)@Max(100)` DTO (`upsert-payment-method.dto.ts:43`), seller UI (`payments-section.tsx:514`), public endpoint exposes `depositPercent` (confirmed in `openapi.json` + generated client), checkout selector gated on `partialAvailable` (`checkout-form.tsx:331`), server re-prices in `Prisma.Decimal` (`create-order.usecase.ts:408-433`) | Selector correctly hidden unless a method has `depositPercent < 100` (demo not configured); `checkout-summary.tsx:27` does float `total * (depositPercent/100)`; **deposit base includes delivery cost** (`create-order.usecase.ts:400,429`) — product decision, not obviously intended; no tests for visibility/math/PARTIAL server path                                                                                                                                                                                                                                                                                                             |
| 100 | Prefill logged-in buyer       | Effect fills name/phone/email when empty (`checkout-form.tsx:397-410`); regression test **already exists** (`checkout-form.test.tsx:568`)                                                                                                                                                                                                                                               | `customerName`/`customerEmail` are unconditionally-rendered uncontrolled `register()` inputs (`checkout-form.tsx:967,987`) — the not-yet-mounted `setValue` hazard the shipping effect warns about does **not** apply here; `Controller` conversion would be a consistency refactor, **not a bugfix**                                                                                                                                                                                                                                                                                                                                                 |
| 99  | Courier agency vs home + Peru | Full stack — `Courier`/`CourierConfig` + `CourierModalityType` (`schema.prisma:457-490`), `couriers` CRUD + `bulk-save` + `PublicCouriers` all behind `assertOwnership`, `CouriersSection` wired (`settings-page-client.tsx:88`), checkout modality + Peru fields + per-modality `.refine`s, `create-order` validates + `SELECT … FOR UPDATE` + price snapshot                          | **`getShippingAddress` returns `null` unless `line1 && city` are strings** (`order-format.ts:90-106`) → **AGENCY orders show nothing** in the seller sheet, not "recipientName · phone"; sheet renders none of courierName/modality/surnames/document/dpto-prov-dist/agencyName (`order-detail-sheet.tsx:149-180`); `Order.courierName`/`courierModality` **columns are not in `OrderResponseDto`** (`order-response.dto.ts:205` only exposes `deliveryDetails`); `deliveryDetails.courierName` is written **only on the CourierConfig-found path** (`create-order.usecase.ts:456-467`), absent on the legacy fallback; `documentType` cast `as "DNI" |

---

## Per-issue scope

### #138 — Store logo clickable from every storefront page

**What already works (do not touch):**

- `page.tsx:198,230` and product `page.tsx:69` wrap `<StoreLogo>` + name in
  `<Link href={`/store/${slug}`}>`.
- `layout.tsx:12` already fetches `GET /api/stores/:slug/public` (uses only
  `themeConfig`). `layout.tsx:34` renders a `position: fixed top-4 right-4`
  cluster of `<CartLink>` + `<AccountNavLink>` — it **floats, does not affect
  layout flow**.
- `StorePublicDetailResponseDto` includes `name`, `logoUrl`, and the 4 social
  URLs (`store-response.dto.ts:28,37-46,347`) — no API change needed.

**Gap:** `cart-page-client.tsx:155` and `checkout-page-client.tsx:279` render
only a text "← back" link — no logo.

**⚠️ Route blast radius — this is an Open Decision, not an implementation
detail.** `(storefront)/store/[slug]/layout.tsx` wraps **every** storefront
subroute, including `/account`, `/account/login`, `/account/forgot-password`,
`/account/confirm`, `/account/orders/[orderId]` — all deliberately full-viewport
centered cards (`min-h-screen flex items-center justify-center`, e.g.
`account-page-client.tsx:20`, `login-page-client.tsx:10`). Converting the
floating chrome into an in-flow `<header>` bar pushes a logo band above ~6
routes and visibly breaks those centered layouts. Pick one:

- **(a)** Keep the header as a `fixed`/overlay cluster (add the logo to the left
  of the existing cluster, still `position: fixed`) — lowest risk, no
  layout-flow change, works on every inherited route. **Recommended default.**
- **(b)** Add a nested `(shop)/layout.tsx` so only shop routes get the in-flow
  header and account routes opt out.
- **(c)** Accept the header everywhere and redesign the account pages.

**Change (assuming (a)):**

1. New `features/storefront/components/storefront-header.tsx` — **client
   component** (`"use client"`; it composes `CartLink`, a client component).
   Plain serializable props only: `slug`, `name`, `logoUrl`, `instagramUrl`,
   `facebookUrl`, `tiktokUrl`, `twitterUrl`. **No fetching, no `apiClient`
   import.** Renders: logo + name as a `Link` to `/store/:slug`, the social
   cluster (see #137), `CartLink`, `AccountNavLink`.
2. `layout.tsx` — rename `getStoreThemeConfig` → `getStorePublic`, widen its
   return past `themeConfig` (name/logoUrl/`*Url`), pass those into
   `<StorefrontHeader>` rendered **inside** the layout (a layout cannot inject
   props into `children`). Next.js dedupes the two identical `fetch` calls
   (layout + `page.tsx` `getStore()`) within one render pass **even with
   `cache: "no-store"`** — verify against `node_modules/next/dist/docs/` per
   `apps/web/AGENTS.md` and note it in the PR so "no extra fetch" is justified,
   not assumed.
3. Delete the duplicated `<header>` blocks: `page.tsx:196-209` (empty-state
   branch), `page.tsx:228-241` (normal branch), product `page.tsx:67-81` — **3
   deletions**. Keep the small "← back" text links on cart / checkout / product
   (different affordance). Note the width unification: `page.tsx` header used
   `max-w-5xl`, product used `max-w-3xl` — the shared header picks one (5xl) and
   the product page's header band becomes wider than its `max-w-3xl` content;
   acceptable, call it out.

**Tests:**

- `storefront-header.test.tsx` — logo and store name each render an anchor whose
  `href` resolves to `/store/:slug`; renders with and without `logoUrl`; social
  cluster absent when no social URLs.
- Update `page.tsx` / product-page snapshot tests that assert the old markup.

---

### #137 — Social links as official icons, not text buttons

**What already works (do not touch):**

- `social-icon.tsx` — inline SVG glyphs for `instagram`/`facebook`/`tiktok`/
  `twitter`; returns `null` for unknown; nested `sr-only` label (twitter's is
  `"X"`).
- `StoreSocialLinks` in `page.tsx:82` — filters to configured URLs, icon-only
  anchors, `target="_blank" rel="noopener noreferrer"`.
- Audit found **no remaining plain-text social button** in storefront (only
  `admin-stores-table.tsx`, internal admin — out of scope).

**Gaps:**

1. Icons only on home. → **Resolved by #138**: move `StoreSocialLinks` into
   `storefront-header.tsx`.
2. **Accessibility:** `SocialIcon` returns a bare fragment (no host element);
   the wrapping anchor at `page.tsx:82` has **no `aria-label`**. Add
   `aria-label={platform label}` to the anchor (and a "opens in new tab" hint or
   `aria-label` suffix). Once the anchor is labelled, decide whether the nested
   `sr-only` span is now redundant.
3. `Store` model has only 4 URL columns. YouTube / WhatsApp-as-social = **out of
   scope**, filed as follow-up (`youtubeUrl` column + reuse
   `store.whatsappNumber`, plus 2 glyphs).

**Change:** relocate `StoreSocialLinks` into the shared header; add anchor
`aria-label`.

**Tests:**

- `social-icon.test.tsx` — render each platform **through an `<a>` wrapper**
  (can't assert an accessible name on a bare fragment); assert an `<svg>` is
  present and the anchor's accessible name matches the label map; unknown
  platform → nothing renders.
- `storefront-header.test.tsx` — one `<a target="_blank">` per configured URL,
  each with an `aria-label`.

---

### #136 — Cart counter feels slow / no feedback on add-to-cart

**What already works (do not touch):**

- Cart is entirely `localStorage` (`lib/cart.ts`). `addToCart` → `saveCart` →
  **synchronous** `window` `CustomEvent(CART_UPDATED_EVENT)` (`lib/cart.ts:32`).
  No backend call in the add path — the "recalculating the whole cart on every
  request" the issue hypothesises does not exist.
- `cart-link.tsx:13-30` recomputes the badge on `CART_UPDATED_EVENT`
  (slug-scoped) and window `focus`.
- `product-card.tsx` / `product-detail-view.tsx` — `handleAddToCart` fires a
  `sonner` toast + 1.2 s button state; badge has a `cart-badge-pulse` keyed on
  `count` (`da92c51`).

**Residual gaps:**

1. `cart-link.tsx:11` SSR-inits to `useState(0)`; the real count lands in a
   post-mount `useEffect`. `CartLink` lives in the **persistent layout** and
   stays mounted across cart→checkout→product client navs, so this only pops in
   on a **hard load / new tab / first entry** — not every navigation. **Fix:
   `useSyncExternalStore`**, not a lazy initializer:
   ```ts
   const count = useSyncExternalStore(
     subscribe, // wires CART_UPDATED_EVENT + focus, slug-scoped
     () => countFromCart(slug), // client snapshot
     () => 0, // server snapshot — avoids hydration mismatch
   );
   ```
   A lazy `useState(() => countFromCart(slug))` would re-run client-side during
   hydration with `window` present, return `N`, and trigger a **hydration
   mismatch warning + double render**. `useSyncExternalStore` gives server
   snapshot `0`, client snapshot real, and folds the event wiring into
   `subscribe`. Implementation notes: React is `19.2.4` (3-arg form is stable);
   `subscribe` must be module-level or `useCallback(…, [slug])` so React does
   not re-subscribe every render; `getSnapshot` returning a freshly-computed
   **number** is safe (primitive `Object.is`, no loop). "Accept the one-time
   paint and do nothing" is a defensible non-fix given `CartLink` is in the
   persistent layout — but `useSyncExternalStore` is the idiomatic choice, not
   over-engineering.
2. `use-cart-stock.ts:49` calls `apiClient.stores.findPublic(slug)` — the
   **entire** public store payload — on the **cart page only**
   (`cart-page-client.tsx:113`; checkout uses `useDeliveryOptions`, a different
   query). No `staleTime`. **Fix:** add `staleTime: 30_000` + `gcTime`. A slim
   `GET /stores/:slug/public/stock` endpoint is a noted follow-up, not this PR.
3. **Scope decision:** `cart-page-client.tsx` and `checkout-page-client.tsx:48`
   both do `useState<CartItem[]>([])` + `useEffect(setItems(getCart(slug)))`, so
   the whole line-item list flashes empty→full on entry. Either fold into #136
   (same `useSyncExternalStore` treatment) or **explicitly scope it out** in the
   plan. Recommended: scope out (bigger change, lower value), note as follow-up.
4. **Known limitation:** `CART_UPDATED_EVENT` is a same-document `CustomEvent`;
   there is no `window` `storage`-event listener, so a second tab never updates
   its badge. One-line follow-up note.

**Tests:**

- `cart-link.test.tsx` — badge shows the summed quantity **on the first
  synchronous render** (assert with no `await`/`act` tick — that is what pins
  the no-flash behavior; a post-effect assertion passes today and proves
  nothing); updates on a same-slug `CART_UPDATED_EVENT`; ignores a
  different-slug event; renders `99+` past 99; no badge at 0.
- `use-cart-stock.test.ts` — `computeStockMaps` maps availability (`Infinity`
  for null stock, `stock - reserved` otherwise), skips discontinued products.
  (Pure function — a real unit test.)

---

### #135 — Product gallery: general images + selected-variant images

**What already works (do not touch):**

- `image-gallery.tsx` (`52eab57`) — `safeCurrent = min(current, len-1)` clamp,
  `useEffect` resets `current` to 0 when the image set changes (keyed on
  `JSON.stringify(images)` — a later commit changed this from `.join(",")`),
  arrow nav wraps. Fixed the reported crash / blank main image after switching
  variant.
- `product-detail-view.tsx:57-66` `galleryImages` merges the selected variant's
  `imageOverride` (prepended, de-duplicated) with `product.images`.

**Gaps:**

1. **Data-model limitation:** `ProductVariant.imageOverride` is a single
   `String?` (`schema.prisma:152`). The issue's "expected behaviour" describes
   _multiple_ variant-specific images. **Open decision:**
   - **(A) Accept single-image-per-variant.** The merge is already correct; this
     PR is tests + polish only. **Recommended default.**
   - **(B) True multi-image per variant.** Separate milestone:
     `ProductVariant.
     images String[] @default([])` + migration;
     multi-upload per variant in `product-sheet.tsx`; `variantImages` map →
     `File[]` per key in `use-create-product`/`use-update-product`;
     `Create/UpdateVariantDto` + `products.service` upload loop;
     `ProductVariantResponseDto.images`; storefront
     `galleryImages = dedupe([...product.images,
     ...selectedVariant.images])`;
     keep `imageOverride` as a computed `images[0]` alias; **regenerate
     OpenAPI + Orval**.
2. Active thumb border hardcoded `border-[#2d1649]` →
   `border-[var(--store-primary)]`.
3. `ImageGallery` trusts the caller to de-dupe; `key={img}` collides on a
   repeated URL. Add an internal `Array.from(new Set(images))` guard — this
   **preserves insertion order** (the caller at `product-detail-view.tsx:57`
   already dedupes the override); the only behavioral change is collapsing a
   genuinely-repeated URL to one thumb, which is the intent.
4. **Accessibility (user explicitly asked):** prev/next buttons
   (`image-gallery.tsx:52,63`) have no `aria-label`; active thumb (`:86`) has no
   `aria-current`; `border-2 border-transparent` swallows the focus ring; main
   image `alt` is just the product name. Add: `aria-label` on arrows,
   `aria-current="true"` on the active thumb, a visible `:focus-visible` ring,
   indexed `alt` on thumbnails (already `${alt} ${index+1}`), optional arrow-key
   handling on the container.

**Change (option A scope):** items 2 + 3 + 4 + tests.

**Tests:**

- `image-gallery.test.tsx` — thumb click sets the main image; shrinking `images`
  clamps instead of blanking; changing the array resets to index 0; arrows wrap
  at both ends. **PR A** commits these (they pass against current code). **PR
  D** edits this same file to add the fix-companion assertions: `aria-current`
  on the active thumb, accessible names on the arrows, one thumb per duplicate
  URL, theme-var border class.
- `product-detail-view.test.tsx` — `galleryImages` = general images when the
  variant has no override; override is first and not duplicated when also in
  `product.images`; switching the variant `<select>` swaps the leading image.

---

### #120 — Checkout "pago total / parcial" selector with configurable %

**What already works (do not touch):**

- `PaymentMethodConfig.depositPercent Int @default(100)` (migration
  `20260820161500_simplify_deposit_percent`).
- Seller UI: `payments-section.tsx:514` per-method deposit-% input +
  `useSaveDepositPercent`; `UpsertPaymentMethodDto.depositPercent` is
  `@IsOptional() @IsInt() @Min(1) @Max(100)`
  (`upsert-payment-method.dto.ts:43`).
- Public endpoint exposes `depositPercent`
  (`PublicPaymentConfigController.
  findEnabled` →
  `PaymentMethodConfigResponseDto`; present in committed `openapi.json` +
  `packages/types/generated/api.schemas.ts`).
- Checkout FE: `checkout-form.tsx:331` `partialAvailable` =
  `paymentMethod !==
  "CASH" && config present && depositPercent < 100`;
  renders the FULL/PARTIAL `SelectableCard` pair only then (`:898`); resets to
  FULL when it becomes unavailable (`:337`). `CheckoutSummary` shows total /
  pay-now / pending.
- Checkout BE: `create-order.usecase.ts:419-433` — rejects PARTIAL for CASH /
  disabled / `depositPercent >= 100` with `BadRequestException`;
  `requiredAmount
  = finalAmount.times(pct).div(100)` then
  `new Prisma.Decimal(x.toFixed(2))`.

**Gaps:**

1. Reviewer saw "no changes" because the demo store has every method at
   `depositPercent = 100` → selector correctly hidden. **Not a bug.**
   Mitigations: (a) seed one demo method at 20 %; (b) one-line helper text in
   `payments-section.tsx` — "menor a 100 habilita el pago parcial en el
   checkout".
2. **`checkout-summary.tsx:27` float math** `total * (depositPercent/100)`. The
   server does `finalAmount.times(pct).div(100)` (multiply then divide) in
   `Prisma.Decimal`. **Fix:** compute `payNow` as `(total * pct) / 100` then
   `.toFixed(2)` — mirror the server's operator order. **Document the
   residual:** `cartTotal(items)` is float summation over client-cached prices,
   so the summary can still differ from the server by a cent if a price changed
   post-add; this is a pre-submit **estimate**, and the confirmation screen
   already shows the authoritative `requiredAmount`.
3. **Open decision:** the deposit base **includes delivery cost**
   (`create-order.usecase.ts:400` `finalAmount = items + deliveryCost`, then
   `:429` `× pct / 100`). A 20 % deposit thus also collects 20 % of shipping.
   Many stores expect shipping paid in full up front or excluded from the
   deposit base. Confirm with the user before treating this as settled.
4. No test for selector visibility / summary math / the PARTIAL server path.

**Tests** — all of the following **assume the current include-delivery-cost
deposit base** (Open decision 4); if the user flips it, revise the "`total`
includes courier price" / "`deliveryCost` added before the percentage"
assertions accordingly. Author these **after** decision 4 resolves.

- **e2e** `test/orders.e2e-spec.ts` (extend — it already POSTs `/checkout` and
  handles `PARTIALLY_PAID`): eligible PARTIAL → `requiredAmount` ==
  `round(total × pct/100, 2)` and `total` includes courier price; CASH + PARTIAL
  → 400; `depositPercent = 100` + PARTIAL → 400; FULL unaffected; PARTIAL +
  proof upload → the `OrderPayment` row `amount == requiredAmount` (the deposit,
  `create-order.usecase.ts:489-496`) and the manual-method `proof required` gate
  (`checkout.schema.ts`) still fires. **Not the unit spec** —
  `create-order.usecase.spec.ts`'s `FakeDecimal` has no `.toFixed` and
  `Prisma.Decimal` isn't resolvable in stubbed-Prisma unit tests, so any
  `paymentType: 'PARTIAL'` path throws.
- `checkout-summary.test.tsx` — FULL shows one total row; PARTIAL (`pct < 100`)
  shows total / pay-now / pending; pay-now == `round((total × pct)/100, 2)`;
  `deliveryCost` added before the percentage. (PR A commits the current-float-
  math baseline assertion; PR E edits this same file to the post-fix
  operator-order assertion.)
- `checkout-form.test.tsx` (extend — has `useDeliveryOptions` mock scaffolding):
  the `useDeliveryOptions` mock must return
  `paymentMethods: [{ method, details,
  depositPercent }]`; selector absent for
  CASH; absent at `depositPercent =
  100`; present + switchable at
  `depositPercent = 20`.

---

### #100 — Prefill email / name / phone for a logged-in buyer

**What already works (do not touch):**

- `checkout-form.tsx:397-410` — effect fills `customerName`/`customerPhone`/
  `customerEmail` from `useCustomerProfile(slug).data.customer` **only when each
  field is empty**; fields stay editable; guests get a failed query
  (`retry: false`) → no change. Shipped per the `2026-08-20` plan.
- **A regression test already exists:** `checkout-form.test.tsx:568` ("prefills
  name/phone/email from a logged-in buyer's saved profile, editable afterwards")
  asserts prefilled values and editability.

**Gaps:**

1. `customerName`/`customerEmail` are uncontrolled `{...form.register(...)}`
   inputs (`checkout-form.tsx:967,987`) that are **unconditionally rendered** —
   always mounted on first paint. The "`setValue` on a not-yet-mounted field
   only updates state, not the DOM" hazard the shipping-address effect warns
   about (`:354-362`, gated on `deliveryMethodType === "COURIER"`) **does not
   apply here**. The prefill works today. Converting the three contact inputs to
   `Controller` (matching `customerPhone`) is a **consistency refactor, label it
   as such** — not a bugfix. It also makes every keystroke re-render this
   already-`watch`-heavy component (negligible). **Recommended: skip the
   refactor**, just extend the test.
2. The existing test covers the happy path only.

**Tests:**

- `checkout-form.test.tsx` (extend) — add the guest case: `useCustomerProfile`
  mock returns an error / no `customer` → the three inputs stay empty. Keep the
  existing prefill+editable assertion.

---

### #99 — Couriers: agency vs. home, per-modality price, Peru fields

**What already works (do not touch):**

- Schema: `Courier`, `CourierConfig`, `enum CourierModalityType {AGENCY, HOME}`
  (`schema.prisma:457-490`; migration `20260821042345_add_couriers`);
  `Order.courierName` + `Order.courierModality` columns (`:283-287`).
- API: `modules/couriers` — `GET/POST/PATCH/DELETE /stores/:storeId/couriers`
  - `POST .../bulk-save`; `PublicCouriersController`
    `GET /stores/:slug/public/couriers`. Every service method calls
    `assertOwnership`.
- Seller UI: `features/couriers/components/couriers-section.tsx`, wired at
  `settings-page-client.tsx:88`.
- Checkout FE: courier `<select>` → modality `SelectableCard`s limited to the
  courier's configured modalities → Peru common fields (surnames,
  DNI/CE/RUC/PASSPORT + number, department/province/district) → AGENCY adds
  agency name, HOME adds line1/city/reference. `checkout.schema.ts` per-modality
  `.refine`s. Delivery cost from `courier.modalities[].price`.
- Checkout BE: `create-order.usecase.ts:98-130` validates courierName + modality
  - modality-specific shipping fields; `:243-253` `SELECT … FOR UPDATE` on the
    joined `CourierConfig`; `:390-394` cost from the locked config (fallback to
    legacy `DeliveryMethodConfig.details.estimatedCost`); `:456-472` snapshots
    `courierName`/`courierModality` into `Order` and (on the CourierConfig-found
    path) into `Order.deliveryDetails`. Note: only `shippingAddress` is
    DTO-gated on COURIER (`create-order.dto.ts:143-147`); `courierName`/
    `courierModality` are `@IsOptional()` at the DTO and enforced in the use
    case.
- **The `bulkSave` vs. `create-order` `FOR UPDATE` "race" is not a real
  problem** — state this in the plan rather than leaving it as an unexamined
  worry: `bulkSave` runs in `$transaction`; `Order` snapshots courier data as
  **strings, not FKs**; `CourierConfig` rows are delete+recreated inside the
  bulk-save txn (ids churn). An in-flight order either locks the pre-commit rows
  or, post-commit, cleanly sees new rows or a transient
  `400 "no está
  disponible"` (fail-safe). No torn read, no dangling FK.

**Gaps (all real, all in this PR):**

1. **`getShippingAddress` returns `null` for every AGENCY order.**
   `order-format.ts:90-106` bails unless **all four** of `recipientName`,
   `phone`, `line1`, `city` are strings; the checkout form only sets `line1`/
   `city` for `courierModality === "HOME"` (`checkout-form.tsx:834` wraps both
   inputs). `recipientName`/`phone` are always sent, so AGENCY orders miss only
   `line1`/`city` — but that is enough to make the guard return `null` and the
   seller sheet shows **nothing** for AGENCY, not "recipientName · phone". **Fix
   must relax that guard** (return an object whenever any shipping field is
   present), not just "extend the typing".
2. **Seller order-detail sheet renders none of the new data.**
   `order-detail-sheet.tsx:149-180` shows only `recipientName · phone`, `line1`,
   `line2`, `city`, `region`, `reference`. Extend it (+ the
   `OrderShippingAddress` type in `order-format.ts:80-88`) to render: courier
   name, a modality badge ("Agencia"/"Domicilio"), `recipientSurnames`,
   `documentType` + `documentNumber`, `department`/`province`/`district`,
   `agencyName` — each only when present.
3. **Source-of-truth decision for the sheet's courier data — pick one, state the
   regen consequence:**
   - **(A) Read `deliveryDetails.courierName`/`courierModality`.** No API
     change, but **misses legacy-fallback orders** (where those keys weren't
     written to `deliveryDetails`). Sheet parses an untyped `Record`; tests must
     cover the missing-field cases.
   - **(B) Add `courierName`/`courierModality` to `OrderResponseDto`
     (`order-response.dto.ts:205`).** Reliable (reads the columns), but needs
     `pnpm --filter api generate:openapi && pnpm --filter @biasmarket/types
     generate` +
     commit the diff. **Recommended** — the columns are the real source of
     truth.
4. **`documentType` cast** (`checkout-form.tsx:482`
   `as "DNI"|"PASSPORT"|
   undefined`) is a **cosmetic type lie** — no runtime
   data loss (backend `@IsEnum(['DNI','CE','RUC','PASSPORT'])`, FE zod accepts
   all 4). Widen to the full union, ideally a shared type from
   `@biasmarket/types`.
5. **`bulkSave` hardening (code, not a test):** `couriers.service.ts:176` has no
   cross-payload duplicate-name guard and doesn't catch Prisma `P2002` from
   `@@unique([storeId, name])` → a dup name is a **500** today. Add an explicit
   dup check → `BadRequestException`, and a `P2002` catch →
   `BadRequestException`.
6. **Legacy courier-cost field** (`delivery-section.tsx:68-258`
   `courierEnabled`/`courierCost` → `estimatedCost`). `create-order` still falls
   back to it, so keep the plumbing. **Open decision:** hide the cost input when
   ≥ 1 courier exists, or relabel it "costo de envío por defecto (si no usas
   couriers)". Recommended: **relabel** (keeps the documented fallback
   discoverable). Keep the COURIER enable/disable toggle either way.
7. Demo store has no couriers → reviewer sees an empty section. Seed 2–3 (Olva =
   AGENCY + HOME, Shalom = AGENCY only, Motorizado = HOME only) **and an enabled
   `DeliveryMethodConfig` of type `COURIER`** (`create-order.
   usecase.ts:90`
   requires that toggle).
8. No `couriers.service.spec.ts`, no `couriers-section.test.tsx`.

**Tests:**

- **e2e** `test/couriers.e2e-spec.ts` (new — a stubbed-Prisma unit test cannot
  cover `$transaction`, `FOR UPDATE`, or `@@unique`): CRUD happy paths; every
  method rejects a non-owner; `bulkSave` inserts new + updates existing +
  deletes omitted + is idempotent; duplicate `name` → 4xx, not 500. New API e2e
  specs inherit `vitest.config.e2e.ts`'s `fileParallelism: false` automatically.
- **e2e** `test/orders.e2e-spec.ts` (extend): AGENCY without `agencyName` → 400;
  HOME without `line1`/`city` → 400; disabled courier / modality → 400;
  `Order.courierName`/`courierModality` + `deliveryDetails.deliveryCost` are the
  **locked config's** values (price snapshot, not live).
- `couriers-section.test.tsx` (new, web jsdom — **no** `fileParallelism`
  concern): mock `useCouriers` (`../queries/use-couriers`) →
  `{ data: Courier[],
  isPending }` and `useSaveCouriers`
  (`../mutations/use-save-couriers`) → `{ mutate, isPending }`;
  `Courier`/`CourierModality` shapes come from `../schemas/courier.schema`.
  Assert: add a courier, toggle a modality, set both prices, save calls
  `useSaveCouriers().mutate` with the expected bulk-save body; remove a courier.
- `checkout-form.test.tsx` (extend): modality cards reflect the selected
  courier's configured modalities; AGENCY shows the agency-name field and blocks
  submit until filled; HOME shows address fields and blocks until line1 + city.
- `order-detail-sheet.test.tsx` (extend — it already exists): a COURIER + AGENCY
  order renders courier name, an "Agencia" badge, agency name, and the DNI.
  **This fails against the current `getShippingAddress`** → it is a
  fix-companion test, not a baseline pin.

---

## Open decisions (need the user before / during implementation)

1. **#138 header placement** — fixed/overlay cluster (default), nested `(shop)`
   layout, or account-page redesign?
2. **#135 scope** — accept single-image-per-variant (option A, default) or build
   true multi-image (option B, migration + product-form + OpenAPI regen)?
3. **#137 extra platforms** — add `youtubeUrl` + WhatsApp-as-social now, or
   follow-up (default)?
4. **#120 deposit base** — should the partial-payment deposit apply to the
   delivery cost too (current behavior) or only to the item subtotal?
5. **#99 legacy courier-cost field** — hide when couriers exist, or relabel as
   the fallback (default)?
6. **#99 seller-sheet courier data source** — `deliveryDetails` (no regen,
   misses legacy orders) or `OrderResponseDto` columns (default, needs regen)?

---

## Cross-cutting work

- **Deploy-SHA verification — USER ACTION, needed before the "stale prod"
  hypothesis can be trusted.** A next-session coding agent has no prod SSH, so
  this is a value the user provides, not an agent step. `apps/api`'s health
  endpoint returns only `{ status, db }` (no SHA), and there are no image
  `LABEL`s in the repo. The SHA is available as the **running container image
  tag**: on the VPS, `docker ps --format '{{.Image}}'` (images are
  `ghcr.io/bobadilla-tech/biasmarket-{api,web}:${IMAGE_TAG}`, `IMAGE_TAG` = a
  40-hex commit SHA — `infra/vps/deploy.sh:213`), or read `state/current_sha` /
  `state/current_color` / `releases/history.log` (`infra/vps/lib/state.sh`).
  Compare to `d4fe64c`. Only if prod is **behind** `d4fe64c` is "stale prod" a
  valid explanation for the #120/#100/#99 reviewer comments. If prod is at/past
  `d4fe64c`, treat them as live bugs: check the demo store actually has (a) a
  payment method with `depositPercent < 100`, (b) ≥ 1 courier, (c) an
  **enabled** `DeliveryMethodConfig` of type `COURIER`.
- **Demo seed.** One partial-eligible payment method (#120) + 2–3 couriers with
  modalities + the `COURIER` delivery toggle (#99). Seed work is **non-trivial**
  — `fixtures.ts` + `apply.ts` + `helpers.ts` with idempotent upserts — and
  pushing it to prod follows
  `docs/plans/2026-07-29-prod-capable-seed-command.md`, not an ad-hoc script
  run.
- **i18n.** New copy: `payments-section` helper text and `delivery-section`
  relabel → `packages/i18n/{es,en}/dashboard.json`; `dashboard.orders` courier /
  modality / DNI labels → same; header `aria-label`s → `storefront.json`. ES is
  the source language; keep EN in parity.
- **OpenAPI / Orval.** Required if option B (#135) or option (B) for the #99
  sheet data source, or `youtubeUrl`: run
  `pnpm --filter api generate:openapi && pnpm --filter @biasmarket/types generate`
  and commit `apps/api/openapi.json` + `packages/types/generated/**`.
- **Gates.** `pnpm lint && pnpm typecheck && pnpm test`, plus
  `pnpm --filter api test:e2e` for the `orders` / `couriers` touch. Only new
  `*.e2e-spec.ts` under `apps/api` are affected by `fileParallelism: false`; the
  new web jsdom tests are not.

## PR shape — split, do not ship as one

One PR spanning 5 storefront features + 2 API modules + seed + deploy is too big
to review and too coupled to bisect. Split:

- **PR A — test backfill against unchanged behavior.** `social-icon.test.tsx`,
  `image-gallery.test.tsx` (current behavior incl. `#2d1649` border),
  `use-cart-stock.test.ts`, `checkout-summary.test.tsx` (current float math),
  the #100 guest-case extension. Lands green — a real baseline. **Everything
  else below is fix + fix-companion test, NOT baseline pins** (gallery theme-var
  border, cart-link no-flash, couriers dup-name 4xx, PARTIAL `requiredAmount`,
  AGENCY sheet render all fail before their fix).
- **PR B — #138 + #137.** Shared header + social relocation + the
  header-placement decision. No API changes. Visually reviewable.
- **PR C — #136.** `useSyncExternalStore` badge + `useCartStock` `staleTime`.
  Tiny, isolated.
- **PR D — #135 (option A).** Theme-var border + dedupe guard + a11y. Tiny.
- **PR E — #120 + #100.** Summary operator-order/rounding + the deposit-base
  decision + (optional) contact-input refactor. `checkout-form.tsx` is the
  highest-risk file in the batch — keep it isolated.
- **PR F — #99, split into F1 + F2 (mandatory, not "may").**
  - **F1 (backend):** `bulkSave` dup-name guard + `P2002` →
    `BadRequestException`; new `test/couriers.e2e-spec.ts`;
    `test/orders.e2e-spec.ts` courier extensions; (if decision 6 = columns) add
    `courierName`/`courierModality` to `OrderResponseDto` + OpenAPI/Orval regen.
  - **F2 (frontend):** `getShippingAddress` guard relax + `OrderShippingAddress`
    type; `order-detail-sheet.tsx` new fields + modality badge; `documentType`
    union widen; `delivery-section.tsx` legacy courier-cost relabel; new
    `couriers-section.test.tsx`; `order-detail-sheet.test.tsx` +
    `checkout-form.test.tsx` extensions. Depends on F1 if decision 6 = columns.
- **Chore PR — demo seed** (partial-eligible payment method + couriers +
  `COURIER` delivery toggle). Separate from all code PRs. Deploy-SHA
  verification is a **user action** (see Cross-cutting work), not a commit.

Never combine #99's API changes with #138's layout surgery.

---

## Round-2 review sign-off

Two subagent review rounds ran against `main` at `d4fe64c`: a claim-by-claim
fact-check and a senior-review critique, then a second critique of this
revision. Outcome: **plan is sound and implementable**, no blocking factual
errors remain. All `file:line` citations verified. Corrections folded in: #136
flash frequency + `useSyncExternalStore` (not lazy init); #100 regression test
already exists; #99 `getShippingAddress` 4-field guard +
AGENCY-renders-nothing + `bulkSave` P2002 + `documentType` is a cosmetic cast
(no data loss); #120 PARTIAL tests routed to e2e (`FakeDecimal` has no
`.toFixed`); deploy-SHA is a user action via the container image tag /
`state/current_sha`; PR F split into F1/F2.
