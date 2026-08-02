# apps/web audit fixes — lint, route boundaries, images, metadata, remaining feature-slice migrations

## Context

This is a **forward-looking plan**, not a retrospective — it deliberately breaks
`docs/plans/README.md`'s "save after work lands" convention because the user
explicitly asked for a plan to be written up front, same precedent as
`docs/plans/2026-07-31-web-feature-sliced-migration-remaining-work.md`.

A full audit of `apps/web` (feature-slice compliance + general Next.js best
practices) turned up eight independent gaps, none blocking each other except
where noted. Findings, in the order they're addressed below:

1. **ESLint is completely dead across the whole monorepo.** No `lint` script
   in any of the 7 workspace packages' `package.json`, no eslint config file
   anywhere (not `.eslintrc*`, not `eslint.config.*`), no `eslint` /
   `eslint-config-next` devDependency anywhere — confirmed via
   `grep -rn '"lint"\|"eslint'` across every package and a literal
   `pnpm lint` run from root (`turbo run lint` → "0 successful, 0 total").
   `CLAUDE.md` documents `pnpm lint` and per-package CI lint as if they run —
   they don't. This is a monorepo-wide gap; this plan scopes the **fix** to
   `apps/web` only (matches what was asked), and calls out the same gap in
   `apps/api`/`packages/*` as an explicit follow-up, not silently expanded
   scope.
2. Zero `loading.tsx` / `error.tsx` / `not-found.tsx` anywhere in `app/`.
3. Zero `next/image` usage (13 files, all raw `<img>`), and
   `next.config.ts` has no `images.remotePatterns` configured, so `next/image`
   can't be dropped in without that config landing first.
4. Per-page `metadata` exists on only 5 of 25 pages (marketing pages +
   `store/[slug]` + the root `[locale]/layout.tsx`). Dashboard/admin/onboarding
   pages all inherit the root title.
5. `features/collections` doesn't exist — `collections/page.tsx` (249 lines)
   and `sections/page.tsx` (248 lines) still use raw `apiFetch` +
   `useEffect`/`useState`.
6. `features/checkout` doesn't exist — `store/[slug]/checkout/page.tsx` (221
   lines) still does, same pattern. This is the customer-facing purchase flow,
   the highest-stakes of the unmigrated pages.
7. No `features/admin` — `admin/inquiries/page.tsx` (145 lines) and
   `admin/stores/page.tsx` (122 lines), same pattern.
8. `components/marketing/contact-form.tsx` (134 lines) posts to the same
   `/contact` endpoint `admin/inquiries` reads from, via raw `apiFetch`, no
   zod validation, no `react-hook-form`.
9. (Minor, folded into whichever part touches each file) `settings/page.tsx`
   and 3 dashboard-chrome components (`mobile-sidebar.tsx`,
   `store-sidebar.tsx`, `store-theme-frame.tsx`) still import the
   `lib/use-store.ts` compat shim instead of `@/features/stores` directly.
   Functionally identical (the shim is a thin re-export per
   `apps/web/AGENTS.md` step 5) — cosmetic, not a bug.

Everything below follows the shape established in the two prior migration
plan docs: current-state inventory → proposed layout → hard parts flagged →
verification. **Re-read the actual files before editing** — this doc was
written 2026-08-02; line numbers and endpoint shapes may have drifted by the
time each part is picked up.

### Priority (for sequencing, not for the plan-review pass below)

- **High**: Part A (ESLint) — foundational, catches regressions in every part
  after it. Part F (checkout) — customer-facing correctness.
- **Medium**: Part B (route boundaries), Part E (collections/sections), Part
  G (admin).
- **Low**: Part C (next/image — blocked on an infra decision, see below), Part
  D (metadata), Part H (contact form), Part I (use-store shim cleanup).

### Verification (per part, same pattern as prior migration plans)

1. `pnpm turbo run typecheck --filter=web`
2. `pnpm --filter web test` (add schema/api/mutation tests per the existing
   style — see `features/store-settings/api/settings.api.test.ts` for
   multi-call bundling, `features/orders/mutations/use-optimistic-status-change.test.tsx`
   for a hook-with-timers example)
3. `pnpm turbo run build --filter=web`
4. For Part A specifically: `pnpm turbo run lint --filter=web` must exit 0
5. No live smoke test unless the sandbox has seeded DB access — flag
   explicitly if still not possible, don't claim it was tested if it wasn't

---

## Part A — ESLint for `apps/web`

### Current state

Nothing. No config, no script, no dependency, confirmed by direct
`pnpm lint` run (0 tasks executed).

### Plan

1. Add `eslint`, `eslint-config-next` (matches the installed Next 16 major —
   check `apps/web/package.json`'s `next` version and pin a compatible major,
   don't assume it matches whatever `create-next-app` would scaffold today;
   `apps/web/AGENTS.md`'s warning about this Next version having
   training-data-breaking changes applies to its lint config shape too, check
   `node_modules/eslint-config-next` docs for the flat-config export name
   before wiring it), `@eslint/eslintrc` (Next's flat-config compat layer
   needs this to translate the legacy `eslint-config-next` extends) as
   devDependencies to `apps/web`.
2. Add `apps/web/eslint.config.mjs` using the flat-config format (ESLint 9+
   default) — `FlatCompat` bridging `next/core-web-vitals` +
   `next/typescript`, same shape Next.js's own scaffolding generates. Ignore
   `.next/`, `node_modules/`, `next-env.d.ts`.
3. Add `"lint": "eslint ."` to `apps/web/package.json`'s scripts.
4. `turbo.json` already has a root `lint: {}` pipeline entry (confirmed) — no
   turbo config change needed, it'll just stop being a no-op for `web` once
   the script exists.
5. **Run it and triage what surfaces before calling this part done — don't
   commit to fixing every violation blind.** A first-time lint pass on ~150
   existing files will likely surface real findings (unused imports,
   `react-hooks/exhaustive-deps` gaps the codebase currently silences with
   inline comments in several places — e.g. every `load()` `useEffect` in the
   unmigrated pages from Part E–H — `<img>` warnings if `next/core-web-vitals`
   flags them ahead of Part C landing, etc). Split the result:
   - Auto-fixable (`eslint . --fix`): apply directly.
   - Small, mechanical, unrelated to other parts of this plan: fix inline.
   - Everything else: leave as-is *if* the violating file is already slated
     for a rewrite in Parts E–I (no point double-fixing code about to be
     deleted); otherwise list it as a follow-up item in the PR description
     rather than scope-creeping this part into a full-codebase lint pass.
6. Decide the `react-hooks/exhaustive-deps` question explicitly once, not
   per-file: the codebase's existing pattern is
   `// eslint-disable-next-line react-hooks/exhaustive-deps` on intentional
   mount-only effects (see every `load()` effect across the app). Confirm
   `eslint-config-next` doesn't turn this into an error-level violation that
   would break the build; if it does, keep the inline disables (they're
   already deliberate, documented via the surrounding code's `load()`
   pattern) rather than restructuring working effects to satisfy the linter.

### Follow-up (explicitly out of scope here)

`apps/api` and `packages/{db,i18n,types,ui,utils}` have the identical gap.
Not touched by this plan — flag to the user as a separate, smaller
follow-up once Part A's `apps/web` config proves out the pattern (NestJS
would need `eslint-config-next`'s equivalent, e.g. `typescript-eslint`
directly, since `eslint-config-next` is Next-specific).

---

## Part B — Route-level `loading.tsx` / `error.tsx` / `not-found.tsx`

### Current state

Zero of any of these anywhere in `app/`. Every page manages its own
`isPending`/`error` JSX branch instead (the TanStack Query pattern
established across the migrated features).

### Plan

Given the client-fetched-data architecture, route boundaries still earn their
keep for two things route-local `isPending` state can't cover: instant nav
feedback before the page's JS/hydration finishes, and catching render-time
exceptions (a `.map` over `undefined`, a bad zod parse that wasn't caught,
etc.) that today would just white-screen.

1. One shared set at `app/[locale]/loading.tsx`, `app/[locale]/error.tsx`,
   `app/[locale]/not-found.tsx` — App Router boundary inheritance means these
   cover every route under `[locale]` (marketing, onboarding, dashboard,
   storefront, admin) unless a more specific one is added later. Start with
   one set, not four — don't build per-route-group variants speculatively;
   revisit only if the shared design genuinely doesn't fit a section (e.g.
   dashboard wanting the sidebar to stay mounted during the loading state,
   which a `[locale]`-level boundary can't do since it replaces everything
   below the locale layout — flag this specific limitation to the user if it
   turns out dashboard needs its own `(dashboard)/loading.tsx` instead; don't
   silently decide either way).
2. `error.tsx` **must** be a Client Component (Next.js requirement) — receives
   `error: Error & { digest?: string }` and `reset: () => void`. Follow the
   existing `components/shared/error-state.tsx` visual pattern if it's
   reusable here (check its props first — it's built for inline query-error
   states, not necessarily a full-page boundary, so this may need its own
   design rather than reusing that component as-is).
3. `loading.tsx` similarly can reuse `components/shared/loading-state.tsx`'s
   visual language.
4. `not-found.tsx` — check what `notFound()` calls already exist (the root
   layout calls it for an invalid locale) and make sure this new file doesn't
   change that existing behavior, just gives it a real page instead of
   Next's default.

---

## Part C — `next/image` adoption

### Current state

13 files with raw `<img>`:
`app/[locale]/(dashboard)/dashboard/[slug]/products/[productId]/page.tsx`,
`app/[locale]/(storefront)/store/[slug]/page.tsx`, `product-card.tsx`,
`components/marketing/footer.tsx`, `components/marketing/navbar.tsx`,
`components/store-logo.tsx`, and 7 files under `features/orders`/
`features/products`. `next.config.ts` has no `images` block at all.

### Blocking decision — confirm before writing code

Product/variant/payment-proof images are served from S3-compatible storage
(MinIO in dev, per `apps/api/src/storage/storage.service.ts`) via
`S3_PUBLIC_URL`, an **API-only env var today, not exposed to the web app**.
`next/image`'s `images.remotePatterns` needs a known hostname at build time.
Two options, pick one with the user rather than guessing:

- Add a `NEXT_PUBLIC_S3_PUBLIC_URL` (or reuse a derived value) build-time env
  var, wire it through `infra/docker/docker-compose.yml` /
  `docker-compose.dev.yml` the same way `NEXT_PUBLIC_API_URL` already is, and
  point `images.remotePatterns` at its host. This is the correct long-term
  fix but touches deployment config — confirm the exact prod domain (Caddy
  routing, `infra/caddy/Caddyfile`) before landing, per this session's
  "confirm before touching shared infra" rule.
- Use a wildcard `hostname: "**"` remote pattern as a stopgap (Next.js
  supports this, weakens the allowlist but unblocks `next/image` immediately
  without new env plumbing). Note in the PR description that this is a
  stopgap, not the final shape.

### Plan (once the above is decided)

1. Add the `images.remotePatterns` config to `next.config.ts`.
2. Convert each of the 13 files: pick explicit `width`/`height` where the
   original had a fixed size class (most do — e.g. `size-10`, `size-20`,
   `h-36 w-full`), or `fill` + a sized wrapper where the original used
   `aspect-square`/`object-cover` on a fluid container (several of the
   `features/products` and `features/orders` cases). Preserve existing
   `alt` text exactly — several call sites already have empty `alt=""` for
   decorative images (e.g. payment-proof thumbnails); don't add alt text
   where the original deliberately had none.
3. Re-run the visual smoke check mentioned in the top-level verification
   section if the sandbox allows it — `next/image` layout behavior
   (especially `fill` containers) is exactly the kind of thing that reads
   fine in code and breaks visually.

---

## Part D — Per-page `metadata`

### Current state

Only marketing pages + `store/[slug]` + root layout set `metadata`. Every
dashboard/admin/onboarding page (14 of them) inherits the root's
`{ default: title, template: "%s — Bias Market" }`.

### Plan

Dashboard/admin pages are behind auth (not indexed, `robots.txt` should
already exclude them — verify this while here, it wasn't checked in the
audit) so this is a UX nicety (browser tab title), not an SEO fix. Add a
static `export const metadata: Metadata = { title: "..." }` per page using
the existing `%s — Bias Market` template (so e.g. `title: "Products"` renders
as "Products — Bias Market"). This only works on pages that **aren't**
`"use client"` at the top level — every dashboard page currently is. Two
options:
- Split each page into a thin server `page.tsx` (holds `export const
  metadata`) that renders a `"use client"` inner component — matches the
  `layout.tsx`/page split some Next apps use, but is a real structural change
  to 14 files for a title-only win.
- Skip static `metadata` on client pages and instead set `document.title` via
  a tiny shared hook (`useDocumentTitle(title)`) — less idiomatic Next.js but
  far smaller diff, and this is explicitly a low-priority nicety per the
  priority section above.

Don't pick silently — this is a real fork with different cost/benefit, flag
it to the user before implementing either way.

---

## Part E — `features/collections`

### Current state

`collections/page.tsx` (249 lines) and `sections/page.tsx` (248 lines).
Both raw `apiFetch` + `useEffect`/`useState`, both use `useStore` from the
`lib/use-store.ts` shim (fold the Part I cleanup for these two files in here,
don't do it twice).

**Endpoints — collections:**
- `GET /stores/:storeId/collections` — list, `{ id, name, slug, description,
  products: [{ productId, position, product: { id, name } }] }`
- `POST /stores/:storeId/collections` body `{ name, description? }`
- `DELETE /stores/:storeId/collections/:id`
- `POST /stores/:storeId/collections/:id/products` body `{ productId }`
- `DELETE /stores/:storeId/collections/:id/products/:productId`
- `PATCH /stores/:storeId/collections/:id/products/reorder` body
  `{ productIds: string[] }` — full reordered id list, not a delta

**Endpoints — sections:**
- `GET /stores/:storeId/sections` — list, `{ id, type, collectionId,
  content, position }`, `type` is `"COLLECTION" | "BANNER" | "TEXT_BLOCK"`,
  `content` shape depends on `type` (`{}` for COLLECTION, `{ imageUrl,
  linkUrl? }` for BANNER, `{ body }` for TEXT_BLOCK) — model this as a
  discriminated union in zod (`z.discriminatedUnion("type", [...])`), don't
  leave `content` as `z.record(z.string(), z.unknown())` the way the old code
  did, this is a good case for the stricter schema.
- `POST /stores/:storeId/sections` body `{ type, collectionId?, content }`
- `DELETE /stores/:storeId/sections/:id`
- `PATCH /stores/:storeId/sections/reorder` body `{ sectionIds: string[] }`
- also calls `GET /stores/:storeId/collections` (read-only, for the
  COLLECTION-type dropdown) — reuse `collectionsApi.list` from this same
  feature rather than a second wrapper.

### The one thing to get right: reorder

Both reorder handlers do a **local array swap then PATCH the full reordered
id list, then reload from the server** — no optimistic-UI complexity like
orders' delayed-commit pattern, this is a plain `useMutation` that
invalidates on success. Keep it that way; don't import the
`useOptimisticStatusChange` pattern here, it solves a different problem
(delayed commit + undo), not reordering.

### Proposed layout

```
features/collections/
  schemas/
    collection.schema.ts       # collectionSchema, collectionListSchema
  api/
    collections.api.ts         # list, create, remove, addProduct, removeProduct, reorderProducts
  queries/
    use-collections.ts
  mutations/
    use-create-collection.ts
    use-delete-collection.ts
    use-add-collection-product.ts
    use-remove-collection-product.ts
    use-reorder-collection-products.ts
  components/
    collection-form.tsx        # name/description create form — RHF+zodResolver, first real form here
    collection-card.tsx        # one collection's product list + reorder/remove controls
  index.ts

features/sections/
  schemas/
    section.schema.ts          # discriminated union on `type`
  api/
    sections.api.ts
  queries/
    use-sections.ts
  mutations/
    use-create-section.ts
    use-delete-section.ts
    use-reorder-sections.ts
  components/
    section-form.tsx           # type-switched fields, RHF+zodResolver
    section-row.tsx
  index.ts                      # imports collectionsApi/useCollections from @/features/collections for the dropdown
```

Then both `collections/page.tsx` and `sections/page.tsx` shrink to
composition, same shape as the products/orders pages from the prior
migration stage.

---

## Part F — `features/checkout`

### Current state

`store/[slug]/checkout/page.tsx`, 221 lines. Cart itself is **not** an API
resource — `lib/cart.ts` reads/writes `localStorage` synchronously
(`getCart(slug)`, `clearCart(slug)`, `cartTotal`, `hasMixedCurrencies`). Only
delivery methods, pickup points, and the final checkout POST hit the API.

**Endpoints (all public, unauthenticated — storefront, not dashboard):**
- `GET /stores/:slug/public/delivery-methods`
- `GET /stores/:slug/public/pickup-points`
- `POST /stores/:slug/checkout` body `{ deliveryMethodType, pickupPointId?,
  customerName?, customerPhone, customerEmail?, items: [{ productId,
  variantId?, quantity }] }` → `{ order: { id, ... }, whatsappUrl? }`

### Decision: don't migrate `lib/cart.ts` into a feature

It's synchronous localStorage, not a TanStack Query concern — wrapping it in
`useQuery` would add indirection for no benefit (no network round-trip, no
cache invalidation story). Leave `lib/cart.ts` as-is; `features/checkout`
only owns the delivery-methods/pickup-points queries and the checkout
mutation, and takes the cart's `CartItem[]` as a plain prop/import from
`lib/cart.ts`, same as today.

### Form validation

`customerPhone` is required, `customerEmail` optional but should validate as
an email when present (today: no validation at all beyond browser-native
`type` attrs, which this page doesn't even use — plain `<input>`, not the UI
kit's `Input`). Good candidate for `react-hook-form` + `zodResolver` with a
real schema (`z.string().min(1)` for phone via `PhoneInput`'s `Controller`
pattern already established in `create-store-form.tsx`, `z.string().email()`
optional for email).

### Proposed layout

```
features/checkout/
  schemas/
    checkout.schema.ts   # checkoutFormSchema (customerName/phone/email/deliveryMethodType/pickupPointId)
  api/
    checkout.api.ts      # getDeliveryMethods, getPickupPoints, submit
  queries/
    use-delivery-options.ts   # bundles both GETs like products' "load both on mount" precedent
  mutations/
    use-submit-checkout.ts
  components/
    checkout-summary.tsx      # cart line items + total
    checkout-form.tsx         # RHF form
  index.ts
```

`checkout/page.tsx` shrinks to composition + the `orderId`/`items.length ===
0` branch states (page-specific, not worth extracting).

---

## Part G — `features/admin`

### Current state

`admin/inquiries/page.tsx` (145 lines): `GET /contact` (list), `PATCH
/contact/:id/review` (mark reviewed). `admin/stores/page.tsx` (122 lines):
`GET /stores` (list, admin-scoped — different from the per-store
`GET /stores/:storeId` used everywhere else), plus
`authClient.admin.impersonateUser({ userId })` — this one goes through
better-auth's client directly, **not** `apiFetch`, don't try to route it
through a feature `api/` wrapper, follow the existing pattern (see how
`features/auth` handles `authClient` calls, if it does — check before
assuming).

### Proposed layout

Both pages are small and admin-only; one feature, two independent api/query
pairs rather than forcing a shared abstraction between "contact inquiries"
and "store list + impersonate" (they don't share a resource):

```
features/admin/
  schemas/
    inquiry.schema.ts       # inquirySchema (status enum), inquiryListSchema
    admin-store.schema.ts   # adminStoreSchema (with nested owner), adminStoreListSchema
  api/
    inquiries.api.ts        # list, markReviewed
    admin-stores.api.ts     # list, impersonate (wraps authClient call for consistency, or leave impersonate as a direct authClient call in the component — decide based on what features/auth already does)
  queries/
    use-inquiries.ts
    use-admin-stores.ts
  mutations/
    use-mark-inquiry-reviewed.ts
  components/
    inquiries-table.tsx
    admin-stores-table.tsx
  index.ts
```

---

## Part H — Contact form (`components/marketing/contact-form.tsx`)

### Current state

Posts to the same `/contact` endpoint Part G's `inquiries.api.ts` will read
from, via raw `apiFetch`, native uncontrolled `<input>`s read through
`FormData` on submit, no zod, no `react-hook-form`.

### Decision: don't couple this to `features/admin`

The admin feature *reads and reviews* inquiries (authenticated, list shape
includes `status`/`createdAt`); this form *creates* one (public, unauthenticated,
narrower payload). Define the create-payload schema independently — don't
import `features/admin`'s `inquirySchema` and try to `.pick()` a subset,
that couples a public marketing component to an admin-only feature for no
real gain. This is small enough it doesn't need its own top-level
`features/contact` either — a reasonable exception to the standard layout:
put `features/contact/{schemas/inquiry-submission.schema.ts,
api/contact.api.ts, mutations/use-submit-inquiry.ts}` (no `queries/`, no
`components/` — the form itself can stay in `components/marketing/` since
it's presentation tied to the marketing page, matching AGENTS.md's "not
every feature needs every folder" allowance) or, if the user would rather
not stand up a whole feature folder for one mutation, a `contactApi` +
`useSubmitInquiry` living directly under `components/marketing/` — flag this
size judgment call rather than deciding unilaterally.

### Plan

Convert to `react-hook-form` + `zodResolver`: `name`/`email`/`message`
required (already `required` natively), `email` validated as email format,
`company` optional, `inquiryType` defaults to `"general"` (currently has no
default selected value — first `<option>` in the DOM wins by browser default,
which happens to be `"general"` today; make it explicit via
`defaultValues` instead of relying on DOM order).

---

## Part I — `lib/use-store.ts` shim cleanup

### Current state

4 files import `useStore` from `@/lib/use-store` instead of
`useDashboardStore` from `@/features/stores`: `settings/page.tsx`,
`components/dashboard/mobile-sidebar.tsx`, `store-sidebar.tsx`,
`store-theme-frame.tsx`. (Two more — `collections/page.tsx`,
`sections/page.tsx` — get this fixed as part of Part E, not counted here
again.)

### Plan

Mechanical one-line import swap in all 4 files (`useStore` → `useDashboardStore`,
update the destructured call site name). No behavior change — the shim is a
verbatim re-export. Lowest-risk part of this entire plan; fine to batch as
one small pass, doesn't need typecheck/test/build run in isolation before
the next part, just don't skip the final full-suite verification pass.

---

## After all parts land

- Update `apps/web/AGENTS.md`'s migration-roadmap section again — it already
  says (after the products/orders work) that the roadmap "has served its
  purpose" once every *major dashboard page* was migrated; this plan covers
  what's left including storefront/marketing/admin, so the roadmap section
  can likely be deleted at that point in favor of "fully migrated, see git
  history," matching what that section already floated as the eventual
  outcome.
- Re-run the full audit performed for this plan (grep for raw `<img>`,
  `apiFetch` outside `features/*/api/`, missing `index.ts` barrels, etc.) to
  confirm nothing was missed and nothing regressed.
