# WhatsApp checkout fix, richer products, slug URLs, i18n sweep, multi-currency

## Context

Follow-up to the previous session's manual-payment order flow build. User
reported the "Confirmar y continuar por WhatsApp" checkout button did nothing,
and asked for: the business phone collected during onboarding instead of buried
in a later settings page; more product fields (availability window, an image URL
for now since upload infra isn't built); a "jump to storefront" button from the
dashboard; dashboard URLs using the store's slug instead of its cuid; every page
actually using `next-intl` instead of hardcoded strings; and per-product
currency, since a store can sell in more than one.

## 1. Root cause of the broken checkout button

Two compounding gaps, both from onboarding creating a store with none of the
config checkout depends on:

- `StoresService.create` never set `whatsappNumber` → `create-order.usecase.ts`
  always returned `whatsappUrl: null`, so the button just created the order
  silently, no redirect.
- A fresh store had zero `DeliveryMethodConfig` rows → the checkout page's
  delivery `<select>` never populated → submit button permanently disabled, no
  explanation shown.

Fixed by making `whatsappNumber` a required field on `CreateStoreDto` (new DTO,
replacing the previously-unvalidated inline body type on
`StoresController.create`) and seeding one default enabled `PICKUP`
`DeliveryMethodConfig` row inside the same `create()` transaction. Checkout also
now shows an explanatory message instead of a silently-disabled button for any
store that predates this fix.

## 2. Richer product fields

- `Product.availableUntil DateTime?` (nullable, informational only — no
  auto-hide-when-expired job; that's a clear follow-up, not built).
- `Product.images`/`availableUntil` exposed on `CreateProductDto`/
  `UpdateProductDto` — both map straight through to Prisma with zero service
  changes (products.service.ts already spread the dto directly).
- Dashboard product form: date input + image-URL text input; storefront card
  shows "Disponible hasta {date}" when set.

## 3. Slug-based dashboard URLs

All seller-facing endpoints (`products`, `orders`, `delivery-config`) stayed on
`stores/:storeId/...` (cuid) — no backend route changes. Instead:

- New `GET /stores/by-slug/:slug` (authenticated, ownership-checked —
  `findPublicBySlug` was unsuitable since it's `@Public()` and
  published-products-only).
- New `apps/web/lib/use-store.ts` hook: resolves `storeId` from the URL's `slug`
  once, used by every dashboard page instead of each one independently calling
  `useParams<{storeId}>()`.
- Renamed `dashboard/[storeId]/` → `dashboard/[slug]/` (4 pages). Onboarding's
  "manage this store" link now points at `store.slug`.
- "Ver tienda" button on the products page was trivial once the URL already
  carries the slug — links straight to `/store/${slug}`.

## 4. i18n sweep

Every page built in the previous session (cart, checkout, dashboard
settings/orders, onboarding create-store) was still plain hardcoded
Spanish/English strings. Converted all of them to `next-intl`, adding the
missing keys to `packages/i18n`'s `storefront.json` / `dashboard.json` /
`onboarding.json` (es + en). Left the landing-page i18n migration alone — that
was a separate, concurrent session's in-progress work.

## 5. Multi-currency

New migration `add_currency_fields` (plus the `add_product_available_until` one
from §2):

- `Store.defaultCurrency` (default `PEN` — Yape/Plin, named in the product spec,
  are Peru-specific, so that's the sensible default over USD), editable at
  onboarding and in dashboard settings.
- `Product.currency`, defaults to the store's when omitted, overridable per
  product in the create/edit form — this is the actual "let the store owner
  change the product currency" ask.
- `Order.currency` / `OrderItem.currency`, snapshotted at checkout time same as
  price.
- Existing `Order`/`OrderItem` rows (dev data) got backfilled to `PEN` via a
  temporary column default in the migration SQL, then the default was dropped —
  the app always sets currency explicitly going forward, matching the schema
  having no `@default` for those two columns.
- **Checkout blocks mixing currencies in one cart.** Since summing PEN and USD
  into one `totalAmount` isn't meaningful, `create-order.usecase.ts` throws a
  400 if cart items resolve to different product currencies, and the cart/
  checkout pages detect the same condition client-side (`hasMixedCurrencies` in
  `lib/cart.ts`) to warn and disable submit before the request is even sent,
  rather than only failing server-side.
- Supported currency list (`PEN, USD, EUR, MXN, ARS, COP, CLP, BRL, GBP`) lives
  in one place — `packages/utils/src/currency` — reused by both the API DTOs'
  `@IsIn` validation and the web dropdowns, so the two can't drift.
- Every price display (WhatsApp message, storefront card, cart, checkout,
  dashboard products/orders tables) now shows `{amount} {CURRENCY}` instead of a
  bare `$`.

## Verification

- `pnpm turbo run typecheck build test` clean across all 7 packages.
- `pnpm --filter api test`: 77/77. `pnpm --filter @biasmarket/utils test`:
  14/14. `pnpm --filter web test`: 1/1.
- End-to-end smoke test against a real local Postgres + running dev servers:
  fresh signup → onboarding with WhatsApp number + currency → landed on
  `/dashboard/<slug>/products` with a working "Ver tienda" link → created a
  product with an image URL, availability date, and a non-default currency →
  storefront rendered it correctly → checkout's delivery method was
  pre-populated (no separate settings trip needed) → submission redirected to a
  real `wa.me` URL with the correct order text and currency — the original bug,
  confirmed fixed.

## Follow-ups (not in scope this session)

- No auto-hide for products past `availableUntil`.
- No FX conversion — mixed-currency carts are blocked, not reconciled.
- The pre-existing `GET /stores/me/stores` / `GET /me/stores` route duplication
  (`StoresController` vs `MyStoresController`) noted again, still not touched.
- Production deploy (`infra/docker/DEPLOY_ORACLE.md`) needs the two new
  migrations (`add_product_available_until`, `add_currency_fields`) picked up by
  the api container's `prisma migrate deploy` on next rebuild — same as the
  dev-image rebuild needed after this session's local testing.
