# Docker images

How the application images are built, what is cached, and the pitfalls found
along the way. For the dev Compose workflow see [docker-dev.md](docker-dev.md);
for production deploys see [deploy.md](deploy.md). The earlier audit narrative
that led to this setup is kept as history in
[`docker-audit-history.md`](../../.artifacts/2026/10/20261030--docs-full-audit/docker-audit-history.md).

## Images

Three Dockerfiles live in `infra/docker/`:

| File                 | Image   | Notes                                                |
| -------------------- | ------- | ---------------------------------------------------- |
| `api.Dockerfile`     | api     | Has a `dev` target and the default `runtime` target. |
| `workers.Dockerfile` | workers | Same shape as `api`; no Prisma step, no database.    |
| `web.Dockerfile`     | web     | Runtime copies Next's standalone output.             |

`docker-compose.dev.yml` builds target `dev` (source is bind-mounted, nothing to
compile). The VPS blue/green stack uses the default `runtime` target. CI and CD
run the application checks and build the production images on an amd64 GitHub
runner, push SHA-tagged images to GHCR, and the VPS pulls them during
`deploy.sh`; the VPS does not build application images.

## Stages and caching

- **Multi-stage** (`base` -> `deps` -> `build` -> `runtime`). `deps` copies only
  the `package.json` files before `pnpm install`, so editing source never
  invalidates that layer; only a `package.json` or `pnpm-lock.yaml` change does.
  Every workspace member's `package.json` must be copied there because
  `pnpm install --frozen-lockfile` reconciles against the whole workspace
  lockfile.
- **Shared `base` stage.** Each Dockerfile starts from the same Node image plus
  a pinned corepack and pnpm install block, so BuildKit reuses that layer across
  images on the same builder.
- **pnpm store cache mount** (`--mount=type=cache,id=pnpm-store`). Persists
  across builds independently of the layer cache, so a lockfile change does not
  re-download every package.
- **Turbo cache mount** (`--mount=type=cache,id=turbo-cache,target=/app/.turbo`)
  on the `turbo run build` step in each Dockerfile. `.turbo` is excluded by
  `.dockerignore`, so without the mount every build recompiles every workspace
  package from scratch.
- **`COMPOSE_BAKE=true`** in `infra/docker/.env.example` makes Compose build
  through buildx Bake, so the images build in parallel.

Turbo Remote Cache is not used. It would only help if builds ran on more than
one machine.

## Runtime image requirements

- **`apps/api/scripts` must be copied into the `api` runtime stage.** The
  one-off ops scripts (`admin:create`, `admin:promote`, the seed) run through
  `docker compose exec api pnpm --filter api run <script>` and need their
  sources in the image. This was missing once: `admin:create` in production
  failed with `Cannot find module '/app/apps/api/scripts/create-admin.ts'`. It
  stayed invisible in dev because the dev Compose file bind-mounts the whole
  repo, so `scripts/` is always on disk there. The `runtime` stage is copy-only,
  so anything it needs must be in an explicit `COPY --from=build`. To check,
  build the `runtime` target and list `apps/api/scripts` in it.
- **Migrations do not run at container start.** The deploy runs them as a
  separate phase; see [blue-green-migrations.md](blue-green-migrations.md).
- The `workers` runtime copies only the workers build and `packages/`; it never
  depends on `@biasmarket/db`.

## Related

- [docker-dev.md](docker-dev.md): dev Compose workflow.
- [deploy.md](deploy.md): how the images reach production.
- [ci.md](ci.md): CI and the image build jobs.
