# Docker build caching audit + a real prod bug found along the way

## Context

Asked to check whether the Docker build setup was caching well and whether
builds could be sped up — prompted directly by a slow prod rebuild the user had
just done (`git pull` + `pnpm docker:prod` to pick up the new
`admin:create`/`admin:promote` scripts). Audited both `api.Dockerfile` and
`web.Dockerfile` before touching anything.

Full research + findings write-up lives in the living reference doc:
[`docs/core/docker.md`](../core/docker.md). This plan doc is the shorter
changelog version — what changed and why, not the full audit.

## What was already good

Multi-stage builds, a BuildKit cache mount for the pnpm store, `COMPOSE_BAKE`
enabled, and a shared `base` stage reused across both Dockerfiles by BuildKit.
CI never builds Docker images at all — only the VM does, at deploy time.

## Fix 1: Turbo's own cache was never persisted

Every `pnpm exec turbo run build --filter=api` (or `web`) ran cold on every
build — `.turbo` is correctly `.dockerignore`d, but nothing replaced it with a
persistent mechanism, so Turbo recompiled every workspace package from scratch
on every deploy regardless of what actually changed. Fixed with the same
BuildKit cache-mount pattern already used for the pnpm store:

```dockerfile
RUN --mount=type=cache,id=turbo-cache,target=/app/.turbo \
    pnpm exec turbo run build --filter=api
```

Applied to both Dockerfiles.

## Fix 2 (the real bug): `apps/api/scripts` was never in the prod runtime image

Building the `runtime` target standalone to verify fix 1 surfaced this: the
`runtime` stage's `COPY --from=build` list never included `apps/api/scripts` at
all. Invisible in dev (bind-mounts the whole repo, so `scripts/` is always on
disk there regardless of any Dockerfile `COPY`), but in prod — copy-only, no
bind mount — this meant `promote-admin.ts`/ `create-admin.ts` (the whole
`admin:create:prod`/`admin:promote:prod` workflow from
[`2026-07-22-admin-login-redirect-impersonation-seed.md`](2026-07-22-admin-login-redirect-impersonation-seed.md))
could never have worked in prod at all. Confirmed this is exactly what the user
hit live (`Cannot find module '/app/apps/api/scripts/create-admin.ts'` after a
real `pnpm admin:create:prod` attempt on the Oracle VM).

```dockerfile
COPY --from=build --chown=nestjs:nestjs /app/apps/api/scripts ./apps/api/scripts
```

## Verification

Built the `api` image's `build` and `runtime` targets standalone
(`docker build -f infra/docker/api.Dockerfile --target <stage>`, isolated from
compose) and the `web` image's `build` target:

- `docker run --rm <runtime-image> ls apps/api/scripts` — confirmed the three
  scripts are now present.
- Ran the actual runtime image attached to the dev Postgres network with a real
  `DATABASE_URL`: `pnpm --filter api run admin:create <email>` succeeded
  end-to-end (account created, password printed) — reproducing and then
  confirming the fix for the exact prod failure.
- Cleaned up test accounts and test-tagged images afterward.

## Status

Both fixes are live in `infra/docker/api.Dockerfile` (Turbo cache mount + the
scripts copy) and `infra/docker/web.Dockerfile` (Turbo cache mount only). Picked
up on the next real `pnpm docker:prod` on the VM — no other action needed.

## Not done (optional, bigger lift)

Turbo Remote Cache (cache shared across machines, e.g. CI → VM) — not pursued
since the actual pain point (single VM, redeploy after a small change) is
already solved by the local BuildKit mount. Worth reconsidering only if builds
start happening on more than one machine.
