# Move "Interesados en reposición" out of Products into its own Crecimiento nav page

## Context

"Interesados en reposición" (restock-interest waitlist: customers who asked to
be notified when an out-of-stock product/variant is back, with a one-click
WhatsApp contact button) currently renders as a panel at the very bottom of the
seller's Products dashboard page (`RestockRequestsPanel` in
`apps/web/app/[locale]/(dashboard)/dashboard/[slug]/products/products-page-client.tsx:349-352`),
below the full products table. Reported problem (with screenshots): the section
is "buried" — a seller has to scroll past the entire product table to find it,
there's no direct sidebar entry, and it's actionable information (a customer
waiting to be contacted) that deserves its own visibility rather than being a
secondary block on a page whose primary content is something else entirely.

Everything this needs already exists as a feature slice — this is a relocation +
nav-entry task, not new feature work:

- `apps/web/features/restock/` already has the full shape per
  `apps/web/AGENTS.md`'s convention: `components/restock-requests-panel.tsx`
  (the list itself — grouping, "Más recientes"/"Más solicitados" sort, WhatsApp
  button), `queries/use-restock-requests.ts`
  (`useRestockRequests(storeId, fallbackErrorMessage)`), `api/restock.api.ts`
  (`GET /stores/:storeId/restock-requests`, not yet Orval-migrated — stays on
  `apiFetch` + zod, per existing pattern), `mutations/`, `schemas/`.
- Backend: `apps/api/src/modules/restock` (`restock.controller.ts`,
  `.service.ts`) already serves the authed list endpoint used above and the
  public "notify me" endpoint used by the storefront dialog. One small addition
  is needed for the sidebar badge — see step 4 below — everything else is reused
  as-is.
- Sidebar: `apps/web/components/dashboard/store-sidebar.tsx:50-54` has the exact
  `growthItems` array (`customers`, `analytics`, `notifications`) this new entry
  joins, rendered via `<SidebarSection>` (lines 61-148).
- Badge pattern to copy: `SidebarSection` already computes
  `badgeCount = item.key === "notifications" ? unreadCount : 0` (line 95) fed by
  `useUnreadCount(store?.id)` from `features/notifications` — the same shape,
  generalized to a per-key count lookup, is what a restock badge reuses.
- Page template to copy: Notifications is the simplest existing
  Crecimiento-group page — `.../notifications/page.tsx` (22-line server
  component, `generateMetadata` via `getTranslations`) +
  `.../notifications/notifications-page-client.tsx`.

## Approach

1. **New route**:
   `apps/web/app/[locale]/(dashboard)/dashboard/[slug]/restock/page.tsx`
   - `restock-page-client.tsx`, modeled 1:1 on the Notifications page pair. The
     client component renders the existing `RestockRequestsPanel` — no new
     list/filter/card UI is written, it's the same component moved to a new host
     page.
2. **Products page**: delete the `<RestockRequestsPanel .../>` block at
   `products-page-client.tsx:349-352` and its now-unused import. Confirm nothing
   else on that page depends on it being present (it doesn't — it's a standalone
   panel with its own data fetching).
3. **Sidebar entry**: add a `restock` (or `interested` — pick per i18n naming
   below) item to `growthItems` in `store-sidebar.tsx:50-54`, icon choice
   consistent with the others (e.g. `PackageSearch` or `Bell`-adjacent from
   `lucide-react`, whatever's already imported/available — avoid adding a new
   icon dependency if an appropriate one is already in use elsewhere in the
   repo).
4. **Badge count**: **decided, not left open** — add a dedicated
   `GET /stores/:storeId/restock-requests/count` endpoint (named plainly
   `count`, **not** `unread-count` — this repo's restock waitlist has no
   read/unread tracking and this plan isn't adding any, per the "Open questions"
   resolution below; naming the route `unread-count` would misrepresent what it
   does), mirroring notifications' actual backend pattern:
   `notifications.service.ts:48-50`'s `unreadCount()` runs a Prisma `.count()`,
   _not_ a full `findMany`, and returns a typed `NotificationCountResponseDto`
   (`dto/notification-response.dto.ts`). Add an equivalent
   `RestockCountResponseDto { count: number }` in
   `apps/api/src/modules/restock/dto/`, a `count(storeId, userId)` method on
   `RestockService` doing the equivalent `.count()`, and a controller method
   guarded the same way this controller's existing authed route already is —
   `RestockController` uses **per-method** `@UseGuards(AuthGuard)` (not a
   class-level guard, since `create` is `@Public()`), so the new `count` method
   follows that same per-method pattern, not the notifications module's
   class-level one. The sidebar renders on every dashboard page, so fetching the
   full `RestockService.listForStore` result (store lookup + ownership check +
   unpaginated `findMany` with product/variant joins) just to compute a badge
   number would run that full join on every dashboard nav render, not just the
   restock page — this is why a dedicated count endpoint, not reuse of the list
   endpoint, is required here. Add `queries/use-restock-count.ts` in
   `features/restock/` calling the new endpoint (stays on `apiFetch`/zod like
   the rest of `restock`, not Orval — matching the module's existing un-migrated
   status), matching `useUnreadCount`'s shape. Generalize `SidebarSection`'s
   `badgeCount` from the single `item.key === "notifications"` check (line 95)
   to a small lookup/prop so both notifications and restock badges share the
   same rendering path instead of stacking more hardcoded `if`s.
5. **i18n**: add `dashboard.shell.nav.restock`
   (`dashboard.shell.sections.growth` already covers the group title, confirmed
   present in `packages/i18n/en/dashboard.json:187-209` with parallel ES keys).
   A `dashboard.restock.*` namespace already exists too
   (`packages/i18n/en/dashboard.json:626-634`, used internally by
   `RestockRequestsPanel`) — reuse its existing heading copy for the new page's
   title instead of writing a second, potentially-drifting string for the same
   concept.
6. **One small backend addition** (the count endpoint in step 4 above) — no
   schema change, no other API changes. Everything else in this plan is frontend
   relocation + nav wiring.

## Decided (was open in an earlier draft, resolved on review)

- **Badge shows a plain total count, not "new since last viewed."** The report's
  acceptance criterion is "so the vendor notices at a glance if there's new
  activity" — a plain total satisfies the spirit of that (waitlist volume, and
  any recent request shows up as a count increase) without needing read/unread
  tracking infrastructure — no `read`/`viewedAt` column, no extra state. It is
  not a "new since last time" indicator and does not exclude already-contacted
  requests: `RestockRequest` has no contacted/status field, so there's no
  "pending-only" count to show without a schema change. This is now reflected in
  the route name itself (`.../count`, not `.../unread-count`) so implementation
  doesn't accidentally build read-tracking the badge doesn't need.

## Open questions to resolve during implementation

- Exact nav label/route segment: "Reposición" vs "Interesados" (Spanish UI copy)
  — pick one and use it consistently in the route segment, i18n key, and page
  title; don't let the URL segment and the display label drift independently.
