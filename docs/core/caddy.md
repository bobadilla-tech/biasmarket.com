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

## Edge

Public traffic reaches Caddy through Cloudflare. The global options block in the
Caddyfile trusts Cloudflare's proxy ranges (strictly, as a chain read from the
right) and takes the client IP from `CF-Connecting-IP`; a direct connection to
the origin is not trusted, so a forged header is ignored. The API trusts exactly
one proxy hop (Caddy), so the address Caddy settles on is the one rate limits
use (see [security-payments.md](security-payments.md#74-abuse-prevention)). The
Caddyfile and `infra/terraform/cloudflare.tf` hold the exact ranges, routes and
records.

## Access logs and token redaction

Caddy logs requests for `api.biasmarket.com` and `biasmarket.com` (the
`(redact_log)` snippet at the top of the Caddyfile; `cdn.` and `status.` are not
logged). Before this there was no access log at all, so the log now contains
client IPs, methods, paths and status codes. Retention is Docker's `json-file`
driver capped at 5 files of 10 MB (`infra/vps/docker-compose.yml`).

Assisted order links carry a private token in the path
(`/api/public/orders/<token>` on the API, `/store/<slug>/pedido/<token>` and the
`/es|en/...` variants on the web). Both the snippet and the default logger in
the global options block rewrite the token segment to `REDACTED` and drop the
`Referer`, `Idempotency-Key` request header, and `X-Session-Token` response
header before a line is written. The default logger matters: `reverse_proxy`
runtime errors (for example "connection refused" during a blue/green switch) are
written there and include the request URI. Keep the two redaction rules
identical, and update both if a new route ever carries a credential. Caddy's
JSON log fields use `request>headers` for request headers and `resp_headers` for
response headers.

Changing the Caddyfile does not take effect by merging alone: the compose file
bind-mounts the single file `./Caddyfile`, `cd.yml` rsyncs with
`--delay-updates` (new inode) and `deploy.sh` only reloads Caddy, so the
container can keep reading the old file. After a Caddyfile change recreate the
container (`docker compose up -d --force-recreate caddy`, through
`lib/compose.sh`) and confirm with
`docker exec <caddy> cat /etc/caddy/Caddyfile`.

Local check (no VPS needed): `caddy validate` the whole file with
`caddy/active/*.caddy` created from the `.example` files, then run a throwaway
`:8080` config with `auto_https off` that uses the same snippet and global log,
point `reverse_proxy` at a dead upstream, request `/api/public/orders/SECRET`,
`/es/store/x/pedido/SECRET?x=1` and a request with `Referer: .../pedido/SECRET`,
and assert `SECRET` is absent from `docker logs`.

## Next.js middleware-probe filter

The `biasmarket.com` site rejects requests carrying `x-middleware-subrequest` in
Caddy before the web upstream is reached. This internal header is not part of a
legitimate browser request; dropping it at the edge also keeps scanner traffic
out of the Next.js logs.

The app currently pins Next.js `16.3.8` in `apps/web/package.json`. The
[CVE-2025-29927 advisory](https://github.com/advisories/GHSA-f82v-jwr5-mffw)
lists affected releases through patched versions in the 12.x–15.x lines; Next.js
16 is outside the affected ranges. The Caddy matcher is defense in depth for
these probes.

## Related

- [deploy.md](deploy.md) for how a Caddyfile change ships and the deploy flow.
- [operations.md](operations.md) for the `caddy` service and the other shared
  services.
- [security-payments.md](security-payments.md) for the token-redaction rationale
  and rate limiting.
