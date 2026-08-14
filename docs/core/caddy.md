# Production Caddy

Production Caddy is part of the blue/green VPS stack and is defined by
`infra/vps/Caddyfile`. The live upstream fragments are generated in
`infra/vps/caddy/active/` by `deploy.sh`; they are never hand-edited or synced
from Git.

The stable domains are:

- `api.biasmarket.com` → `api-blue` or `api-green` on port 3000
- `biasmarket.com` → `web-blue` or `web-green` on port 3001
- `cdn.biasmarket.com` → `minio` on port 9000
- `status.biasmarket.com` → `uptime-kuma`

Deploys atomically replace the active fragments and reload Caddy without
restarting it. Development uses `infra/docker/docker-compose.dev.yml` and does
not use Caddy.
