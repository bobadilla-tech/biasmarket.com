# infra/docker

## Dev

```bash
docker compose -f infra/docker/docker-compose.dev.yml up --build
```

Brings up `db` (Postgres 15), `api` (NestJS, hot reload via `nest start --watch`), and `web` (Next.js, hot reload via `next dev`). Source is bind-mounted from the repo root so edits on the host are picked up immediately; `node_modules` for every package each service touches lives in a named Docker volume (never a host-mounted `node_modules`, since native binaries like Prisma's engines are Linux-specific and the host here is macOS).

Env vars come from `.env.example` (committed, safe defaults) with an optional, gitignored `.env.local` layered on top for personal overrides — not required to exist.

Prisma migrations run automatically (`prisma migrate deploy`) before the api starts.

Data persists in the `db_data` named volume across `docker compose down`; use `down -v` to wipe it.

## Prod

```bash
cd infra/docker
cp .env.example .env   # then fill in real secrets
docker compose -f docker-compose.yml up -d --build
```

Builds multi-stage production images for `api` and `web` (code baked in, no bind mounts) and fronts everything with `caddy`, which is the only service that publishes ports to the host. `api`, `web`, and `db` are reachable only on the internal Docker network — never expose them directly in production.

`NEXT_PUBLIC_API_URL` is a Next.js build-time value (inlined into the client bundle), so it's passed as a Docker build `arg` rather than only a runtime env var.
