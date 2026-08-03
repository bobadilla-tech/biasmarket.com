# apps/web audit fixes — lint, route boundaries, images, metadata, remaining feature-slice migrations

## Context

This is a **forward-looking plan**, not a retrospective — it deliberately breaks
`docs/plans/README.md`'s "save after work lands" convention because the user
explicitly asked for a plan to be written up front, same precedent as
`docs/plans/2026-07-31-web-feature-sliced-migration-remaining-work.md`.

A full audit of `apps/web` (feature-slice compliance + general Next.js best
practices) turned up eight independent gaps, none blocking each other except
where noted. Findings, in the order they're addressed below:

1. **ESLint is completely dead across the whole monorepo.** No `lint` script in
   any of the 7 workspace packages' `package.json`, no eslint config file
   anywhere (not `.eslintrc*`, not `eslint.config.*`), no `eslint` /
   `eslint-config-next` devDependency anywhere — confirmed via
   `grep -rn '"lint"\|"eslint'` across every package and a literal `pnpm lint`
   run from root (`turbo run lint` → "0 successful, 0 total"). `CLAUDE.md`
   documents `pnpm lint` and per-package CI lint as if they run — they don't.
   This is a monorepo-wide gap; this plan scopes the **fix** to `apps/web` only
   (matches what was asked), and calls out the same gap in
   `apps/api`/`packages/*` as an explicit follow-up, not silently expanded
   scope.
2. Zero `loading.tsx` / `error.tsx` / `not-found.tsx` anywhere in `app/`.
3. Zero `next/image` usage (13 files, all raw `<img>`), and `next.config.ts` has
   no `images.remotePatterns` configured, so `next/image` can't be dropped in
   without that config landing first.
4. Per-page `metadata` exists on only 4 `page.tsx` files (`contact`,
   `enterprise`, `founder`, `store/[slug]`) — notably **not** the marketing
   homepage, the single highest-value SEO page on the site. Everything else
   inherits the root `[locale]/layout.tsx`'s default title. Separately,
   `app/robots.ts` disallows `/dashboard*` and a few other auth-gated routes but
   **not `/admin`** — `/admin/inquiries` and `/admin/stores` are currently
   crawlable, and their layout has no client-side auth/role guard either.
5. `features/collections` doesn't exist — `collections/page.tsx` (249 lines) and
   `sections/page.tsx` (248 lines) still use raw `apiFetch` +
   `useEffect`/`useState`.
6. `features/checkout` doesn't exist — `store/[slug]/checkout/page.tsx` (221
   lines) still does, same pattern. This is the customer-facing purchase flow,
   the highest-stakes of the unmigrated pages.
7. No `features/admin` — `admin/inquiries/page.tsx` (145 lines),
   `admin/stores/page.tsx` (122 lines), and `admin/users/page.tsx` (134 lines,
   landed mid-audit — re-grep `admin/` at implementation time, this is exactly
   the kind of concurrent drift Part D already has to account for), same
   pattern.
8. `components/marketing/contact-form.tsx` (134 lines) posts to the same
   `/contact` endpoint `admin/inquiries` reads from, via raw `apiFetch`, no zod
   validation, no `react-hook-form`.
9. (Minor, folded into whichever part touches each file) `settings/page.tsx` and
   3 dashboard-chrome components (`mobile-sidebar.tsx`, `store-sidebar.tsx`,
   `store-theme-frame.tsx`) still import the `lib/use-store.ts` compat shim
   instead of `@/features/stores` directly. Functionally identical (the shim is
   a thin re-export per `apps/web/AGENTS.md` step 5) — cosmetic, not a bug.

Everything below follows the shape established in the two prior migration plan
docs: current-state inventory → proposed layout → hard parts flagged →
verification. **Re-read the actual files before editing** — this doc was written
2026-08-02; line numbers and endpoint shapes may have drifted by the time each
part is picked up.

### Priority (for sequencing, not for the plan-review pass below)

- **High**: Part A (ESLint) — foundational, catches regressions in every part
  after it. Part F (checkout) — customer-facing correctness.
- **Medium**: Part B (route boundaries), Part E (collections/sections), Part G
  (admin).
- **Low**: Part C (next/image — blocked on an infra decision, see below), Part D
  (metadata), Part H (contact form), Part I (use-store shim cleanup).

### Verification (per part, same pattern as prior migration plans)

1. `pnpm turbo run typecheck --filter=web`
2. `pnpm --filter web test` (add schema/api/mutation tests per the existing
   style — see `features/store-settings/api/settings.api.test.ts` for multi-call
   bundling, `features/orders/mutations/use-optimistic-status-change.test.tsx`
   for a hook-with-timers example)
3. `pnpm turbo run build --filter=web`
4. For Part A specifically: `pnpm turbo run lint --filter=web` must exit 0
5. No live smoke test unless the sandbox has seeded DB access — flag explicitly
   if still not possible, don't claim it was tested if it wasn't

---

## Part A — ESLint for `apps/web`

### Current state

Nothing. No config, no script, no dependency, confirmed by direct `pnpm lint`
run (0 tasks executed).

### Real blocker — resolve with a spike before scoping the rest of this part

`apps/web` (and the repo root) pins `typescript@7.0.2` — the native/"tsgo"
preview line, not classic TypeScript. Confirmed directly
(`node -e "console.log(Object.keys(require('typescript')))"` inside `apps/web`):
the package exports only `{ version,
versionMajorMinor }` — **no
`createSourceFile`, `SyntaxKind`, `createProgram`, none of the classic compiler
API.** `next.config.ts` already documents this exact fact to justify disabling
Next's build-time typecheck (`ignoreBuildErrors: true`, with `pnpm typecheck` /
`tsc --noEmit` as the real source of truth instead).

`typescript-eslint` — a hard dependency of `eslint-config-next/typescript`, and
also used by the _base_ `eslint-config-next` config for every `.ts`/ `.tsx` file
even without the `/typescript` add-on — needs that classic API
(`@typescript-eslint/typescript-estree` calls into `ts.createSourceFile` etc. to
parse) to work at all. As scoped naively, `eslint .` would very likely error out
immediately on the first TypeScript file, not "run and surface findings to
triage."

**Before writing any config**, spike it: `pnpm add -D eslint
eslint-config-next`
in `apps/web`, write a minimal `eslint.config.mjs` importing just
`eslint-config-next/core-web-vitals` (see setup below), and run `eslint` against
one `.tsx` file. See what actually happens, then pick one of:

- It works fine (maybe `@typescript-eslint/typescript-estree` only needs the
  subset of the API that happens to still be present, or falls back to a
  pure-syntax mode) — proceed as planned below.
- It errors — decide between (a) pinning a second, classic `typescript` version
  scoped only to lint tooling (pnpm workspaces can isolate a package-local
  dependency resolution via an alias, e.g. a devDependency entry like
  `"typescript-classic": "npm:typescript@^5"` wired through ESLint's parser
  options — unverified, would need its own small proof-of-concept, don't assume
  it works), or (b) skip `eslint-config-next/typescript`'s type-aware rules and
  see if the base `core-web-vitals` config's non-type-aware rules still run (may
  also fail at the parser level, same root cause — verify, don't assume either
  way).

Don't skip this and just wire the config blind — it's the one thing in this
whole plan most likely to make Part A simply not work when landed.

### Setup (once the spike above confirms a working path)

1. Add `eslint`, `eslint-config-next` (pin to the exact installed `next` major —
   check `apps/web/package.json`) as devDependencies to `apps/web`.
2. Add `apps/web/eslint.config.mjs`. **Not** `FlatCompat`/`@eslint/eslintrc` —
   the installed `eslint-config-next@16.x` already ships native ESLint 9
   flat-config exports (confirmed against the locally-bundled Next.js docs at
   `node_modules/next/dist/docs/.../03-eslint.md`, which also notes `next lint`
   itself was removed in Next 16 — this is genuinely the simplest it's ever
   been, don't add compat-layer machinery that isn't needed):
   ```js
   import { defineConfig, globalIgnores } from "eslint/config";
   import nextVitals from "eslint-config-next/core-web-vitals";
   import nextTs from "eslint-config-next/typescript"; // if the spike above says this is viable

   export default defineConfig([
     ...nextVitals,
     ...nextTs,
     globalIgnores([".next/**", "next-env.d.ts"]),
   ]);
   ```
3. Add `"lint": "eslint ."` to `apps/web/package.json`'s scripts.
4. `turbo.json` already has a root `lint: {}` pipeline entry (confirmed) — no
   turbo config change needed, it'll just stop being a no-op for `web` once the
   script exists.
5. **Run it and triage what surfaces before calling this part done — don't
   commit to fixing every violation blind.** A first-time lint pass on ~150
   existing files will likely surface real findings (unused imports,
   `react-hooks/exhaustive-deps` gaps the codebase currently silences with
   inline comments in several places — e.g. every `load()` `useEffect` in the
   unmigrated pages from Part E–H — `<img>` warnings if `next/core-web-vitals`
   flags them ahead of Part C landing, etc). Split the result:
   - Auto-fixable (`eslint . --fix`): apply directly.
   - Small, mechanical, unrelated to other parts of this plan: fix inline.
   - Everything else: leave as-is _if_ the violating file is already slated for
     a rewrite in Parts E–I (no point double-fixing code about to be deleted);
     otherwise list it as a follow-up item in the PR description rather than
     scope-creeping this part into a full-codebase lint pass.
6. `eslint-plugin-react-hooks`'s current recommended config ships
   `exhaustive-deps` as `warn`, not `error` (confirmed against the installed
   package) — the codebase's existing pattern of inline
   `// eslint-disable-next-line react-hooks/exhaustive-deps` on intentional
   mount-only effects (every `load()` effect across the app) won't break the
   lint gate either way, but keep the inline disables as-is rather than
   restructuring working effects to chase a clean `--max-warnings 0`, unless
   that's explicitly what's wanted.

Note: `apps/web/package.json` doesn't set `"type": "module"` (also missing on
`packages/ui`, so not literally universal, but true for `apps/web` specifically
despite `CLAUDE.md`'s "ESM only" rule) — doesn't affect this part,
`eslint.config.mjs`'s `.mjs` extension forces ESM regardless of the nearest
`package.json`'s `type` field, but flagging so it doesn't look like an oversight
later.

### Follow-up (explicitly out of scope here)

`apps/api` and `packages/{db,i18n,types,ui,utils}` have the identical
no-lint-tooling gap. Not touched by this plan — flag to the user as a separate,
smaller follow-up once Part A's `apps/web` config proves out the pattern (NestJS
would need `eslint-config-next`'s equivalent, e.g. `typescript-eslint` directly,
since `eslint-config-next` is Next-specific). One asymmetry worth noting for
whoever picks up that follow-up: `apps/api` pins classic `typescript@5.9.3`
(`typescript-eslint`-compatible), unlike `apps/web` and every `packages/*` above
which pin `^7.0.2` — the compiler-API blocker this part's spike exists to
de-risk is `apps/web`-and- `packages/*`-specific, `apps/api`'s follow-up likely
won't hit it.

---

## Part B — Route-level `loading.tsx` / `error.tsx` / `not-found.tsx`

### Current state

Zero of any of these anywhere in `app/`. Every page manages its own
`isPending`/`error` JSX branch instead (the TanStack Query pattern established
across the migrated features).

### Plan

Given the client-fetched-data architecture, route boundaries still earn their
keep for two things route-local `isPending` state can't cover: instant nav
feedback before the page's JS/hydration finishes, and catching render-time
exceptions (a `.map` over `undefined`, a bad zod parse that wasn't caught, etc.)
that today would just white-screen.

1. One shared set at `app/[locale]/loading.tsx`, `app/[locale]/error.tsx`,
   `app/[locale]/not-found.tsx` — App Router boundary inheritance means these
   cover every route under `[locale]` — the four route groups (`(marketing)`,
   `(onboarding)`, `(dashboard)`, `(storefront)`), including `admin/` which is a
   subtree of `(dashboard)`, not a fifth peer group — unless a more specific one
   is added later. Start with one set, not four — don't build per-route-group
   variants speculatively; revisit only if the shared design genuinely doesn't
   fit a section (e.g. dashboard wanting the sidebar to stay mounted during the
   loading state, which a `[locale]`-level boundary can't do since it replaces
   everything below the locale layout — flag this specific limitation to the
   user if it turns out dashboard needs its own `(dashboard)/loading.tsx`
   instead; don't silently decide either way).
2. `error.tsx` **must** be a Client Component (Next.js requirement) — receives
   `error: Error & { digest?: string }` and `reset: () => void`. Follow the
   existing `components/shared/error-state.tsx` visual pattern if it's reusable
   here (check its props first — it's built for inline query-error states, not
   necessarily a full-page boundary, so this may need its own design rather than
   reusing that component as-is).
3. `loading.tsx` similarly can reuse `components/shared/loading-state.tsx`'s
   visual language.
4. `not-found.tsx` — check what `notFound()` calls already exist (the root
   layout calls it for an invalid locale) and make sure this new file doesn't
   change that existing behavior, just gives it a real page instead of Next's
   default.

---

## Part C — `next/image` adoption

### Current state

13 files with raw `<img>`:
`app/[locale]/(dashboard)/dashboard/[slug]/products/[productId]/page.tsx`,
`app/[locale]/(storefront)/store/[slug]/page.tsx`, `product-card.tsx`,
`components/marketing/footer.tsx`, `components/marketing/navbar.tsx`,
`components/store-logo.tsx`, and 7 files under `features/orders`/
`features/products`. `next.config.ts` has no `images` block at all.

### Image host — not actually an open question

Product/variant/payment-proof images are served from S3-compatible storage
(MinIO) via `S3_PUBLIC_URL`. That value differs by environment but both values
are already fixed and documented, no new env plumbing needed:

- **Dev**: `http://localhost:9000` (`infra/docker/.env.example` line 60 —
  MinIO's direct port).
- **Prod**: `https://cdn.biasmarket.com` (`infra/caddy/Caddyfile` — a dedicated
  Caddy host proxying MinIO's S3 API port 9000 only, not the admin console; also
  documented in `docs/core/deploy.md`).

`images.remotePatterns` takes an array — list both entries statically in
`next.config.ts`, no per-environment env var or build-time injection needed
(Next.js checks the actual image URL's host against every pattern in the array
at request time, regardless of which environment built the bundle):

```ts
images: {
  remotePatterns: [
    { protocol: "http", hostname: "localhost", port: "9000" },
    { protocol: "https", hostname: "cdn.biasmarket.com" },
  ],
},
```

### Plan

1. Add the `images.remotePatterns` config above to `next.config.ts`.
2. **Carve out the `blob:` preview cases first, don't run them through the
   generic S3-remotePatterns conversion below.** Three call sites render
   client-generated `URL.createObjectURL(file)` previews for in-progress
   uploads, not remote S3 images:
   `features/products/components/
   product-sheet.tsx` (product image preview,
   and the per-variant image preview inside the variants-preview loop — two
   separate `<img>`s) and `features/orders/components/register-payment-form.tsx`
   (payment-proof preview). `next/image`'s `remotePatterns` only validates
   `http`/`https` URLs against a hostname allowlist — a `blob:` src fails
   outright. Either leave these three as raw `<img>` (acceptable exception,
   they're short-lived local previews, not the S3-hosted persisted images the
   rest of this part is about) or use `next/image` with the `unoptimized` prop
   if converting them anyway for consistency — don't silently break upload
   previews by treating them the same as the other 10 files.
3. Convert the other 11 files: pick explicit `width`/`height` where the original
   had a fixed size class (most do — e.g. `size-10`, `size-20`, `h-36 w-full`),
   or `fill` + a sized wrapper where the original used
   `aspect-square`/`object-cover` on a fluid container. Preserve existing `alt`
   text exactly — several call sites already have empty `alt=""` for decorative
   images (e.g. payment-proof thumbnails); don't add alt text where the original
   deliberately had none.
4. Re-run the visual smoke check mentioned in the top-level verification section
   if the sandbox allows it — `next/image` layout behavior (especially `fill`
   containers) is exactly the kind of thing that reads fine in code and breaks
   visually.

---

## Part D — Per-page `metadata` + `robots.txt` admin gap

### Current state

Only 4 `page.tsx` files set their own `metadata` today: `(marketing)/contact`,
`/enterprise`, `/founder`, `store/[slug]`. The root `[locale]/layout.tsx`
separately sets the `{ default, template: "%s — Bias Market" }` everything else
inherits. **The marketing homepage itself (`(marketing)/page.tsx`) has none** —
it's the single highest-value SEO page on the site and is currently excluded
from this gap's framing entirely; it belongs in this part's scope, not treated
as already-covered.

**Don't trust a total page count copied from this doc** — this repo has other
sessions actively landing pages concurrently while this plan sits unimplemented
(confirmed: `find app -name page.tsx | wc -l` returned 26 when this doc's first
draft was reviewed and 29 an hour later, same day, no implementation work done
on this plan in between). Re-run `find app -name page.tsx` at implementation
time and treat every page without its own `metadata` export as in scope for the
"static per-page title" pass below, rather than working off a number written
here. One concrete exclusion regardless of count: `admin/page.tsx` is a pure
`redirect()` stub with no rendered content — skip it, it doesn't need metadata.

Every dashboard/admin/onboarding page, plus 3 of the 4 storefront pages
(everything except `store/[slug]` itself), inherits the root default title.

**Separate but adjacent finding, fix in this same part since it's the same
"what's crawlable" question**: `app/robots.ts` disallows `/login`,
`/onboarding*`, `/dashboard*`, `/store/*/cart`, `/store/*/checkout` — but **not
`/admin`**. `/admin/inquiries` and `/admin/stores` are currently
crawlable/indexable. Add `/*/admin`, `/*/admin/*` to the `disallow` list. Also:
`app/[locale]/(dashboard)/admin/layout.tsx` has **no auth/role guard at all** —
no redirect check, nothing gating `children`. Data itself doesn't leak
(`GET /stores` and `GET /contact` are both `@Roles(['admin'])`-guarded
server-side, same protection level), so this isn't a data exposure bug, but any
authenticated non-admin user can currently navigate to `/admin/*` and see the
page shell (empty tables, likely a raw 403 message inside the error banner
instead of a clean redirect). Worth a client-side guard (redirect non-admins to
`/dashboard`) — fold into Part G since that's already touching these two pages,
don't make it a separate part.

### Plan

Dashboard/admin pages are behind auth so per-page metadata here is a UX nicety
(browser tab title), not an SEO fix — the homepage is the real SEO gap and
should get a full `generateMetadata` (or static `metadata`) matching the root
layout's OG/Twitter pattern, not just a title.

For every other page without its own `metadata` (everything except the homepage,
which gets the fuller OG treatment above, and the `admin/page.tsx` redirect
stub, which gets none): add a static
`export const metadata: Metadata = { title: "..." }` per page using the existing
`%s — Bias Market` template (so e.g. `title: "Products"` renders as "Products —
Bias Market"). This only works on pages that **aren't** `"use client"` at the
top level — every dashboard page currently is. Two options:

- Split each page into a thin server `page.tsx` (holds
  `export const
  metadata`) that renders a `"use client"` inner component —
  matches the `layout.tsx`/page split some Next apps use, but is a real
  structural change across every affected file for a title-only win.
- Skip static `metadata` on client pages and instead set `document.title` via a
  tiny shared hook (`useDocumentTitle(title)`) — less idiomatic Next.js but far
  smaller diff, and this is explicitly a low-priority nicety per the priority
  section above.

Don't pick silently — this is a real fork with different cost/benefit, flag it
to the user before implementing either way.

---

## Part E — `features/collections`

### Current state

`collections/page.tsx` (249 lines) and `sections/page.tsx` (248 lines). Both raw
`apiFetch` + `useEffect`/`useState`, both use `useStore` from the
`lib/use-store.ts` shim (fold the Part I cleanup for these two files in here,
don't do it twice).

**Endpoints — collections**
(`apps/api/src/modules/collections/collections.controller.ts`):

- `GET /stores/:storeId/collections` — list. Response nests the **full**
  `Product` record under `product` (`CollectionsService.findAllForStore` uses
  Prisma `include: { product: true }`, no `select` — price/stock/currency/
  categoryId etc. all come back, not just `{ id, name }`). zod's default
  `z.object()` strip mode means over-modeling isn't a crash risk either way;
  deliberately scope `collectionSchema`'s nested product shape to only the
  fields the UI actually uses (`{ id, name }`, same as the old page's local
  `Product` interface) rather than either re-declaring every field or leaving a
  vague `z.record`.
- `GET /stores/:storeId/products` — **also called by the old page** (for the
  "add product to collection" dropdown), currently missing from this inventory
  in an earlier draft. `features/products` already exports a ready-made
  `useProducts(storeId)` for this exact data (`features/products/index.ts`) —
  import and reuse it, don't add a second wrapper around the same endpoint (same
  cross-feature-reuse call the sections endpoints below make for
  `useCollections`).
- `POST /stores/:storeId/collections` body `{ name, description? }`
- `PATCH /stores/:storeId/collections/:collectionId` body `UpdateCollectionDto`
  (name/description) — **not currently called by the old page** (no edit UI
  exists today) but exists on the API; decide whether to wire an edit affordance
  while migrating or leave it unused for now like the old page did — don't
  silently add scope, flag the choice.
- `DELETE /stores/:storeId/collections/:collectionId`
- `POST /stores/:storeId/collections/:collectionId/products` body
  `{ productId, position? }` — `position` is optional on
  `AddCollectionProductDto`, the old page never sends it (appends via whatever
  the service defaults to); preserve that, don't start sending a computed
  position unless asked.
- `DELETE /stores/:storeId/collections/:collectionId/products/:productId`
- `PATCH /stores/:storeId/collections/:collectionId/products/reorder` body
  `{ productIds: string[] }` — full reordered id list, not a delta

**Endpoints — sections**
(`apps/api/src/modules/store-sections/store-sections.controller.ts`):

- `GET /stores/:storeId/sections` — list,
  `{ id, type, collectionId,
  content, position }`, `type` is
  `"COLLECTION" | "BANNER" | "TEXT_BLOCK"`, `content` shape depends on `type`
  (`{}` for COLLECTION, `{ imageUrl,
  linkUrl? }` for BANNER, `{ body }` for
  TEXT_BLOCK) — model this as a discriminated union in zod
  (`z.discriminatedUnion("type", [...])`), don't leave `content` as
  `z.record(z.string(), z.unknown())` the way the old code did, this is a good
  case for the stricter schema. The BANNER branch should also allow an optional
  `alt: z.string().optional()` — the live storefront renderer
  (`store/[slug]/page.tsx`) already reads `section.content.alt` even though the
  dashboard editor never sets it today; leaving it out of the schema wouldn't
  break anything at runtime (zod strips unknown keys by default), but would
  misdescribe the real content shape if an edit affordance for banners gets
  built against this schema later.
- `POST /stores/:storeId/sections` body `{ type, collectionId?, content }`
- `PATCH /stores/:storeId/sections/:sectionId` body `UpdateStoreSectionDto` —
  same as collections' update: exists on the API, no edit UI in the old page,
  same "flag before adding scope" call.
- `DELETE /stores/:storeId/sections/:sectionId`
- `PATCH /stores/:storeId/sections/reorder` body `{ sectionIds: string[] }`
- also calls `GET /stores/:storeId/collections` (read-only, for the
  COLLECTION-type dropdown) — reuse `collectionsApi.list` from this same feature
  rather than a second wrapper.

### The one thing to get right: reorder

Both reorder handlers do a **local array swap then PATCH the full reordered id
list, then reload from the server** — no optimistic-UI complexity like orders'
delayed-commit pattern, this is a plain `useMutation` that invalidates on
success. Keep it that way; don't import the `useOptimisticStatusChange` pattern
here, it solves a different problem (delayed commit + undo), not reordering.

### Proposed layout

```
features/collections/
  schemas/
    collection.schema.ts       # collectionSchema, collectionListSchema
  api/
    collections.api.ts         # list, create, update, remove, addProduct, removeProduct, reorderProducts
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

Then both `collections/page.tsx` and `sections/page.tsx` shrink to composition,
same shape as the products/orders pages from the prior migration stage.

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
- `POST /stores/:slug/checkout` body
  `{ deliveryMethodType, pickupPointId?,
  customerName?, customerPhone, customerEmail?, items: [{ productId,
  variantId?, quantity }] }`
  → `{ order: { id, ... }, whatsappUrl:
  string | null }`. **`whatsappUrl` is
  `null`, never `undefined`, when the store has no WhatsApp number configured**
  (confirmed in `create-order.usecase.ts`:
  `store.whatsappNumber ? buildWhatsAppUrl(...) :
  null`). Model this in the
  zod response schema as `.nullable()`, **not** `.optional()` —
  `features/*/api/*.ts` schemas call `schema.parse()` (throws on mismatch, per
  AGENTS.md's validation rule), so an `.optional()` field would throw on every
  completed checkout for a store without WhatsApp configured, in the plan's own
  highest-stakes customer-facing flow. Follow `order.schema.ts`'s existing
  `customerName: z.string()
  .nullable()` precedent.

### Decision: don't migrate `lib/cart.ts` into a feature

It's synchronous localStorage, not a TanStack Query concern — wrapping it in
`useQuery` would add indirection for no benefit (no network round-trip, no cache
invalidation story). Leave `lib/cart.ts` as-is; `features/checkout` only owns
the delivery-methods/pickup-points queries and the checkout mutation, and takes
the cart's `CartItem[]` as a plain prop/import from `lib/cart.ts`, same as
today.

### Form validation

`customerPhone` is required, `customerEmail` optional but should validate as an
email when present (today: no validation at all beyond browser-native `type`
attrs, which this page doesn't even use — plain `<input>`, not the UI kit's
`Input`). Good candidate for `react-hook-form` + `zodResolver` with a real
schema (`z.string().min(1)` for phone via `PhoneInput`'s `Controller` pattern
already established in `create-store-form.tsx`, `z.string().email()` optional
for email).

### Page-specific state that must survive the migration, not just the two

### terminal branches

This is more than "orderId / empty-cart branches" — carry all of these through
explicitly, they're easy to drop silently when re-deriving the form from a
schema:

- **Mixed-currency guard** (`hasMixedCurrencies(items)`): disables submit and
  shows a warning banner. Computed from cart contents, not form state — stays
  outside the RHF schema, feeds into the submit button's `disabled` the same way
  it does today.
- **`deliveryMethodsLoaded` flag**: today the "no delivery method available"
  warning only renders _after_ the delivery-methods fetch settles (tracked via a
  separate boolean, not just `deliveryMethods.length === 0`, to avoid flashing
  the warning during the initial load). Map this to the query's
  `isSuccess`/`isPending`, not a re-invented boolean.
- **Default-selection on load**: the first delivery method and first pickup
  point are auto-selected once their queries resolve
  (`if (methods[0]) setDeliveryMethodType(methods[0].type)` / same for pickup
  points) — reproduce via the query's `onSuccess`/an effect that seeds RHF's
  `reset()`/`setValue()` once data arrives, not a naive `defaultValues` (data
  isn't available at mount time).
- **Conditional pickup-point requirement**: submit is disabled when
  `deliveryMethodType === "PICKUP" && pickupPoints.length > 0 && !pickupPointId`
  — i.e. pickup point is only required if the store actually _has_ pickup points
  configured. Model this as a `.refine()` on the schema keyed off the loaded
  pickup-points list, not a hardcoded requirement.

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
0`
branch states (page-specific, not worth extracting).

---

## Part G — `features/admin`

### Current state

**Re-grep `admin/` before starting — a third page landed after this plan's first
draft.** As of this revision there are three unmigrated admin pages, not two
(same concurrent-drift caution as Part D's page count: this repo has other
sessions actively landing pages while this plan sits unimplemented).

`admin/inquiries/page.tsx` (145 lines): `GET /contact` (list),
`PATCH
/contact/:id/review` (mark reviewed) — both `@Roles(['admin'])`-guarded
on `contact.controller.ts`, same protection level as `GET /stores` below (not
merely session-authenticated). `admin/stores/page.tsx` (122 lines):
`GET /stores` (list, `@Roles(['admin'])`-guarded on `stores.controller.ts` —
this is the only store-list endpoint, there's no separate
`GET /stores/:storeId`; the per-store detail fetch used elsewhere in the app is
`GET /stores/by-slug/:slug`, a different resource shape, don't conflate the
two), plus `authClient.admin.impersonateUser({ userId })` — this one goes
through better-auth's client directly, **not** `apiFetch`. Confirmed precedent:
`features/auth/components/login-form.tsx` already calls
`authClient.signIn.email(...)` directly, not through an `api/` wrapper — do the
same here, don't invent a wrapper for a single better-auth client call.

`admin/users/page.tsx` (134 lines, committed `9a0b033 feat: admin users
table` —
landed mid-audit, wasn't in this plan's original scope): lists users via
`authClient.admin.listUsers({ query: { limit: 100, sortBy:
"createdAt", sortDirection: "desc" } })`
(direct better-auth call, same pattern as impersonate above) plus
`GET /admin/users/store-counts` (a `apiFetch` call — per-user store counts,
`{ userId, storeCount }[]`, zipped into a `Record<string, number>` client-side),
and `authClient.admin.banUser`/`unbanUser({ userId })` to toggle ban state. Ban
button is disabled while pending and for `user.role === "admin"` (can't ban
another admin) — preserve that guard exactly.

**Also fold in here** (surfaced during the Part D audit): `admin/layout.tsx` has
no auth/role guard — add a client-side check that redirects non-admin sessions
to `/dashboard` (check how the session/role is read elsewhere, e.g.
`authClient.useSession()` in `store-sidebar.tsx`, for the existing pattern
rather than inventing a new one), and add `/*/admin`, `/*/admin/*` to
`app/robots.ts`'s `disallow` list.

### Proposed layout

All three pages are small and admin-only; one feature, three independent
api/query pairs rather than forcing a shared abstraction between "contact
inquiries," "store list + impersonate," and "user list + ban" (none of them
share a resource):

```
features/admin/
  schemas/
    inquiry.schema.ts       # inquirySchema (status enum), inquiryListSchema
    admin-store.schema.ts   # adminStoreSchema (with nested owner), adminStoreListSchema
    admin-user.schema.ts    # adminUserSchema, storeCountSchema/storeCountListSchema
  api/
    inquiries.api.ts        # list, markReviewed
    admin-stores.api.ts     # list, impersonate (wraps authClient call for consistency, or leave impersonate as a direct authClient call in the component — decide based on what features/auth already does)
    admin-users.api.ts      # getStoreCounts (the one apiFetch call); listUsers/ban/unban likely stay direct authClient calls in the component or a thin mutation wrapper, not a schema.parse()-validated api/ call, since better-auth's admin client already returns typed data — don't force zod validation onto a response this feature doesn't control the shape of
  queries/
    use-inquiries.ts
    use-admin-stores.ts
    use-admin-users.ts       # bundles listUsers + getStoreCounts like products' "load both on mount" precedent
  mutations/
    use-mark-inquiry-reviewed.ts
    use-toggle-user-ban.ts
  components/
    inquiries-table.tsx
    admin-stores-table.tsx
    admin-users-table.tsx
  index.ts
```

---

## Part H — Contact form (`components/marketing/contact-form.tsx`)

### Current state

Posts to the same `/contact` endpoint Part G's `inquiries.api.ts` will read
from, via raw `apiFetch`, native uncontrolled `<input>`s read through `FormData`
on submit, no zod, no `react-hook-form`.

### Decision: don't couple this to `features/admin`

The admin feature _reads and reviews_ inquiries (authenticated, list shape
includes `status`/`createdAt`); this form _creates_ one (public,
unauthenticated, narrower payload). Define the create-payload schema
independently — don't import `features/admin`'s `inquirySchema` and try to
`.pick()` a subset, that couples a public marketing component to an admin-only
feature for no real gain. This is small enough it doesn't need its own top-level
`features/contact` either — a reasonable exception to the standard layout: put
`features/contact/{schemas/inquiry-submission.schema.ts,
api/contact.api.ts, mutations/use-submit-inquiry.ts}`
(no `queries/`, no `components/` — the form itself can stay in
`components/marketing/` since it's presentation tied to the marketing page,
matching AGENTS.md's "not every feature needs every folder" allowance) or, if
the user would rather not stand up a whole feature folder for one mutation, a
`contactApi` + `useSubmitInquiry` living directly under `components/marketing/`
— flag this size judgment call rather than deciding unilaterally.

### Plan

Convert to `react-hook-form` + `zodResolver`: `name`/`email`/`message` required
(already `required` natively), `email` validated as email format, `company`
optional, `inquiryType` defaults to `"general"` (currently has no default
selected value — first `<option>` in the DOM wins by browser default, which
happens to be `"general"` today; make it explicit via `defaultValues` instead of
relying on DOM order).

---

## Part I — `lib/use-store.ts` shim cleanup

### Current state

5 files import `useStore` from `@/lib/use-store` instead of `useDashboardStore`
from `@/features/stores`: `settings/page.tsx`, `notifications/page.tsx`,
`components/dashboard/mobile-sidebar.tsx`, `store-sidebar.tsx`,
`store-theme-frame.tsx`. (Two more — `collections/page.tsx`, `sections/page.tsx`
— get this fixed as part of Part E, not counted here again.)

### Plan

Mechanical one-line import swap in all 5 files (`useStore` →
`useDashboardStore`, update the destructured call site name). No behavior change
— the shim is a verbatim re-export. Lowest-risk part of this entire plan; fine
to batch as one small pass, doesn't need typecheck/test/build run in isolation
before the next part, just don't skip the final full-suite verification pass.

---

## After all parts land

- Update `apps/web/AGENTS.md`'s migration-roadmap section again — it already
  says (after the products/orders work) that the roadmap "has served its
  purpose" once every _major dashboard page_ was migrated; this plan covers
  what's left including storefront/marketing/admin, so the roadmap section can
  likely be deleted at that point in favor of "fully migrated, see git history,"
  matching what that section already floated as the eventual outcome.
- Re-run the full audit performed for this plan (grep for raw `<img>`,
  `apiFetch` outside `features/*/api/`, missing `index.ts` barrels, etc.) to
  confirm nothing was missed and nothing regressed. Note: `app/sitemap.ts` and
  `store/[slug]/{page.tsx,layout.tsx}` do raw server-side `fetch()` calls (not
  `apiFetch`) for SSR metadata/theme-config — a `grep`-for- `apiFetch`-only pass
  won't catch these, and they're architecturally a different pattern (SSR data
  fetch feeding `generateMetadata`, not client TanStack Query) rather than
  migration debt this plan's parts are about — don't assume they need touching
  just because they surface in a broader raw-`fetch` grep.
