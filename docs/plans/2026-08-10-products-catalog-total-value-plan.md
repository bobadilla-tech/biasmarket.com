# Products page: total catalog value stat tile

Written before execution, at the user's explicit request (review pass wanted
first) — deviates from this directory's normal "record after the work lands"
convention, per `docs/plans/README.md`.

## Context

Seller-facing GitHub issue: sellers want an at-a-glance total value of their
published catalog on the Products dashboard page
(`https://biasmarket.com/es/dashboard/demo-kpop-corner/products`), e.g. product
1 = S/10 + product 2 = S/40 → S/50 total. The issue itself flags three open
questions to resolve before building:

1. Published-only, or Published + Draft?
2. Unit price sum, or price × available stock?
3. Same card style as the Overview page's "Ingresos verificados" / "Total de
   pedidos" tiles, but placed on the Products page.

Investigation findings that drive the decisions below:

- Overview's "Ingresos verificados" (`t("stats.revenue")`) / "Total de pedidos"
  (`t("stats.totalOrders")`) are `StatTile` instances
  (`apps/web/features/stats/components/stat-tile.tsx`) rendered in
  `overview-page-client.tsx:50-59`, fed by a backend aggregate
  (`useStatsOverview` → `Stats.getOverview`). `StatTile` is a small, generic,
  already-reusable presentational component (`icon`/`label`/`value` props, no
  business logic) — reusing it directly is the styling answer to question 3.
- The Products page (`products-page-client.tsx`) already fetches the **entire**
  product list client-side via `useProducts(storeId)`
  (`apps/web/features/products`), which — per
  `apps/api/src/modules/products/products.service.ts:119-148`
  (`findAllForStore`) — returns every non-deleted product for the store with
  `price` (string, `Decimal(10,2)`), `currency`, `status`
  (`DRAFT`/`PUBLISHED`), and `availableStock` (nullable — `null` means
  unlimited stock, computed in `computeAvailableStock` as
  `sum(variant.stock) - sum(variant.reserved)`, or `null` if any variant has
  unlimited stock or the product has no variants). **This means the total can
  be computed entirely client-side from data already in memory — no backend
  change, no new endpoint, no Orval regen.** This is a meaningfully smaller
  change than it'd be on the Overview page, which would need a new field on
  `Stats.getOverview`'s backend aggregate.
- `ProductDetailResponseDto.price` is a **string** (Decimal serialized over
  JSON) — must `Number(...)`/`parseFloat` per product before summing, matching
  how `product-row.tsx:109` / `product-tile.tsx:167` already render it
  (`{product.currency} {product.price}`, string concatenation, no parsing) —
  those two call sites don't need to parse since they just display it, but a
  sum does.
- **Currency is per-product, not store-wide**: `CreateProductDto`/
  `UpdateProductDto`'s `currency` field accepts any of
  `SUPPORTED_CURRENCIES` (9 values —
  `packages/utils/src/currency/index.ts`), independent of
  `store.defaultCurrency`. The product create/edit sheet
  (`product-sheet.tsx:387-397`) lets a seller pick any of the 9 per product.
  **A store can have products in different currencies simultaneously.**
  Naively summing raw price numbers across currencies would silently produce a
  meaningless total (e.g. `10 USD + 40 PEN ≠ 50` of anything) — this needs an
  explicit decision (below), since the app has no FX-conversion capability
  anywhere today.
- `product.price` is the **base/unit price** — the same value already shown in
  the table's "Precio" column (`products-page-client.tsx:288-290`,
  `product-row.tsx:109`) and product tiles, regardless of variants.
  Variant-level `priceOverride` is not surfaced in either existing price
  display, so a new aggregate metric shouldn't introduce that inconsistency
  either — sum `product.price`, not variant overrides.

## Decisions

1. **Published only.** "Valor total del catálogo" should reflect what's
   actually live/sellable in the storefront, matching the mental model of
   "Ingresos verificados" (verified, not just submitted) — a draft product
   isn't real inventory value yet, it's unfinished setup. Filter on
   `product.status === "PUBLISHED"`.
2. **Unit price sum, not price × stock.** Two reasons: (a) the issue's own
   worked example (`S/10 + S/40 = S/50`) sums unit prices with no quantity
   factor; (b) `availableStock` is `null` for any product with an unlimited-
   stock variant, which has no sane multiplier — price×stock would need a
   special case for every unlimited product (treat as 0? exclude it? both
   misrepresent "unlimited" as "worthless" or "uncounted"), while a plain
   price sum has no such gap. If the seller wants a stock-weighted inventory
   valuation later, that's a distinct metric worth its own explicit ask, not a
   silent default here.
3. **Same-currency products only, using `store.defaultCurrency` as the
   inclusion filter.** Sum `product.price` only for `PUBLISHED` products where
   `product.currency === store.defaultCurrency`; products in a different
   currency are silently excluded from the total (no FX conversion, no
   multi-total UI, no warning badge — kept intentionally minimal, see
   Non-goals). In practice this is expected to be a no-op filter for the
   overwhelming majority of stores (single-currency catalogs are the norm for
   this product), so it's a correctness guard for an edge case, not UI a
   typical seller will ever notice.
4. **Products page, not Overview.** Placed as a new `StatTile` on
   `products-page-client.tsx`, reusing the exact component Overview's
   "Ingresos verificados"/"Total de pedidos" already use — same visual style
   with zero new CSS, and no backend round-trip since the data's already
   local. The issue's parenthetical "(o en Productos)" leaves this open; doing
   it here is both truer to where the metric is contextually useful (a seller
   scanning their product list) and the lower-risk implementation.

## Scope

1. **`apps/web/features/products/lib/catalog-value.ts` (new file):** a small
   pure function, e.g.
   `getPublishedCatalogValue(products: ProductDetailResponseDto[], currency: string): number`,
   filtering `p.status === "PUBLISHED" && p.currency === currency` (the
   `currency` param is the caller's `store.defaultCurrency`, matched against
   each product's own `p.currency` — not a self-comparison) and summing
   `Number(p.price)`. `Number(...)` on the Decimal-serialized price string
   matches this repo's existing display-layer convention for money (same
   pattern used in `cart-page-client.tsx`/`payments-page-client.tsx`/
   `overview-page-client.tsx`) — fine here since this is a display aggregate,
   not a payment-critical computation like the Decimal-space arithmetic
   `apps/web/AGENTS.md` documents for `OrderRepository.withPaymentSummary`.
   Pulled out as a pure function (not inlined in the component) specifically
   so it's unit-testable without rendering — this repo's existing pattern for
   this kind of derived-value logic (see `features/stats/lib/payment-date-ranges.ts`
   + its adjacent `.test.ts`). `features/products/index.ts:13-20` already
   barrel-exports several `lib/` functions, so exporting this one is a direct
   one-line addition there, not a new pattern to introduce.
2. **`products-page-client.tsx`:** compute
   `const catalogValue = useMemo(() => getPublishedCatalogValue(products, defaultCurrency), [products, defaultCurrency])`
   using the **full unfiltered `products` array** (not `filteredProducts` —
   the search box filters the visible list/grid, but "total catalog value"
   should reflect the whole catalog regardless of an active search term, same
   way Overview's revenue tile isn't scoped to any client-side filter).
   Render a single `StatTile` (imported from `@/features/stats`, same as
   Overview) above the grid/list toggle row, `icon={Wallet}` (or similar —
   match Overview's revenue tile icon for visual consistency), `label={t("products.catalogValueLabel")}`,
   `value={\`${defaultCurrency} ${catalogValue.toFixed(2)}\`}` — the
   `"{currency} {amount}"` format matches how `product-row.tsx`/
   `product-tile.tsx` already display individual prices, so the new tile's
   number reads consistently with the rest of the page (Overview's own
   revenue tile omits the currency code entirely, which is arguably a
   pre-existing minor inconsistency — not fixing that here, out of scope).
3. **i18n:** add `products.catalogValueLabel` to both
   `packages/i18n/es/dashboard.json` and `packages/i18n/en/dashboard.json`
   under the existing `products` key (near `listTitle`) — es: "Valor total del
   catálogo", en: "Total catalog value".
4. **Test:** `apps/web/features/products/lib/catalog-value.test.ts` covering:
   empty array → 0; mixed `PUBLISHED`/`DRAFT` → drafts excluded; mixed
   currency → non-default-currency products excluded; string price parsing
   (e.g. `"10.00"` + `"40.00"` → `50`).

## Non-goals

- No FX conversion or multi-currency breakdown UI — see Decision 3. If this
  becomes a real seller pain point later, that's a separate, larger plan
  (needs an FX-rate source, a decision on stale-rate handling, etc.).
- No price × stock / inventory valuation metric — see Decision 2.
- No backend/API/schema change, no Orval regen — the data's already fetched
  client-side by the existing `useProducts` hook.
- Not touching Overview's existing `StatTile` row or its backend aggregate.

## Files touched

- `apps/web/features/products/lib/catalog-value.ts` (new)
- `apps/web/features/products/lib/catalog-value.test.ts` (new)
- `apps/web/features/products/index.ts` (barrel export — `lib/` is already
  re-exported here for other helpers, add `getPublishedCatalogValue` to the
  existing list)
- `apps/web/app/[locale]/(dashboard)/dashboard/[slug]/products/products-page-client.tsx`
- `packages/i18n/es/dashboard.json`, `packages/i18n/en/dashboard.json`

## Verification

- `pnpm --filter web test` (new `catalog-value.test.ts` plus no regressions in
  existing products tests).
- `pnpm typecheck`.
- Manual browser pass on the Products page (both locales): tile renders above
  the grid/list toggle, shows `PEN 50.00`-style value matching a hand-counted
  sum of that seller's published products, updates after publishing/
  unpublishing/editing a product's price (TanStack Query already invalidates
  `useProducts` on those mutations, so this should be automatic — confirm, not
  assume).

## Definition of done

Products dashboard page shows a "Valor total del catálogo" stat tile, styled
identically to Overview's revenue/orders tiles, computed client-side as the
sum of published products' unit prices in the store's default currency —
drafts and other-currency products excluded per the decisions above, zero
backend changes.
