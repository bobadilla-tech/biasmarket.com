# Docker build setup: caching, and how it's verified

Research + fixes from an audit of `infra/docker/api.Dockerfile` and
`web.Dockerfile` — what was already cached well, what wasn't, and a real bug
found while testing the fix. For the day-to-day compose commands, see
[infra.md](infra.md); for prod deploy steps, see [deploy.md](deploy.md).

## What was already caching well

- **Multi-stage builds** (`base` → `deps` → `build` → `runtime`). The `deps`
  stage only `COPY`s `package.json` files before `pnpm install` — so editing
  application source never invalidates that layer, only a `package.json`/
  `pnpm-lock.yaml` change does.
- **BuildKit cache mount for the pnpm store**
  (`--mount=type=cache,id=pnpm-store,target=/pnpm-store`). This persists across
  builds independently of Docker's layer cache — even when the `deps` layer
  _does_ rebuild (lockfile changed), already-downloaded packages don't get
  re-fetched.
- **`COMPOSE_BAKE=true`** (`infra/docker/.env.example`) — Compose uses buildx
  Bake, which builds `api`/`web` in parallel rather than sequentially.
- **Shared `base` stage** — `api.Dockerfile` and `web.Dockerfile` both start
  with an identical `FROM node:26-slim` + corepack-install block, so BuildKit
  reuses that layer across both images on the same builder.
- CI (`.github/workflows/ci.yml`) never builds Docker images at all — it's pure
  `turbo lint/build/test` per changed package on GitHub runners, path- filtered
  per package. Docker images only ever get built at deploy time, on the VM
  itself (`pnpm docker:prod`).

## Gap found: Turbo's own cache wasn't persisted

`RUN pnpm exec turbo run build --filter=api` (and `--filter=web`) ran cold on
every single build. Even when `packages/utils`/`i18n`/`types` hadn't changed
since the last deploy, Turbo had no memory of that inside the ephemeral `build`
stage — `.turbo` is (correctly) excluded via `.dockerignore`, and nothing
carried a cache forward another way. Every deploy recompiled every workspace
package from scratch, regardless of how small the actual change was.

**Fix:** the same BuildKit cache-mount pattern already used for the pnpm store,
applied to Turbo's cache directory too:

```dockerfile
RUN --mount=type=cache,id=turbo-cache,target=/app/.turbo \
    pnpm exec turbo run build --filter=api
```

Applied to both Dockerfiles. Low-risk — one line each, no behavior change, just
lets Turbo skip unchanged package builds across deploys on the same VM/builder.

## Bug found while verifying the fix: `apps/api/scripts` was never in the runtime image

While testing the Turbo cache change against a real build, ran `admin:create`
against the built runtime image and hit
`Cannot find module '/app/apps/api/scripts/create-admin.ts'` — the exact failure
the user had already hit in prod. Root cause: the `runtime` stage's
`COPY --from=build` list never included `apps/api/scripts` at all:

```dockerfile
COPY --from=build --chown=nestjs:nestjs /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=nestjs:nestjs /app/apps/api/package.json ./apps/api/package.json
# packages/, package.json, pnpm-workspace.yaml... but never apps/api/scripts
```

This was invisible in dev because `docker-compose.dev.yml` bind-mounts the whole
repo (`../..:/app`) — `scripts/` is always present on disk there regardless of
what any Dockerfile `COPY`s. Prod's `runtime` stage is copy-only (no bind
mount), so `promote-admin.ts`/`create-admin.ts` (and by extension
`pnpm admin:create:prod`/`admin:promote:prod`, see
[admin-access.md](admin-access.md)) could never have worked in prod — the
scripts existed in the `build` stage but were never copied into the final image.

**Fix:** added the missing `COPY`:

```dockerfile
COPY --from=build --chown=nestjs:nestjs /app/apps/api/scripts ./apps/api/scripts
```

## Verification

Built the `api` image's `build` and `runtime` targets standalone
(`docker build -f infra/docker/api.Dockerfile --target <stage> ...`, not through
compose, to isolate each stage):

- `docker run --rm <runtime-image> ls apps/api/scripts` — confirmed
  `create-admin.ts`/`promote-admin.ts`/`seed-dev.ts` are now present.
- Ran the actual runtime image against the real dev Postgres (attached to the
  dev compose network, real `DATABASE_URL`):
  `pnpm --filter api run
  admin:create <email>` succeeded end-to-end — account
  created, password printed, exactly reproducing (and confirming the fix for)
  the failure from the live prod attempt. Cleaned up the test account afterward.
- Test images (`biasmarket-api-buildtest`, `biasmarket-api-runtime-test`)
  removed after verification — not meant to stick around as real tags.

## Status

Both fixes are in `infra/docker/api.Dockerfile` (Turbo cache mount + scripts
copy) and `infra/docker/web.Dockerfile` (Turbo cache mount only — `web`'s
runtime stage doesn't need any api-scripts-style fix, it copies Next's
standalone output wholesale). Next real prod deploy (`pnpm docker:prod` on the
VM) picks up both.

## Not done (bigger lift, optional)

- **Turbo Remote Cache** (Vercel-hosted or self-hosted) — would let cache hits
  carry across machines (e.g. CI populates it, the VM reuses it), not just
  across repeated builds on the same VM. Every `turbo` run today shows "Remote
  caching disabled." Not pursued here since the actual use case (single VM,
  redeploy after a small change) is already solved by the local BuildKit mount —
  only worth it if builds start happening on more than one machine.
