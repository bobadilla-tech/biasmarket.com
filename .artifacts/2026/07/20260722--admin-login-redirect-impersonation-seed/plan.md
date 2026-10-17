# Admin login redirect, store impersonation, and a fuller dev seed

## Context

Three asks, all extending the admin work from earlier the same day
([`2026-07-22-contact-page-cal-com-admin-inquiries.md`](2026-07-22-contact-page-cal-com-admin-inquiries.md),
[`2026-07-22-admin-sidebar-shell.md`](2026-07-22-admin-sidebar-shell.md)):

1. Log in as an admin → land on `/admin`, not the seller-only
   `/onboarding/create-store` flow.
2. Let an admin "impersonate" a store owner to debug their dashboard.
3. Turn the admin-only dev seed into a fuller "seed setup" — sellers, stores,
   products — so dev isn't empty on first boot.

Three Explore agents researched this before any code was touched. Headline
finding: **better-auth ships an official `admin` plugin**
(`better-auth/plugins/admin`) with `impersonateUser`/`stopImpersonating` built
in — dual-cookie session swap, auto-expiring impersonation (1h default), blocks
impersonating other admins by default. Hand-rolling this would've been
meaningfully more work and more security-sensitive than adopting the plugin —
confirmed via `@thallesp/nestjs-better-auth`'s compiled source that
`@Roles(['admin'])` (already used by `contact.controller.ts`) only ever reads
`session.user.role` directly, zero dependency on how that field is populated, so
adopting the plugin was additive, not a rewrite of existing guards.

## 1. Adopted better-auth's `admin` plugin

- **Schema**: added `banned Boolean? @default(false)`, `banReason String?`,
  `banExpires DateTime?` to `User`; `impersonatedBy String?` to `Session` —
  columns the plugin requires even though nothing reads/writes ban fields yet
  (dormant, same shape as `ContactInquiry.status: ARCHIVED`). Migration
  `add_admin_plugin_fields`.
- **`auth.config.ts`**: replaced the hand-rolled `additionalFields.role` with
  `plugins: [admin({ defaultRole: 'seller', adminRoles: ['admin'] })]`.
  `defaultRole: 'seller'` preserves the old default (plugin's own default is
  `"user"`).
- **TypeScript gotcha**: adding the plugin made `createAuth`'s inferred return
  type unprintable
  (`TS2742: ... cannot be named without a reference
  to .pnpm/zod...`) — a
  known better-auth+TS pitfall once plugins are involved.
  `ReturnType<typeof betterAuth>` didn't work either (resolves to the
  _unparameterized_ signature, which is structurally incompatible with the
  actual plugin-configured call — different error, "two different types with
  this name exist but unrelated"). Fixed by annotating the return type as
  `@thallesp/nestjs-better-auth`'s own `Auth` type, which is an intentional
  `any` alias — sidesteps the printability problem entirely since the NestJS
  module only ever needs `{ auth: <anything> }`.
- **`auth-client.ts`**: added `plugins: [adminClient()]` — this is what exposes
  `authClient.admin.impersonateUser`/`stopImpersonating` and auto-refreshes any
  `useSession()` consumer when either is called.
- `promote-admin.ts`/the seed script unaffected — both write `role` directly via
  raw Prisma, bypassing better-auth's create-user hook entirely.

## 2. Admin login redirect

`login/page.tsx`: `role` comes back directly on `data.user` from
`signIn.email()` (confirmed by tracing better-auth's sign-in route — no second
`useSession()` call needed). If `data.user.role === "admin"`,
`router.push("/admin")`; otherwise the existing `/onboarding/create-store`.
First role-based branch anywhere in the frontend.

## 3. Store impersonation

- **`GET /stores`** (bare path — every other `stores` route is
  `/stores/:id`-shaped, confirmed no collision) on `stores.controller.ts`,
  `@Roles(['admin'])`, backed by new `StoresService.findAllForAdmin()` —
  `findMany` with `owner: { select: { id, email, name } }` included,
  deliberately unfiltered by ownership.
- **`/admin/stores` page** (flips the sidebar's disabled "Stores" placeholder to
  a real link): table of every store, "Impersonate" button per row →
  `authClient.admin.impersonateUser({ userId: store.ownerId })` → redirect to
  `/dashboard/:slug/products`.
- **`ImpersonationBanner`**
  (`apps/web/components/dashboard/impersonation-banner.tsx`, mounted in the
  outer `(dashboard)/layout.tsx` so it's visible across both `admin/*` and
  `dashboard/[slug]/*`): reads `session.session.impersonatedBy` (cast, since the
  client isn't wired to infer the plugin's session-shape additions), shows who's
  being impersonated, "Stop impersonating" calls
  `authClient.admin.stopImpersonating()` and returns to `/admin/stores`.

## 4. Fuller dev seed

Consolidated `apps/api/scripts/seed-dev-admins.ts` into
`apps/api/scripts/seed-dev.ts` — same idempotent `findUnique`-by-email pattern,
now also creates 2 sellers, each with a store and 3 published products (one with
a variant). Store/product shape deliberately mirrors the **real**
`StoresService.create()`/`ProductsService.create()` code paths (empty
`themeConfig`/`paymentInstructions`, a `PICKUP` `DeliveryMethodConfig` row,
`status: 'PUBLISHED'` set explicitly since real products default to `DRAFT`)
rather than just whatever satisfies the schema. Docker compose's `api` command
and `docs/core/infra.md`'s credentials table updated to match.

## Verification

All done against the actual running dev stack, not just typecheck:

- `pnpm turbo run typecheck --filter=api --filter=web` clean (had to clear a
  stale `.next` route-types cache once — unrelated leftover, not a real error).
- `pnpm --filter api test`: 105/105 (one existing spec,
  `stores.controller.spec.ts`, needed its `@thallesp/nestjs-better-auth` mock
  extended with `Roles` after the new guarded route was added).
- Migration applied against the live dev Postgres (same `docker exec` workaround
  as before — a native Homebrew Postgres on the host shadows Docker's port 5432
  forward).
- Seed ran clean on a real boot, then re-ran idempotently (no duplicates).
- Full browser round-trip (Playwright, headless): admin login → lands on
  `/admin` (not create-store); seller login → still lands on
  `/onboarding/create-store` (no regression); `/admin/stores` lists all 4 stores
  in the dev DB (2 seeded + 2 pre-existing) with owner emails; clicked
  "Suplantar" on `tienda-de-camila` → landed on
  `/dashboard/tienda-de-camila/products` with the amber impersonation banner and
  the 3 seeded published products visible → clicked "Dejar de suplantar" → back
  on `/admin/stores` as the original admin session, banner gone. Zero console
  errors throughout.
- Confirmed admin-impersonating-admin is blocked: called the impersonate
  endpoint directly from an authenticated admin browser session (`page.evaluate`
  fetch, so the Origin header is real) targeting another admin's user id → 403
  `YOU_CANNOT_IMPERSONATE_ADMINS`, exactly the plugin's documented default
  behavior.
