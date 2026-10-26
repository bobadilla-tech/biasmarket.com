# Full admin dashboard shell with sidebar

## Context

Follow-up to
[`2026-07-22-contact-page-cal-com-admin-inquiries.md`](2026-07-22-contact-page-cal-com-admin-inquiries.md).
`/admin/inquiries` existed but was a bare, headerless page — asked for a real
admin dashboard shell at `/admin` with a shadcn-style sidebar, Inquiries as one
nav tab among others. Asked whether to add "Stores"/"Users" as placeholder tabs
(matching `product.md` §4.1's still-unbuilt platform-layer scope) or keep the
sidebar lean with just Inquiries — user chose placeholders.

`apps/web/components.json` already had shadcn configured (`style:
"base-nova"`,
the `@base-ui/react`-powered variant) and `globals.css` already had the full
`--sidebar-*` theme tokens wired — the actual `Sidebar` component had just never
been added. Confirmed live before writing any code that
`pnpm dlx shadcn@latest add sidebar --dry-run` resolves cleanly against this
repo and reported `button.tsx`/`separator.tsx` as already-identical to what the
registry would generate.

## What changed

1. **`pnpm dlx shadcn@latest add sidebar`** (real run) — added
   `components/ui/{input,skeleton,tooltip,sheet,sidebar}.tsx` +
   `hooks/use-mobile.ts`. Skipped `button.tsx`/`separator.tsx` (identical).
2. **`apps/web/components/admin/app-sidebar.tsx`** (new): nav items as a
   `{ href, labelKey, icon, disabled? }` array — Inquiries real
   (`/admin/inquiries`), Stores/Users disabled with a "Soon" badge
   (`components/ui/badge.tsx`, `variant="secondary"`). Footer uses
   `authClient.useSession()` (`apps/web/lib/auth-client.ts` — exported since the
   contact-page work but never actually called anywhere until now) to show the
   logged-in admin's name/email plus a sign-out button (`authClient.signOut()` →
   redirect home). Active-route highlighting via next-intl's `usePathname()`.
3. **`apps/web/app/[locale]/(dashboard)/admin/layout.tsx`** (new):
   `TooltipProvider` (required by the generated `sidebar.tsx` for the
   collapsed-state tooltips) + `SidebarProvider` + `AppSidebar` + `SidebarInset`
   with a small header bar holding just `SidebarTrigger`. Scoped to `admin/*`
   only — `dashboard/[slug]/...` untouched.
4. **`apps/web/app/[locale]/(dashboard)/admin/page.tsx`** (new): bare `/admin`
   redirects to `/admin/inquiries`, same pattern as `dashboard/[slug]/page.tsx`
   → `products`.
5. **`admin/inquiries/page.tsx`**: dropped its own `min-h-screen` page-shell
   wrapper (the sidebar layout's `SidebarInset` now owns that) — kept its own
   `<h1>` title rather than moving it into the layout, since a shared layout
   title wouldn't make sense once Stores/Users get real pages with different
   titles. No other changes — fetch logic, table, mark-reviewed action
   untouched.
6. **i18n**: new `sidebar` namespace in `packages/i18n/{en,es}/admin.json` (nav
   labels, `comingSoon`, `signOut`).

**Base-ui vs Radix note:** this repo's shadcn variant uses `@base-ui/react`, not
Radix — so `SidebarMenuButton` takes a `render={<Link href="..." />}` prop
(base-ui's `useRender` polymorphism) instead of Radix's `asChild` pattern.
Confirmed working by actually rendering it, not just by reading the generated
source.

## Verification

- `pnpm turbo run typecheck --filter=web`: one round of type errors first
  (`t(item.labelKey)` with `labelKey: string` doesn't satisfy next-intl's
  generated `NamespacedMessageKeys` type) — fixed by typing `labelKey` as the
  literal union `"inquiries" | "stores" | "users"` instead of `string`. Clean
  after that — and the old pre-existing `product-card.tsx` tuple-type error from
  earlier sessions is gone too (fixed by an unrelated external commit,
  `a3b72a1 feat: product taxonomy`, not by this change).
- Full end-to-end browser check (Playwright, headless): logged in as the seeded
  `admin@biasmarket.dev`, hit `/es/admin` → confirmed redirect to
  `/es/admin/inquiries`; screenshotted desktop (sidebar expanded, Consultas
  highlighted, Tiendas/Usuarios greyed out with "Pronto" badges, footer shows
  "Dev Admin" / email / "Cerrar sesión") and mobile 390px width (sidebar
  collapses to just the trigger icon by default; clicking it slides in the full
  sheet overlay with the same nav). Zero console errors in either mode.
