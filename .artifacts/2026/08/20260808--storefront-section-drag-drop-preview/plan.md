# Storefront section builder: drag-and-drop reorder + live split-screen preview

## Context

The public storefront (e.g. `/store/demo-kpop-corner`) renders seller-defined
sections (banner, catalog/collection, text block) in an order backed by
`StoreSection.position` (`packages/db/prisma/schema.prisma:191-211`,
`enum StoreSectionType { COLLECTION, BANNER, TEXT_BLOCK }`, dense integer
`position` per store, `@@index([storeId, position])`). Reported problem: sellers
technically already have a way to reorder sections, but it's not intuitive, and
there's no live preview like the one already used during onboarding — the
request is to add a proper two-pane drag-and-drop builder (section tiles on one
side, live-updating preview on the other) plus the ability to hide the banner
entirely and add multiple secondary banners/images.

Confirmed by direct investigation:

- **Backend CRUD/reorder already exists**, but had a real tenant-isolation gap
  found and fixed during this planning session (not hypothetical — fixed
  directly, see Status section below): `store-sections.controller.ts:37` has
  full CRUD (`POST /`, `GET /`, `PATCH /:sectionId`, `DELETE /:sectionId`) plus
  a dedicated `PATCH /reorder` (lines 64-76) taking
  `ReorderStoreSectionsDto { sectionIds: string[] }`. `reorder()` previously
  only called `assertOwnership(storeId, userId)` and then updated every
  `sectionId` in the payload by raw `id`, without checking each one actually
  belonged to `storeId` — unlike `update()`/`delete()`, which route through
  `findOwnedSection()`. A malicious or buggy client could have passed another
  store's section id and repositioned it, violating CLAUDE.md's "every query
  touching tenant data filters by storeId" hard rule. **Already fixed**:
  `reorder()` now `findMany`s the given `sectionIds` scoped to `storeId` first
  and throws `BadRequestException` if any id doesn't belong, before running the
  transaction; a regression test covers the rejection case. This module is
  already Orval-migrated (tag `StoreSections`), so new UI calls
  `apiClient.storeSections.*` directly — no _further_ backend changes are needed
  for drag-and-drop reordering, hide/show, or adding more sections beyond what's
  covered in "Approach" below (the `hidden` column).
- **Current seller UI is the "not intuitive" one being replaced**:
  `apps/web/app/[locale]/(dashboard)/dashboard/[slug]/sections/sections-page-client.tsx`
  - `apps/web/features/sections/` (`queries/use-sections.ts`,
    `mutations/use-reorder-sections.ts`, `components/section-row.tsx`) — a plain
    `<table>` with up/down-arrow buttons calling
    `reorderSections.mutateAsync(items.map(i => i.id))`. This is the page to
    rework, not replace wholesale — the query/mutation hooks stay, only the
    interaction model and the addition of a preview pane change.
- **No drag-and-drop library is installed anywhere in `apps/web`**
  (`grep -n "dnd\|sortable\|drag" apps/web/package.json` — no matches). This
  needs a new dependency: `@dnd-kit/core` + `@dnd-kit/sortable` (the standard,
  actively-maintained React DnD toolkit — accessible, React-18-safe, and the de
  facto default for this exact "reorderable list of tiles" use case).
- **There is no existing reusable "live preview" component to lean on** —
  contrary to the assumption in the report that one already exists and could
  just be reused. What onboarding actually has is a bespoke, inline mock
  storefront card hand-built directly inside
  `apps/web/features/stores/components/create-store-form.tsx:401-492`, driven by
  local form-watch state (palette, logo, name, slug) — it doesn't render real
  sections and isn't extracted into a shared component.
  `apps/web/features/store-settings/components/appearance-section.tsx:183-218`
  has a similarly small, separate, non-reusable inline preview card for
  branding. **Neither can be imported into the new page as-is.**
- The real public storefront rendering logic lives in
  `apps/web/app/[locale]/(storefront)/store/[slug]/page.tsx:226-281`, which maps
  `visibleSections` (server-fetched via `findPublicBySlug()`,
  `apps/api/src/modules/stores/stores.service.ts:209-224`,
  `orderBy: {
  position: "asc" }`) switching on `section.type`. This is a
  server component fetching from the API — not directly droppable into a
  client-side "preview as you drag" panel without adaptation.

## Approach

1. **Add `@dnd-kit/core` + `@dnd-kit/sortable`** to `apps/web`.
2. **Build a real, reusable preview renderer — with an explicit data-hydration
   step, not just an extraction.** Confirmed on review this is more involved
   than "extract the switch statement": the dashboard's own section list
   (`StoreSectionResponseDto`,
   `apps/api/src/modules/store-sections/dto/store-section-response.dto.ts:1-26`,
   what `apiClient.storeSections.findAll` returns) only carries
   `collectionId: string | null` for `COLLECTION` sections — no product data.
   The real storefront's product grids come from a _different_ endpoint,
   `findPublicBySlug()` (`stores.service.ts:209-226`), which deep-includes
   `collection → products → product → variants` filtered by
   status/deletedAt/discontinued/soldOut. A renderer fed only the builder's
   in-memory section list can't render real product grids without an explicit
   hydration step. Concrete plan: the renderer component itself stays pure
   (props in, JSX out, shared between the real page and the builder), but the
   **builder page** additionally fetches product data per-`collectionId` (either
   a small new endpoint scoped to the seller's own collections, or reusing
   whatever collection-products query the dashboard Collections page already
   has) to hydrate `COLLECTION` tiles before passing them to the renderer — this
   is new work this plan must budget for, not something the extraction gets for
   free.
   - Extracting the switch logic is still the right fix for "preview drifts from
     reality" _for the fields both sides already share_ (banner images, text
     blocks, section order) — it just doesn't cover product data without the
     hydration step above.
   - **Known, accepted gap**: `findPublicBySlug()` also synthesizes a trailing
     catch-all section for published products not assigned to any `StoreSection`
     row (visible past `page.tsx:244`). That synthetic section has no backing
     row, so it can never appear in the builder's drag list or its preview — the
     "preview can't drift from the real page" goal is _not_ fully achievable for
     this one case. Document it as explicitly out of scope rather than silently
     having the preview lie about it: the builder's preview pane only ever shows
     real, ordered `StoreSection` rows.
3. **New builder page** (replaces `sections-page-client.tsx`'s current
   table-with-arrows UI, same route): two-pane layout —
   - Left: `@dnd-kit/sortable` list of section tiles (type icon, short label
     e.g. "Banner principal", "Catálogo", visibility toggle switch, and for
     `BANNER`/`TEXT_BLOCK` rows an edit affordance for image/content) — drag
     handle per row, matching the report's "text tile of each section you can
     drag and drop in any order."
   - Right: live `StoreSectionRenderer` fed by the **local, in-progress**
     section-list state (post-drag order, current hide/show toggles). Update it
     on drag-over/reorder events (when the list order actually changes), not on
     every raw pointer-move frame — re-rendering full `COLLECTION` product grids
     on every `onDragMove` tick risks visible jank; `dnd-kit`'s sortable list
     already only fires reorder callbacks on index changes, which is the right
     granularity here, not a per-pixel drag position.
   - On drop, call the existing `reorderSections` mutation
     (`apiClient.storeSections.reorder`) with the new id order; hide/show and
     add-image actions call the existing update/create/delete endpoints — all
     already present, per the backend section above.
4. **Hide banner entirely / multiple secondary banners**: multiple `BANNER` rows
   are already allowed by the schema, satisfying "add more than one secondary
   banner" with no schema change. For hide/show, prefer a
   `hidden: Boolean @default(false)` column over delete+recreate on toggle
   (delete+recreate loses the seller's image/content choice if they re-show it
   later). Adding it means following CLAUDE.md's committed-artifact workflow
   explicitly, as its own sub-checklist (easy to skip a step here):
   1. Add `hidden Boolean @default(false)` to `StoreSection` in
      `packages/db/prisma/schema.prisma`, run a Prisma migration.
   2. Add `hidden` to `CreateStoreSectionDto`/`UpdateStoreSectionDto`/
      `StoreSectionResponseDto` and their mapper(s) explicitly (per this repo's
      established pattern of explicit field-by-field DTO updates, not
      spread-and-hope — see the `paymentMethod` addition in
      `2026-08-07-checkout-card-redesign-and-payment-method-fix.md`).
   3. Filter `where: { hidden: false }` (or equivalent) into
      `findPublicBySlug()`'s public query so hidden sections don't render for
      buyers, while still returning them (with their `hidden` flag) from the
      seller-facing `findAllForStore` so the builder can show and re-toggle
      them.
   4. Run
      `pnpm --filter api generate:openapi && pnpm --filter @biasmarket/types generate`
      and commit both `apps/api/openapi.json` and the regenerated
      `packages/types/generated/**` diff — required by CLAUDE.md since both are
      committed artifacts, not build-generated.
5. **Mobile**: per the clarification, adapt to "a more mobile way" — likely the
   tile list stacked full-width with the preview below it (or behind a "Ver
   preview" toggle) rather than a true two-pane side-by-side layout, since
   drag-and-drop + live side-by-side preview doesn't fit small screens. Decide
   the exact mobile interaction during implementation; dnd-kit supports touch
   out of the box.

## Open questions (resolved during implementation)

Both items below are closed by the shipped work in "Status: implemented" — the
remaining text is kept for the record, not as an open decision:

- Does `StoreSection` need the `hidden` boolean column (step 4), or is
  delete/recreate acceptable? **Resolved: the `hidden` column, confirmed.** The
  delete/recreate alternative was rejected (it loses the seller's image/content
  choice on re-show) and the column landed as implemented — see the `hidden`
  migration and DTO/mapper/public-query checklist in "Status: implemented". The
  plan's Approach step 4 is the only behavior: hidden-based toggling, no
  delete/recreate path.
- Multiple-images-per-banner-section vs. one `BANNER` row per image: **Resolved:
  one `BANNER` row per image.** Multiple `BANNER` rows were confirmed sufficient
  (schema unchanged, no `content: Json` array needed), and the builder lets
  sellers add more `BANNER` sections accordingly.

## Status: implemented

- The `reorder()` tenant-isolation gap described above (backend section) was
  fixed and tested independently of the rest of this plan, before the rest of
  the implementation started — see
  `apps/api/src/modules/store-sections/store-sections.service.ts`'s `reorder()`
  and its `.spec.ts`, since it was a real security-relevant bug found during
  review, not speculative.
- `hidden` column landed as planned:
  `StoreSection.hidden Boolean @default(false)` (migration
  `20260808123349_add_store_section_hidden`), threaded through
  `Create/Update/StoreSectionResponseDto`, `store-sections.service.ts`'s
  `create()`/`update()`, and `stores.service.ts`'s `findPublicBySlug()` (now
  `where: { storeId, hidden: false }`) — the seller-facing `findAllForStore()`
  stays unfiltered so the builder can show and re-toggle hidden sections.
  `apps/api/openapi.json` and `packages/types/generated/**` regenerated and
  committed per the CLAUDE.md checklist.
- Preview hydration: rather than a new endpoint, extended the existing
  `collections.findAll` response (`ProductInCollectionResponseDto`) with a
  `variants` field (`collections.controller.ts`/`.service.ts` now include
  `product.variants`) — the dashboard's Collections page already fetches this
  endpoint, so the builder reuses it directly instead of adding a parallel
  query. `apps/web/features/sections/lib/hydrate-sections.ts` joins the
  builder's local section list to this collections response by `collectionId`,
  filters out `hidden` sections, and sorts by `position` before handing the
  result to the shared renderer.
  - **Public-visibility contract (added on review):** `hydrateSections()` also
    applies the same product filter as `findPublicBySlug()` (status `PUBLISHED`,
    `deletedAt` null, `discontinued` false — `soldOut` intentionally kept,
    matching the public query) before hydrated COLLECTION tiles reach the
    renderer. Without this, the seller-side `collections.findAll` data would let
    the preview show DRAFT/deleted/discontinued products the public page hides;
    a test in `hydrate-sections.test.ts` pins the filter to the public contract.
- Shared renderer: `apps/web/components/storefront/section-renderer.tsx`
  (`StoreSectionRenderer`) holds the exact COLLECTION/BANNER/TEXT_BLOCK switch
  that used to be inline in `store/[slug]/page.tsx` — that page now imports it
  instead of duplicating the JSX. `ProductCard` moved alongside it
  (`components/storefront/product-card.tsx`, was route-local before) since both
  the real page and the builder preview need it. The builder wraps the preview
  in `pointer-events-none` — reusing the real interactive `ProductCard`
  (add-to-cart, variant select) means without this a click in the preview would
  write to that store's real cart in the seller's browser.
- Builder UI: `sections-page-client.tsx` rewritten as the two-pane
  `@dnd-kit/core` + `@dnd-kit/sortable` builder described in the plan —
  `SectionTile` (drag handle, hidden toggle, inline edit for BANNER/TEXT_BLOCK
  via `SectionEditForm`) on the left, live `StoreSectionRenderer` on the right.
  Reorder commits on `onDragEnd` (index change), not per-pointer-move, per the
  plan's guidance. Mobile: a two-tab switcher (Secciones/Vista previa) rather
  than true side-by-side, since dnd-kit's `md:grid md:grid-cols-2` collapses
  awkwardly on narrow screens otherwise.
- Catch-all synthetic section: confirmed out of scope as documented — it has no
  `StoreSection` row, so it's structurally absent from both the builder's drag
  list and `hydrateSections()`'s output. Not revisited.
- Deviation from the plan's literal wording: local optimistic state
  (`localSections`) didn't originally roll back on a failed mutation (drag
  reorder or hidden toggle) — a real bug caught by hand while reviewing the
  diff, not by a test. Fixed with a `resyncLocalSections()` helper called from
  both `catch` blocks.
- Real bug found via testing, not inspection: the first version computed
  `serverSections = sectionsQuery.data ?? []` inline and used it as a
  `useEffect` dependency. While the query is still loading, `?? []` produces a
  new array reference every render, so the effect (and its `setState`) fired on
  every commit — an infinite render loop that pegged the CPU. It only surfaced
  because a new component test (`sections-page-client.test.tsx`) hung for real
  instead of timing out cleanly. Fixed with
  `useMemo(() => sectionsQuery.data ?? [], [sectionsQuery.data])`.
- Process note, unrelated to this feature's logic: regenerating
  `packages/types/generated/**` mid-session raced with another agent doing the
  same for an unrelated feature (restock) — a live example of the
  multi-agent-on-one-repo situation this repo now works under. Handled by
  hand-patching the generated files with just this plan's new fields instead of
  taking a full regenerated+reformatted file, to keep the diff reviewable and
  avoid clobbering their in-flight work.
- Tests: `store-sections.service.spec.ts` and `stores.service.spec.ts` cover the
  `hidden` column (create/update/public-filter); `hydrate-sections.test.ts`
  covers the join/sort/filter logic; `sections-page-client.test.tsx` covers the
  builder rendering sections into the preview and the hide toggle persisting.
  Full suites pass: 349/349 API, 197/198 web (the one web failure is
  `store-sidebar.test.tsx`, unrelated — the other agent's in-progress restock
  feature).
