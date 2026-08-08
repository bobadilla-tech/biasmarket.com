# infra/caddy

Reverse proxy config used only by the prod stack
(`infra/docker/docker-compose.yml`). Three subdomains, one service each —
`api.biasmarket.com` → `api`, `biasmarket.com` → `web`, `cdn.biasmarket.com` →
`minio` (public-read bucket for product images/store logos, S3 API port 9000
only — the admin console on 9001 is never routed here). Each gets its own
automatic Let's Encrypt cert. The API still serves every route under `/api`
internally (`app.setGlobalPrefix('api')` in `apps/api/src/main.ts`, including
better-auth's routes at `/api/auth/*`) — that's just no longer something Caddy
needs to know about, since routing is by subdomain, not by path.

Not used in dev — `docker-compose.dev.yml` exposes `api` (3000) and `web` (3001)
directly on separate host ports instead.
