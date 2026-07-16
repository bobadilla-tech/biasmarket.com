# infra

Docker-based dev and prod setup for barriomart-app, mirroring the pattern used in `requiems-api`.

- `docker/` — dev and prod Docker Compose files, Dockerfiles, and env defaults. See `docker/readme.md`.
- `caddy/` — reverse proxy config used only by the prod stack. See `caddy/readme.md`.

## Quick start (dev)

```bash
docker compose -f infra/docker/docker-compose.dev.yml up --build
```

This is the primary, sanctioned dev workflow: Postgres, the NestJS API, and the Next.js web app all start from one command, with zero manual `.env` setup — `infra/docker/.env.example` is committed with working dev defaults and is loaded automatically.

Running `pnpm dev` natively on the host (outside Docker) still works, but now requires manually recreating your own gitignored `.env` files (root, `apps/api/.env`, `apps/web/.env`, `packages/db/.env`) since the ones that used to live there have been removed in favor of this setup.
