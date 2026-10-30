# Admin panel

The platform-admin surface — for the Bias Market team (the people running the
SaaS), not sellers. Distinct from the per-store seller panel described in
[product.md §4.2](product.md#42-seller-panel-per-store): nothing here is scoped
to a `storeId`, and it's gated by `role: "admin"` on the `User` model instead of
store ownership. See [product.md §4.1](product.md#41-platform-layer-superadmin)
for where this fits in the platform/seller/storefront layering — today it covers
contact inquiries, stores (listing + impersonation), coupons, and users
(listing + ban); full account/store management described there is still unbuilt.

## Access

- URL: `/admin` (redirects to `/admin/inquiries`) or any `/admin/*` page
  directly, under `apps/web/app/[locale]/(dashboard)/admin/`.
- Full sidebar shell (`apps/web/components/admin/app-sidebar.tsx`, built on
  shadcn's `Sidebar` primitives — `apps/web/components/ui/sidebar.tsx`,
  `style: "base-nova"` per `apps/web/components.json`): collapsible on desktop,
  slides in as a sheet on mobile. Footer shows the logged-in admin's name/email
  (`authClient.useSession()`) and a working sign-out. Every `NAV_ITEMS` entry —
  Inquiries, Stores, Coupons, Users — is a real page (see below).
- **Login redirect:** `apps/web/app/[locale]/(onboarding)/login/page.tsx` checks
  `data.user.role` from the `signIn.email()` response — an admin lands on
  `/admin` directly instead of the seller-only `/onboarding/create-store` flow.
  First role-based branch in the frontend.
- This sidebar is scoped to `admin/*` only — the seller dashboard
  (`dashboard/[slug]/...`) is untouched and still renders its own inline header
  per page.
- The admin layout (`app/[locale]/(dashboard)/admin/layout.tsx`) redirects
  sessions that are not admin and not impersonating to `/dashboard`. The API
  still enforces `@Roles(['admin'])` on every admin route; the redirect is a
  convenience, not the control.

## Becoming an admin

`role` is **not** self-assignable: there is no self-service UI or API endpoint,
by design. Dev gets two admin accounts seeded automatically
(`apps/api/scripts/seed/`, see [infra.md](infra.md)). To create, promote or
revoke an admin in development or production, follow
[admin-access.md](admin-access.md).

## What's there today: contact inquiries

Every submission from the public [`/contact`](#related-public-pages) form lands
in the `ContactInquiry` table (platform-level, no `storeId` — this is
Bias-Market-the-company's own sales inbox, not tenant data) and shows up in the
table at `/admin/inquiries`:

- **Fields:** name, email, company (optional), inquiry type (optional — general
  / technical / pricing / partnership / other), message, status, received date.
- **Status:** `NEW` → `REVIEWED` (via the "Mark reviewed" button per row) →
  `ARCHIVED` (no UI action yet sets this — reserved for future use).
- **API:** `GET /api/contact` (list, newest first) and
  `PATCH /api/contact/:id/review` (mark reviewed), both
  `@UseGuards(AuthGuard) @Roles(['admin'])`.

No outbound email/notifications for inquiries specifically — the panel itself is
the only place these show up today. (Transactional email does exist elsewhere in
the api; see the "Email delivery" bullet in
[architecture.md](architecture.md#9-performance--scaling). It is not wired to
contact inquiries.) No pagination — fine at current volume, revisit if the table
grows large.

## Stores & impersonation

`/admin/stores` lists every store platform-wide (name, slug, owner, created
date) via `GET /api/stores` (`@Roles(['admin'])`, bare path — every other
`stores` route is `/stores/:id`-shaped) → `StoresService.findAllForAdmin()`,
another deliberately-unfiltered platform-admin query like `ContactInquiry`
above.

Each row has an "Impersonate" button that calls
`authClient.admin.impersonateUser({ userId: store.ownerId })` — this is
better-auth's official [`admin` plugin](https://better-auth.com), wired in
`apps/api/src/auth/auth.config.ts`
(`admin({ defaultRole: 'seller',
adminRoles: ['admin'] })`, which now owns
`role` instead of the old hand-rolled `additionalFields` entry) and
`apps/web/lib/auth-client.ts` (`adminClient()`). Not hand-rolled — the plugin
does the dual-cookie session swap, auto-expires the impersonation session (1h
default), and blocks impersonating another admin
(`YOU_CANNOT_IMPERSONATE_ADMINS`) out of the box.

After impersonating, the admin lands on that seller's
`/dashboard/:slug/products` with a persistent amber banner
(`apps/web/components/dashboard/impersonation-banner.tsx`, added to the outer
`(dashboard)/layout.tsx` so it shows across both `admin/*` and
`dashboard/[slug]/*`) — "Stop impersonating" calls
`authClient.admin.stopImpersonating()` and returns to `/admin/stores`.

Ban/unban (`banned`/`banReason`/`banExpires` on `User`) came along as required
columns for the plugin's schema and now has a real surface: the Users page (next
section) lists every account and exposes a per-row ban toggle.

## Users

`/admin/users` lists every account platform-wide (email, name, role, store
count, ban state) via `authClient.admin.listUsers` (better-auth admin plugin)
plus `adminUsersApi.getStoreCounts` (an admin-only `Users`-tagged endpoint that
counts each owner's stores), with a per-row **Ban/Unban** button
(`use-toggle-user-ban.ts` → `authClient.admin.banUser` / `unbanUser`). The ban
button is disabled for `role: "admin"` rows — admins can't ban each other. Uses
the same admin-only role gate as the other screens.

## Coupons

`/admin/coupons` manages premium coupons platform-wide (not scoped to a store).
The page (`coupons/coupons-page-client.tsx`) uses the hooks and components from
`apps/web/features/admin`: list coupons, create and edit them in a dialog,
toggle active status, delete (with a confirm, since deleting cascades away the
coupon's redemption rows), and open a per-coupon redemptions table where a
redemption can be un-redeemed.

The API is `CouponsController`
(`apps/api/src/modules/coupons/coupons.controller.ts`): `POST` and `GET`
`/api/admin/coupons`, `PATCH` and `DELETE` `/api/admin/coupons/:couponId`,
`PATCH /api/admin/coupons/:couponId/status`,
`GET /api/admin/coupons/:couponId/redemptions`, and
`POST /api/admin/coupons/:couponId/redemptions/:redemptionId/unredeem`. All use
`@UseGuards(AuthGuard) @Roles(['admin'])`. Sellers redeem a code through the
separate `POST /api/coupons/redeem`.

## Related public pages

- `/contact` — the form that feeds this table, plus a Cal.com "Book a Call" card
  (Alexandra Flores, 15 min) as the higher-intent alternative to filling out the
  form.
- `/enterprise` — also surfaces the same Cal.com card as a secondary CTA.

Full design history / why things landed this way:
[`2026-07-22-contact-page-cal-com-admin-inquiries.md`](../../.artifacts/2026/07/20260722--contact-page-cal-com-admin/plan.md),
[`2026-07-22-admin-sidebar-shell.md`](../../.artifacts/2026/07/20260722--admin-sidebar-shell/plan.md),
[`2026-07-22-admin-login-redirect-impersonation-seed.md`](../../.artifacts/2026/07/20260722--admin-login-redirect-impersonation-seed/plan.md).

## Rate limiting & abuse

`POST /api/contact` (the public submit endpoint) is throttled per route with
`@nestjs/throttler`. See
[security-payments.md](security-payments.md#74-abuse-prevention) for the
controls that apply across the API.

## Extending this later

A shared nav shell already exists (see Access, above) — adding another admin
feature is: build the page under `admin/<name>/page.tsx`, add its `NAV_ITEMS`
entry in `app-sidebar.tsx` (every current entry is live; a future not-yet-built
page can still use `disabled: true` to show it greyed out), add its i18n
strings. Still worth reconsidering once there's more than one admin-only
resource: whether `@Roles(['admin'])` per-route is enough, or a dedicated
`AdminModule`/guard composition makes more sense.

## Related

- [admin-access.md](admin-access.md) — create, promote and revoke admins
- [product.md](product.md#41-platform-layer-superadmin) — platform layer
- [security-payments.md](security-payments.md#74-abuse-prevention) — abuse
  controls
- [architecture.md](architecture.md) — mailer and workers
