# Seed dev admin accounts

## Context

Follow-up to
[`2026-07-22-contact-page-cal-com-admin-inquiries.md`](2026-07-22-contact-page-cal-com-admin-inquiries.md),
which added `@Roles(['admin'])`-gated routes (`/admin/inquiries` and its
backing `GET/PATCH /api/contact`) plus `apps/api/scripts/promote-admin.ts` as
the only way to grant that role. Testing those routes meant signing up a
fresh user and manually running `promote-admin.ts` on it every time the dev
DB got reset — asked for dev mode to just seed some admin accounts instead.

## What changed

`apps/api/scripts/seed-dev-admins.ts` (new): creates two ready-to-use admin
logins —

| Email                  | Password          |
| ----------------------- | ----------------- |
| `admin@biasmarket.dev`  | `devpassword123`  |
| `owner@biasmarket.dev`  | `devpassword123`  |

Idempotent — if an account already exists it just re-asserts `role: "admin"`
and moves on, so it's safe to run on every container boot rather than only
once against a fresh DB.

**Real accounts, not a shortcut.** Writes a `User` + `Account` row directly
via Prisma (same `PrismaPg` adapter pattern as `promote-admin.ts`), but
hashes the password with better-auth's own `hashPassword` from
`better-auth/crypto` — the exact function the real signup flow uses. This
means these accounts work through the actual `/api/auth/sign-in/email`
login, not a bypassed/fake session. Verified by actually signing in with
`admin@biasmarket.dev` and hitting an admin-gated route with the resulting
session cookie.

**Wiring:** added to `infra/docker/docker-compose.dev.yml`'s `api` command,
right after `prisma migrate deploy` and before the app starts:
```
pnpm --filter @biasmarket/db exec prisma migrate deploy &&
pnpm --filter api exec node scripts/seed-dev-admins.ts &&
pnpm exec concurrently -k -n pkg,build,run ...
```
No chicken-and-egg problem running it before the app boots — the script
writes straight to Postgres via Prisma, it doesn't need the API's HTTP
server listening (unlike calling the signup endpoint over HTTP, which would
require the app to already be up).

**Dev-only, by construction.** `docker-compose.yml` (prod) has no equivalent
step — this only ever runs as part of `docker-compose.dev.yml`'s `api`
command chain.

Documented in `docs/core/infra.md`'s dev quick-start section so the
credentials are discoverable without reading the script.

## Verification

- Ran the script twice in a row against the running dev container — second
  run logged "already existed — ensured role: admin" for both accounts
  instead of erroring or duplicating rows.
- `curl POST /api/auth/sign-in/email` with `admin@biasmarket.dev` /
  `devpassword123` → 200, real session token.
- Same session → `GET /api/contact` → 200 (admin-gated route), confirming
  the seeded role actually authorizes correctly, not just that the row has
  `role: "admin"` in the DB.
- `pnpm turbo run typecheck --filter=api` clean.
