# Admin panel

The platform-admin surface — for the Bias Market team (the people running the
SaaS), not sellers. Distinct from the per-store seller panel described in
[product.md §4.2](product.md#42-seller-panel-per-store): nothing here is
scoped to a `storeId`, and it's gated by `role: "admin"` on the `User` model
instead of store ownership. See
[product.md §4.1](product.md#41-platform-layer-superadmin) for where this
fits in the platform/seller/storefront layering — today it only covers
contact inquiries; full account/store management described there is still
unbuilt.

## Access

- URL: `/admin` (redirects to `/admin/inquiries`) or any `/admin/*` page
  directly, under `apps/web/app/[locale]/(dashboard)/admin/`.
- Full sidebar shell (`apps/web/components/admin/app-sidebar.tsx`, built on
  shadcn's `Sidebar` primitives — `apps/web/components/ui/sidebar.tsx`,
  `style: "base-nova"` per `apps/web/components.json`): collapsible on
  desktop, slides in as a sheet on mobile. Footer shows the logged-in admin's
  name/email (`authClient.useSession()`) and a working sign-out. "Stores" and
  "Users" nav items exist as disabled "coming soon" placeholders — no pages
  behind them yet, matching product.md §4.1's still-unbuilt scope.
- This sidebar is scoped to `admin/*` only — the seller dashboard
  (`dashboard/[slug]/...`) is untouched and still renders its own inline
  header per page.
- No client-side auth redirect. Like every other dashboard page, it just
  calls the API and renders whatever comes back — a non-admin or logged-out
  visitor sees the sidebar shell but the fetch fails (401/403), same pattern
  as the seller dashboard.

## Becoming an admin

`role` is **not** self-assignable — `apps/api/src/auth/auth.config.ts` sets
`input: false` on that better-auth field, so it can't be set at signup via
the API, only changed server-side.

**Dev:** two accounts are seeded automatically on every `docker compose -f
infra/docker/docker-compose.dev.yml up` (`apps/api/scripts/seed-dev-admins.ts`,
idempotent — see
[the seed-admin plan doc](../plans/2026-07-22-seed-dev-admin-accounts.md)):

| Email                  | Password          |
| ----------------------- | ----------------- |
| `admin@biasmarket.dev`  | `devpassword123`  |
| `owner@biasmarket.dev`  | `devpassword123`  |

**Prod (or promoting any other existing account):** run
`apps/api/scripts/promote-admin.ts <email>` against the target user — there
is no self-service UI or API endpoint for this, by design.

## What's there today: contact inquiries

Every submission from the public [`/contact`](#related-public-pages) form
lands in the `ContactInquiry` table (platform-level, no `storeId` — this is
Bias-Market-the-company's own sales inbox, not tenant data) and shows up in
the table at `/admin/inquiries`:

- **Fields:** name, email, company (optional), inquiry type (optional —
  general / technical / pricing / partnership / other), message, status,
  received date.
- **Status:** `NEW` → `REVIEWED` (via the "Mark reviewed" button per row) →
  `ARCHIVED` (no UI action yet sets this — reserved for future use).
- **API:** `GET /api/contact` (list, newest first) and
  `PATCH /api/contact/:id/review` (mark reviewed), both
  `@UseGuards(AuthGuard) @Roles(['admin'])`.

No outbound email/notifications — the panel itself is the only place these
show up today (no Resend/mailer integration exists in the api yet). No
pagination — fine at current volume, revisit if the table grows large.

## Related public pages

- `/contact` — the form that feeds this table, plus a Cal.com "Book a Call"
  card (Alexandra Flores, 15 min) as the higher-intent alternative to filling
  out the form.
- `/enterprise` — also surfaces the same Cal.com card as a secondary CTA.

Full design history / why things landed this way:
[`2026-07-22-contact-page-cal-com-admin-inquiries.md`](../plans/2026-07-22-contact-page-cal-com-admin-inquiries.md).

## Rate limiting & abuse

`POST /api/contact` (the public submit endpoint) is throttled to 5
requests/minute via `@nestjs/throttler`, scoped to that one route only — not
a project-wide throttling rollout (see
[deploy.md](deploy.md#known-limitations) for the broader gap).

## Extending this later

A shared nav shell already exists (see Access, above) — adding a second
admin feature is: build the page under `admin/<name>/page.tsx`, flip its
`NAV_ITEMS` entry in `app-sidebar.tsx` from `disabled: true` to a real
`href`, add its i18n strings. Still worth reconsidering once there's more
than one admin-only resource: whether `@Roles(['admin'])` per-route is
enough, or a dedicated `AdminModule`/guard composition makes more sense.
