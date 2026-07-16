# infra/caddy

Reverse proxy config used only by the prod stack (`infra/docker/docker-compose.yml`). Routes `/api/*` to the `api` service and everything else to `web`, based on the `app.setGlobalPrefix('api')` set in `apps/api/src/main.ts` — every route the API serves lives under `/api`, including better-auth's own routes at `/api/auth/*`.

Not used in dev — `docker-compose.dev.yml` exposes `api` (3000) and `web` (3001) directly on separate host ports instead.
