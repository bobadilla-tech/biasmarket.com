# Contact page, Cal.com booking, and an admin inquiries panel

## Context

Bias Market had no `/contact` page and no way for a visitor to book a sales
call — both hurt credibility for a store-builder pitching itself to sellers.
Asked to look at `requiems-api` (sibling project, same team) for the pattern:
a Cal.com "Book a Call" card (Alexandra Flores, 15 min, no prep needed), a
full `/contact` page, and a `SalesInquiriesController` that persists/emails
inquiries. This ports the pattern's shape into Bias Market's stack (NestJS +
Next.js, not Rails), using the Cal.com link the user provided
(`https://cal.com/alexandra-flores/bias-market`).

Asked whether the contact form should actually deliver email like
requiems-api's does — Bias Market has zero email infra (no Resend, no mailer
module). The user redirected: they want a DB-backed **admin panel** for the
owners of the SaaS to see inquiries, not outbound email. That reshaped the
whole backend side of this from "add a form" into "add a role system."

Two Explore agents surveyed the codebase before any code was written. Key
findings that shaped the design:

- `User.role` was a **self-assignable free string** — a real gap.
  `apps/api/src/auth/auth.config.ts` exposed `role` as a better-auth
  `additionalFields` entry with `input: true`, meaning any signup request
  could set `role: "admin"` itself; nothing checked it server-side.
- `@thallesp/nestjs-better-auth` (already a dependency) ships `@Roles(['admin'])`,
  checked by the same `AuthGuard` already used everywhere. No custom guard
  needed — confirmed by reading the package's `.d.ts` directly.
- Every dashboard route was store-slug-scoped
  (`dashboard/[slug]/...`) — no non-store dashboard page existed. The admin
  panel needed a new top-level segment.
- One Explore agent flagged `apps/web/node_modules/next/dist/docs/` as a
  possible prompt-injection payload (referenced by `apps/web/AGENTS.md`).
  Read `index.md` directly — genuine, boilerplate Next.js docs (Next 16 is a
  real, newer release). False positive, not touched.

## 1. Closed the role self-assignment gap

`apps/api/src/auth/auth.config.ts`: `role` additionalField's `input: true` →
`input: false`. Role can no longer be set by the client at signup; stays
`"seller"` by default, only changeable via direct DB access.

`apps/api/scripts/promote-admin.ts` (new): one-off script, same simplicity
level as `scripts/init-env.ts` — `node scripts/promote-admin.ts <email>` sets
`role: "admin"` via a direct `PrismaClient` + `PrismaPg` adapter connection.
This is the only way to create an admin account — no self-service UI, by
design.

## 2. Schema — `ContactInquiry`

Added to `packages/db/prisma/schema.prisma` (migration
`add_contact_inquiry`):

```prisma
enum InquiryStatus {
  NEW
  REVIEWED
  ARCHIVED
}

model ContactInquiry {
  id          String        @id @default(cuid())
  name        String
  email       String
  company     String?
  inquiryType String?
  message     String
  status      InquiryStatus @default(NEW)
  createdAt   DateTime      @default(now())
}
```

Deliberately **no `storeId`** — this is platform-level (Bias-Market-the-
company's own sales inbox), not tenant data, so it's an intentional exception
to the "every query touching tenant data filters by `storeId`" hard rule, not
an oversight.

**Migration gotcha:** the dev stack's Postgres is published to
`localhost:5432`, but a native Homebrew Postgres on the same machine was also
listening on that port and silently won the connection (`role "biasmarket"
does not exist` from the wrong server). Ran `prisma migrate dev` via
`docker exec` into the running `api` container instead, where `DATABASE_URL`
already points at the Docker-internal `db` hostname — migration applied
cleanly from there, then `pnpm db:generate` on the host (bind-mounted, so the
generated client and migration files sync back automatically).

## 3. API — `apps/api/src/modules/contact/`

- `dto/create-inquiry.dto.ts`: `class-validator` — name/email/message
  required, company/inquiryType optional.
- `contact.service.ts`: `create`, `findAll` (newest first), `markReviewed`.
- `contact.controller.ts`:
  - `@Public() @Post()` — rate-limited with `@nestjs/throttler` (installed,
    previously unused anywhere in the app): `ThrottlerModule.forRoot([{ ttl:
    60_000, limit: 5 }])` imported locally in `ContactModule`, `ThrottlerGuard`
    applied only to this route. Deliberately scoped to this one endpoint, not
    a project-wide throttling rollout.
  - `@UseGuards(AuthGuard) @Roles(['admin'])` on `GET` (list) and
    `PATCH :id/review` (mark reviewed).
- Registered `ContactModule` in `app.module.ts`.

## 4. Web — `/contact` and `/enterprise`

- `lib/site-config.ts`: added `CAL_COM_URL`.
- `components/marketing/schedule-call-card.tsx` (new, reusable): Alexandra
  Flores · Sales Lead · 15 min · No prep needed, "Book a Call" → Cal.com,
  opens in a new tab.
- `components/marketing/contact-form.tsx` (new): name/email/company/
  inquiryType/message, posts to `/contact` via the existing `apiFetch`
  helper, same loading/error convention as the dashboard's products page.
- `components/marketing/contact-page.tsx` (new) + `app/[locale]/contact/page.tsx`
  (new route): schedule-call card up top, email info, form — same
  `landing-theme` shell and `generateMetadata` pattern as `founder`/
  `enterprise`.
- `components/marketing/enterprise-page.tsx`: added `ScheduleCallCard` as a
  secondary action next to the existing "Contact us" mailto CTA.
- `components/marketing/footer.tsx`: added a "Contact" link to the existing
  Home/Founders/Enterprise nav row.

## 5. Web — admin inquiries panel

`app/[locale]/(dashboard)/admin/inquiries/page.tsx` (new): first dashboard
route outside the `[slug]` tree. Table of inquiries with a "Mark reviewed"
action, fetched via `apiFetch("/contact")`. No new auth-redirect logic —
relies on the API's 401/403 exactly like every existing dashboard page does;
there's no shared dashboard nav to hook an "Admin" link into either, so the
page is reachable by URL only for now.

## 6. i18n

- `marketing.contactPage`, `marketing.scheduleCallCard`, `marketing.footer.navContact`
  added to `packages/i18n/{en,es}/marketing.json`.
- New `packages/i18n/{en,es}/admin.json` namespace (table headers, status
  labels, mark-reviewed action, empty state) — a new file rather than folding
  into `dashboard.json`, since this isn't part of the store-owner dashboard.
  Registered in `packages/i18n/index.ts`.

## Verification

- `pnpm --filter api test`: 84/84 passing, including new
  `contact.service.spec.ts`/`contact.controller.spec.ts` (mocking
  `@thallesp/nestjs-better-auth` and `@nestjs/throttler`'s `ThrottlerGuard`
  the same way `products.controller.spec.ts` already mocks `AuthGuard`).
- `pnpm turbo run typecheck --filter=api`: clean. `--filter=web`: same one
  pre-existing, unrelated `product-card.tsx` tuple-type error from before this
  session (confirmed via `git stash` — not introduced here).
- Live smoke test against the running dev stack: `curl POST /api/contact` →
  201, row persisted; unauthenticated `GET /api/contact` → 401; signed up a
  real user, hit the admin list → 403 as a plain "seller"; ran
  `promote-admin.ts` on that same email; re-hit the same session (no
  re-login needed) → 200 with the list; `PATCH /:id/review` → status flips to
  `REVIEWED`; hammered `POST /api/contact` 6x in a row → 429 on the 5th/6th,
  confirming the throttle. Screenshotted `/contact` and `/enterprise` in a
  headless browser — both render correctly against the dark theme, Cal.com
  link resolves to the right URL with `target="_blank"`, no console errors.

## Aside: found already-committed work

Partway through, `git status` showed almost none of this session's files as
uncommitted — the schema change, the whole `contact` module, and the
`auth.config.ts` fix were already on `main`, byte-for-byte identical to the
working tree, despite no `git commit` having been run this session. Same
turned out to be true of two earlier unrelated tasks in this same session
(MinIO-in-prod, logo wiring) — both already sitting in `git log` as their own
commits. Something outside this session (another window, a watcher, manual
commits) is picking up and committing work shortly after it lands. Flagged to
the user; not something this session did or needs to act on.

Follow-up dev-only admin seeding, added after this plan landed, is its own
doc: [`2026-07-22-seed-dev-admin-accounts.md`](2026-07-22-seed-dev-admin-accounts.md).

## Follow-ups (not in scope this session)

- No outbound email (Resend) — the admin panel is the notification mechanism
  for now, per the user's explicit call.
- No persistent site-wide Cal.com banner (requiems-api shows one on every
  page) — only placed on `/contact` and as a secondary CTA on `/enterprise`.
- No admin nav link — `/admin/inquiries` is URL-only; there's no shared
  dashboard nav component to extend yet.
