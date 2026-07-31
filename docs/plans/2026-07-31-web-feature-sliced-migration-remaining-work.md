# Feature-sliced migration for apps/web — remaining work (products + orders)

## Context

This is a **handoff/continuation document**, not a retrospective — it exists so
a future session (with no memory of this one) can pick up the feature-sliced
migration of `apps/web` without re-deriving context. It deliberately breaks the
`docs/plans/README.md` convention of "save after work lands, not before" because
the user explicitly asked for a forward-looking plan; the companion doc
`docs/plans/2026-07-31-web-feature-sliced-migration.md` is the normal
after-the-fact record of phase 1 (infra + `features/account`) and should be left
as-is — don't merge or edit it.

**Read `apps/web/AGENTS.md` first.** It's the living convention doc (feature
folder shape, data-fetching/forms/validation rules, what's deliberately deferred
and why) and gets updated after every stage — this plan doc will go stale,
`AGENTS.md` won't.

### What's already done (verified: typecheck + `pnpm --filter web test` + `next build` all green after each stage)

1. Infra: `@tanstack/react-query` + `zod` installed, `QueryProvider` wired into
   `app/[locale]/layout.tsx`, shared
   `components/shared/{loading-state,error-state,empty-state}.tsx`,
   `features/account/` as the reference four-layer shape (schema → api → query →
   component).
2. `features/notifications` — dedupes `notifications-bell` + the notifications
   page onto one query, mutations with `invalidateQueries`.
3. `features/auth` — `react-hook-form` + `zodResolver` reference
   (`login-form.tsx`). **No shadcn `form.tsx` exists** — the `form` registry
   item resolves empty for this project's `base-nova` (Base UI, not Radix)
   style. Don't try to add it; wire RHF directly onto existing `Input`/`Select`
   via `register()`, and onto custom controlled components (`PhoneInput`,
   anything with a non-native `onChange(value)` signature) via `Controller`.
4. `features/stores` — `create-store` form (RHF+Zod+multipart logo upload),
   `MyStoresList`, and `useDashboardStore`/`useUpdateDashboardStoreCache`
   replacing `lib/use-store.ts`'s old hand-rolled cache + `CustomEvent`
   broadcast. `lib/use-store.ts` is now a **thin re-export shim**
   (`export {
   useDashboardStore as useStore, type DashboardStore } from
   "@/features/stores"`)
   — kept only so the many still-unmigrated dashboard pages don't all need an
   import-path change in one PR. New/touched code should import from
   `@/features/stores` directly.
5. `features/store-settings` — full migration of `settings/page.tsx` (was 1118
   lines) into one section-component per settings card (profile, appearance,
   payments, delivery, defaults, notifications/stock-alerts), each with its own
   schema/api/query-or-mutation. `settings/page.tsx` is now ~75 lines of
   composition. Shared `SectionCard`/`Field`/`ToggleRow` and a
   `useSavedFlash(isSuccess, reset)` hook (replaces the old page-wide
   `savedSection` 1.8s-flash `useState`+timer with one per-mutation) live in
   `features/store-settings/components/section-primitives.tsx` — reuse this
   file's primitives for products/orders sections that need the same "Saved"
   button-flash UX, don't reinvent it.

### What's left

Two pages, **do one at a time**, verify fully (typecheck + test + build, see
"Verification" at the end) before starting the next:

1. `products/page.tsx` (1683 lines) + `products/[productId]/page.tsx` (409
   lines) — migrate together, they share types/helpers and the detail page is
   small. **This is the most complex remaining piece** — variant matrix
   generation, sequential-await variant diffing on edit, three separate raw
   multipart `fetch` call sites. Budget the most time here.
2. `orders/page.tsx` (1080 lines) — payment review / fulfillment workflow.
   Simpler component structure (no sub-components, single file) but has one
   genuinely tricky piece: a custom
   optimistic-update-with-delayed-commit-and-undo pattern that TanStack Query
   doesn't natively provide.

Everything below was extracted by two `Explore` agents that read both files in
full — treat file:line references as accurate as of 2026-07-31, but **re-read
the actual file before editing** since line numbers drift.

---

## Part A — `features/products`

### Current-state inventory

**Types** (hand-written, duplicated with drift — no zod today):

- `Category` — `{ id, name }` — identical in both files.
- `Variant` — diverges: list page's version has `imageOverride: string | null`
  that the detail page's version is **missing** (real drift, not just
  duplication).
- `Product` — diverges: detail page has a `createdAt?: string` the list page
  lacks, and it's dead (never rendered).
- List-page-only: `ViewMode` (`"grid"|"list"`), `VariantDraft`,
  `OptionTypeDraft`.

Build one canonical `features/products/schemas/`:

- `category.schema.ts` — `categorySchema`, `categoryListSchema`.
- `variant.schema.ts` — `variantSchema` (include `imageOverride` — the list
  page's fuller version is correct, the detail page was missing a field, not the
  other way around), `variantListSchema`.
- `product.schema.ts` — `productSchema` matching the list page's fields (drop
  the detail page's dead `createdAt`), `productListSchema`.

### API surface (all go through `features/products/api/`)

Read endpoints:

- `GET /stores/:storeId/products` — list.
- `GET /stores/:storeId/products/:productId` — single (used by detail page,
  **and** re-fetched mid-edit on the list page to get a fresh variant baseline
  before diffing — see "Variant diffing" below).
- `GET /stores/:storeId/categories` — list (loaded alongside products today in
  one combined `load()`; fine to keep as two separate `useQuery`s, or one
  combined query — either is reasonable, just don't lose the "load both on
  mount" behavior).

Write endpoints:

- `POST /stores/:storeId/products` — create, body
  `{ name, description?,
  price: Number, currency, stock?, variants?, categoryIds? }`.
- `PATCH /stores/:storeId/products/:productId` — update, body
  `{ name,
  description?, price: Number, currency, categoryIds }`.
- `DELETE /stores/:storeId/products/:productId` — delete.
- `PATCH /stores/:storeId/products/:productId/publish` — publish. **No unpublish
  endpoint exists anywhere** — don't invent one, this is a known one-way action
  in the current product.
- `POST /stores/:storeId/categories` body `{ name }` — create category, with a
  defensive fallback: on failure, refetch the category list and re-resolve by
  name (someone-else-just-created-it race), only throw if still not found. This
  is `ensureCategory` in the old code — preserve the semantic in whatever
  mutation replaces it.
- Variant CRUD (all part of the edit flow, see diffing below):
  `POST
  .../products/:productId/variants`,
  `PATCH
  .../products/:productId/variants/:variantId`,
  `DELETE
  .../products/:productId/variants/:variantId`.
- Three **raw `fetch` multipart uploads** (bypass `apiFetch` because it
  hardcodes `Content-Type: application/json`, which breaks a `FormData`
  boundary): product image on create, product image replace on edit
  (`?replace=1`), per-variant image upload. **Don't try to make `apiFetch`
  itself multipart-aware** — follow the existing accepted precedent in
  `features/stores/api/stores.api.ts`'s `uploadLogo` (raw `fetch` + manual
  `res.json()` + throw `data?.message ?? fallback`), just do the same thing
  three times in `features/products/api/`. Also fix the pre-existing minor bug:
  all three currently read `process.env.NEXT_PUBLIC_API_URL` directly instead of
  the `INTERNAL_API_URL ?? NEXT_PUBLIC_API_URL` fallback pattern `lib/api.ts`
  and `stores.api.ts` use — normalize this while touching the code.

### The two hard parts

**1. Variant matrix generation** (`ProductSheet`'s `variantsPreview` `useMemo`,
~40 lines) — cartesian product of option `{name, values[]}` pairs into one
`VariantDraft` per combination, keyed by `keyForAttributes()` (sorts attribute
entries, joins as `k:v|k:v` — this key is the diffing identity used everywhere).
Keep this as a derived `useMemo` over local option-builder state, not something
forced into RHF's `useFieldArray` — the _options_ (name + values list) are
reasonable `useFieldArray` candidates, but the _generated variant combinations_
are a derived read model, not user-editable rows in the traditional sense
(per-combination stock/price/image overrides are edited, but the combination set
itself is regenerated from options, not independently added/removed).

**2. Variant diffing on edit** (`handleEdit`, the biggest chunk of the old file)
— fetches the product fresh (doesn't trust local state), builds
`existingByKey`/`desiredKeys` maps, then per desired combo: PATCH if matched,
POST if not; afterward DELETEs any existing variant not in the desired set. Runs
as **sequential awaits in `for` loops today — no `Promise.all`, no rollback on
partial failure**. When migrating, at minimum consider `Promise.allSettled` with
aggregated error reporting so a mid-loop network blip doesn't silently leave the
product half-migrated; a batch endpoint on the API would be the real fix but
that's backend work, out of scope unless the user asks for it. Flag this
tradeoff in the PR description rather than silently changing behavior.

Also: a single shared hidden `<input type=file>` is reused across _all_ variant
rows via an `activeVariantImageKey` indirection (click row's button → set active
key → programmatically click the shared input → `onChange` looks up which
variant to update). Rethink this under `useFieldArray` — one file-input concern
per row is cleaner and removes the indirection.

### Reusable helpers to consolidate (currently duplicated between the two page files)

- `stockTone()` — byte-identical in both files, extract once.
- `getCategoryLabel()` — reimplemented (not reused) in the detail page as inline
  `useMemo`s — consolidate to one function.
- `keyForAttributes()` — needs a home wherever variant diff/upsert logic lands
  (`features/products/api/` or a small `features/products/lib/` colocated with
  the mutation that uses it).

Put these in `features/products/lib/` (a `lib/` subfolder inside a feature is
fine when a feature needs shared pure helpers that don't fit
schemas/api/queries/mutations/components — no precedent for this yet in the
repo, this would be the first, which is fine per AGENTS.md's "not every feature
needs every folder, and not every feature needs _only_ these folders" spirit).

### Proposed file layout

```
features/products/
  schemas/
    category.schema.ts
    variant.schema.ts
    product.schema.ts
  api/
    products.api.ts       # list, get, create, update, remove, publish, uploadImage(replace?)
    categories.api.ts     # list, create (with the ensure/retry-by-name fallback)
  lib/
    stock-tone.ts
    category-label.ts
    variant-key.ts         # keyForAttributes
  queries/
    use-products.ts
    use-categories.ts
    use-product.ts          # detail-page single-product fetch
  mutations/
    use-create-product.ts   # bundles create + image + per-variant images
    use-update-product.ts   # bundles patch + variant diff/upsert + image replace
    use-delete-product.ts
    use-publish-product.ts
  components/
    products-header.tsx
    product-tile.tsx
    product-row.tsx
    product-sheet.tsx       # the big one — RHF for scalar fields, useFieldArray for options, derived variantsPreview
  index.ts
```

Then `products/page.tsx` and `products/[productId]/page.tsx` shrink to
composition + the handful of genuinely page-specific bits (view-mode toggle,
search-filter `useMemo`, publish-button wiring).

**Known pre-existing quirks to preserve, not silently fix:**

- `t("viewStorefront")` uses a top-level `dashboard.viewStorefront` i18n key,
  not `dashboard.products.viewStorefront` — inconsistent but don't rename the
  key (that's a copy/i18n-file change, separate concern).
- `defaultCategories` hardcodes literal ES/EN category name arrays based on
  `locale.startsWith("es")` instead of translation keys — leave as-is unless
  asked to fix.
- No search debounce, no pagination, no bulk actions anywhere today — don't add
  them as part of this migration; scope is "same behavior, better architecture."

---

## Part B — `features/orders`

### Current-state inventory

**Types** — `OrderItemRow`, `OrderPaymentRow`, `Order`. **One is broken**:

```ts
interface OrderItemRow {Upload: any
  id: string;
  ...
```

`Upload: any` is a stray leftover (likely a botched paste near the `Upload`
lucide-react icon import) — compiles only because `any` is permissive. **Drop
it** when writing `features/orders/schemas/order.schema.ts` — it's never used as
a real field anywhere.

`Order.deliveryDetails` is typed as untyped `Record<string, unknown>` today,
parsed ad hoc with manual `typeof` guards (`getDeliveryLabel`). This is a
_separate, narrower_ duplication from the fuller `DeliveryMethod`/`PickupPoint`
types already in `features/store-settings/schemas/delivery.schema.ts` and in the
storefront checkout page. Decide during this migration whether `deliveryDetails`
should be typed against/reuse those shapes for consistency (three places
currently model delivery data independently) — reasonable either way, just make
a deliberate call instead of leaving it implicit.

### API surface

- `GET /stores/:storeId/orders` — list. **The page never calls the existing
  `GET /stores/:storeId/orders/:orderId` detail endpoint** — the "detail" Sheet
  just reads the already-loaded list via a `useMemo`. Fine to keep that pattern
  (derive from the list query's cache) rather than adding a redundant detail
  query, unless there's a reason to want per-order revalidation independent of
  the list.
- `GET /stores/:storeId/payment-methods?enabled=1` — enabled payment methods for
  the "register payment" method `<Select>`. **Reuse opportunity**:
  `features/store-settings/queries/use-payment-methods.ts` already wraps
  `GET
  .../payment-methods` (without the `enabled=1` filter, used for the
  settings toggle list). Consider extending that query/api function with an
  `enabledOnly` param instead of building a third independent wrapper around the
  same endpoint — your call based on how it reads once you're in the code; don't
  feel obligated if it makes the settings feature's API messier than it's worth.
- `PATCH /stores/:storeId/orders/:orderId/review` body
  `{ decision: "approve"
  | "reject" }`.
- `PATCH /stores/:storeId/orders/:orderId/fulfillment` body
  `{ status:
  "IN_TRANSIT" | "READY" | "COMPLETED" }` (`ORDERING` is never a
  valid PATCH target).
- `POST /stores/:storeId/orders/:orderId/payments` — **raw `fetch`, not
  `apiFetch`**, `FormData` body (`amount`, `method`, `note?`, `file?`). Same
  situation as products' image uploads — follow the `stores.api.ts` `uploadLogo`
  precedent (raw fetch, don't touch shared `apiFetch`). Backend validates:
  amount finite, `>0`, `<= pendingAmount`; method one of
  `YAPE|PLIN|TRANSFER|CASH`; file `<=5MB`, JPEG/PNG magic-byte sniffed — mirror
  these in the zod schema / RHF validation so client-side errors surface before
  the network round-trip, not just after.

### The hard part: optimistic update with delayed commit + undo

`scheduleNormalChange` (~35 lines in the old file) is the trickiest thing to
port. Today: applies the new status to local state **immediately**, shows a
`sonner` toast with an "Undo" action for an 8-second window (`UNDO_WINDOW_MS`),
and only fires the real `PATCH` after the timeout elapses _if not undone_, via a
plain `setTimeout`/`clearTimeout` — no library. A `pendingChange` map keyed by
order id tracks which rows have an in-flight optimistic change (used to hide
action buttons on those rows while pending).

TanStack Query's `onMutate` optimistic-update pattern doesn't have a "delay the
real mutation by N seconds unless undone" semantic built in — this needs a
**custom hook wrapping `useMutation`**, independent of query-cache mechanics:
apply the optimistic patch via `queryClient.setQueryData` immediately, hold the
actual `mutate()` call behind the same timer + toast-undo UX, and only invoke it
(or roll back the local patch) when the timer fires or the user clicks undo.
Budget real thought here — this is not a mechanical "swap useState for useQuery"
step like the rest of the migration has mostly been. A reasonable shape:

```
features/orders/mutations/use-optimistic-status-change.ts
```

wrapping both the "review" and "advance" cases (they share the exact same
delayed-commit/undo shape, just different underlying mutations).

Note: the sensitive-transition path (rejecting a payment, or advancing to
`COMPLETED`) **bypasses** the optimistic/undo flow entirely and goes through a
confirm `AlertDialog` instead, calling the mutation directly and waiting for it
to resolve before closing. Keep these as two distinct paths — don't try to unify
them into one mechanism, the old code deliberately doesn't.

### Other notable pieces

- `getOrderStatus()` conflates `paymentStatus` × `fulfillmentStatus` into one
  badge via priority-ordered if/else (`REJECTED` → `CANCELLED` →
  `PARTIALLY_PAID` → not-yet-`VERIFIED` → then fulfillment-based labels only
  once `VERIFIED`). The branch order is load-bearing and not type-enforced —
  worth writing as a small pure function with explicit unit tests once migrated
  (a good target for the "pure function, easy to test" test-strategy pattern
  already established: see `features/account/schemas/*.test.ts` for the style).
- `matchesTab()`'s `"pending"` tab actually means "needs seller attention"
  (not-yet-`VERIFIED`, OR `VERIFIED`-but-still-`ORDERING`), not literally
  "payment pending" — preserve the exact semantic, maybe rename/comment for
  clarity since the current name is misleading.
- `NEXT_FULFILLMENT` lookup table + `SENSITIVE_FULFILLMENT` set encode the
  linear fulfillment state machine and which transition needs a confirm dialog —
  good candidates for `features/orders/lib/` constants.
- Payment-proof image preview uses `URL.createObjectURL` with **no matching
  `revokeObjectURL`** (memory-leak-prone) — fix this while migrating (the
  `account/confirm` and `create-store-form` reference implementations both show
  the correct pattern: effect that creates the URL and returns a cleanup that
  revokes it).
- No shared `LoadingState`/`ErrorState`/`EmptyState` components used anywhere in
  this file today (hand-rolled loading text, error card, empty text) — switch to
  `components/shared/*` per the AGENTS.md rule.
- One i18n oddity to check, not necessarily fix:
  `t("details.paymentHistory",
  { fallback: "Historial de abonos" })` passes a
  `fallback` param that next-intl may not treat as a default-value mechanism the
  way it looks intended — verify it actually resolves correctly before assuming
  the pattern is safe to copy elsewhere.

### Proposed file layout

```
features/orders/
  schemas/
    order.schema.ts          # OrderItemRow/OrderPaymentRow/Order, no Upload:any
    register-payment.schema.ts
  api/
    orders.api.ts            # list, review, advance, registerPayment (raw fetch)
  lib/
    order-status.ts          # getOrderStatus, matchesTab, NEXT_FULFILLMENT, SENSITIVE_FULFILLMENT
    order-format.ts          # getOrderNumber, getInitials, formatOrderDate, getDeliveryLabel, getProductSummary
  queries/
    use-orders.ts
  mutations/
    use-review-payment.ts
    use-advance-fulfillment.ts
    use-register-payment.ts
    use-optimistic-status-change.ts   # the delayed-commit/undo wrapper, see above
  components/
    orders-tabs.tsx
    orders-table.tsx         # + order-row.tsx if it grows large enough to split
    order-status-badge.tsx
    order-detail-sheet.tsx
    register-payment-form.tsx
    payment-history-list.tsx
    payment-proof-lightbox.tsx
    confirm-transition-dialog.tsx
  index.ts
```

---

## Verification (per page, same pattern used throughout this migration)

1. `pnpm turbo run typecheck --filter=web`
2. `pnpm --filter web test` (add schema tests + at least the trickiest
   mutation's test — e.g. the variant-diff mutation for products, the
   optimistic-undo hook for orders — following the existing style: mock
   `@/lib/api`'s `apiFetch` via `vi.mock`, see
   `features/store-settings/api/settings.api.test.ts` for a multi-call-bundling
   example close to what these mutations need)
3. `pnpm turbo run build --filter=web` (Turbopack catches `"use client"`
   boundary mistakes tsc doesn't — this bit once already this session, see
   `features/stores/queries/use-dashboard-store.ts`'s history)
4. Ideally a live smoke test (`pnpm --filter api dev` +
   `pnpm --filter web
   dev` against seeded data) — this wasn't done for any
   stage so far this session (no seeded DB access in the sandbox used), only
   build+typecheck+test were verified. Flag explicitly in the PR/session summary
   if it's still not possible, don't claim it was tested if it wasn't.

## After both pages land

Update `apps/web/AGENTS.md`'s roadmap section (currently step 6) to mark
products/orders done, and consider whether `apps/web/AGENTS.md`'s "Migration
roadmap" section has outlived its usefulness at that point (every significant
page will have been migrated) — could shrink to a one-line "fully migrated, see
git history" note rather than a growing checklist.
