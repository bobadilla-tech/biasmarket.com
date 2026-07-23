# Granting admin access

How to make an existing account an admin — in prod and in dev. See
[admin.md](admin.md) for what admin access actually unlocks
(`/admin/inquiries`, `/admin/stores` + impersonation).

## How it works

`role` is **not** self-assignable — `apps/api/src/auth/auth.config.ts`
configures the better-auth `admin` plugin with `input: false` on `role`, so
nothing in the signup API can set it. The only way to grant `admin` is
running `apps/api/scripts/promote-admin.ts` directly against the database,
aliased as the `admin:promote` pnpm script for convenience:

```bash
pnpm --filter api run admin:promote <email>
```

**Prerequisite:** the account must already exist — this only promotes an
existing user, it doesn't create one. Have the person sign up normally
first (real password, via `/onboarding`), then promote that email.

**Takes effect immediately** — no re-login needed. Sessions are looked up
fresh from the database on every request (not cached in a JWT), so a user
who's already logged in when you promote them will have admin access on
their very next request, confirmed by testing this exact sequence.

## Prod

```bash
docker compose -f infra/docker/docker-compose.yml exec api pnpm run admin:promote user@example.com
```

Run this on the VM, from the repo root (wherever `docker-compose.yml` lives
relative to your shell — adjust the `-f` path if you're elsewhere). The
`api` container's working directory is already `/app`, so no `cd` is needed.

## Dev

Same command, against the dev compose file instead:

```bash
docker compose -f infra/docker/docker-compose.dev.yml exec api pnpm run admin:promote user@example.com
```

Usually unnecessary though — the dev stack already seeds two ready-to-use
admin logins on every boot (`apps/api/scripts/seed-dev.ts`, see
[infra.md](infra.md)'s credentials table). Only reach for this if you need
to promote some *other* account you created by hand.

## Revoking admin access

No script for this (kept `promote-admin.ts` single-purpose). Direct SQL,
run the same way:

```bash
docker compose -f infra/docker/docker-compose.yml exec db psql -U biasmarket -d biasmarket \
  -c "update \"user\" set role = 'seller' where email = 'user@example.com';"
```
