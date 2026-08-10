# Deploying to Oracle Cloud (OCI)

Prod deploy target for the MVP: a single Oracle Cloud VM running the
`infra/docker/docker-compose.yml` stack. This doc covers everything specific to
OCI — the stack itself (Docker Compose + Caddy) is host-agnostic and already
documented in [`infra.md`](infra.md) and [`readme.md`](readme.md).

Goal here is "get it live and shareable," not a hardened production setup — see
[Known limitations](#known-limitations) at the bottom for what's deliberately
deferred.

## 1. Provision the VM

- Shape: an Ampere A1 (arm64) instance is the free-tier default and is fine —
  every image in this stack (`node:26-slim`, `postgres:18`, `caddy:2-alpine`) is
  multi-arch, no x86-only dependency anywhere in the build.
- OS: Ubuntu 24.04 (matches what's assumed below; aarch64).
- **Attach a reserved/static public IP**, not the default ephemeral one. A
  reserved IP survives instance stop/reboot; an ephemeral one can change, which
  silently breaks your DNS A record and any Google indexing pointed at it.
  (Instance → attached VNIC → IP management → reserve.)
- Open ports in the instance's **Security List or Network Security Group** (VCN
  → your subnet → Security Lists/NSGs) — this is separate from the OS firewall
  and both must allow the traffic:
  - `22/tcp` (SSH, ideally restricted to your IP)
  - `80/tcp`, `443/tcp` (HTTP/HTTPS — Caddy needs 80 for the ACME challenge even
    though it upgrades everything to HTTPS)

  Console path: **Networking → Virtual Cloud Networks → (your VCN) → Subnets →
  (your subnet) → Security Lists → Default Security List → Ingress Rules → Add
  Ingress Rules**. The Default Security List ships with only `22/tcp` + ICMP —
  80/443 are **not** there by default and are easy to assume are already open
  when they aren't. For each: Source CIDR `0.0.0.0/0`, IP Protocol `TCP`,
  Destination Port Range `80` (repeat for `443`), Stateless unchecked.

## 2. Open the OS firewall (the actual "why can't I connect" fix)

Ubuntu images on OCI ship with pre-populated `iptables` rules
(netfilter-persistent) that drop unsolicited inbound traffic — opening the port
in the OCI console alone is not enough, this trips up almost everyone on their
first OCI deploy.

**Check the actual rule order first** — don't assume a fixed position:

```bash
sudo iptables -L INPUT -n --line-numbers
```

Find the line number of the `REJECT ... reject-with icmp-host-prohibited` rule.
New ACCEPT rules must be inserted **at that line number** (pushing REJECT down),
not after it — the position isn't reliably `6`, it drifts as other rules (ufw,
prior attempts) get added. If you insert after REJECT instead of before it, the
rule is silently dead: traffic hits REJECT first and never reaches your ACCEPT
rule.

```bash
# replace 5 with the REJECT line number you found above
sudo iptables -I INPUT 5 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 5 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

If you already ran a version of this before and it didn't work, check for
**duplicate dead rules** sitting below REJECT
(`iptables -L INPUT -n
--line-numbers` again) — delete them instead of adding
more on top (`sudo iptables -D INPUT <n>`, highest number first so line numbers
don't shift under you), then re-insert at the correct position.

Or replace iptables with `ufw`:

```bash
sudo apt install -y ufw
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Verify from your own machine after this step: `curl -I http://<vm-ip>` should
get a response (even a 404) once Caddy is up, not a timeout.

## 3. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker compose version   # confirm the compose plugin is present
```

## 4. Point DNS at the VM

The stack uses four subdomains — `biasmarket.com` for the storefront/dashboard
(`web`), `api.biasmarket.com` for the API (`api`), `cdn.biasmarket.com` for
public product images/store logos (`minio`), and `status.biasmarket.com` for the
Uptime Kuma status page — each getting its own Caddy-issued cert (see
[`../caddy/Caddyfile`](../caddy/Caddyfile)). Create **four** A records pointing
at the reserved public IP from step 1:

| Host                                       | Points to               |
| ------------------------------------------ | ----------------------- |
| `biasmarket.com` (and `www` if you use it) | VM's reserved public IP |
| `api.biasmarket.com`                       | VM's reserved public IP |
| `cdn.biasmarket.com`                       | VM's reserved public IP |
| `status.biasmarket.com`                    | VM's reserved public IP |

Confirm all four resolve (`dig +short biasmarket.com`,
`dig +short
api.biasmarket.com`, `dig +short cdn.biasmarket.com`,
`dig +short status.biasmarket.com`) before starting the stack — Caddy's
automatic HTTPS will fail its ACME challenge for a domain that isn't live yet,
though it retries.

**If DNS is proxied through Cloudflare** (orange cloud, not grey/DNS-only): set
SSL/TLS mode to **Full** in Cloudflare dashboard → SSL/TLS → Overview. Not
Flexible (Caddy always serves HTTPS, so Flexible mismatches). Not Full-strict
until you've confirmed Caddy's origin cert issued successfully — strict mode
will hard-fail the handshake against an unissued/self-signed cert.

Cloudflare surfaces origin-connectivity problems as its own error codes, useful
for diagnosing which layer is broken:

| Code  | Meaning                                                    | Check                                                                                              |
| ----- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `522` | Cloudflare can't reach the origin at all (TCP timeout)     | OS iptables (step 2) **and** OCI Security List/NSG (step 1) — both must allow 80/443, not just one |
| `525` | Cloudflare reached the origin but the TLS handshake failed | Caddy likely hasn't obtained a valid cert yet — see the cert troubleshooting note in step 7        |

## 5. Clone the repo and configure secrets

```bash
git clone https://github.com/bobadilla-tech/biasmarket.com.git biasmarket
cd biasmarket
pnpm install
pnpm env:init --prod
```

`pnpm env:init --prod` writes `infra/docker/.env` from `.env.example` with a
fresh `POSTGRES_PASSWORD`, matching `DATABASE_URL`, and a fresh
`BETTER_AUTH_SECRET` (never reuse the committed dev value), and points
`BETTER_AUTH_URL`/`WEB_URL`/`NEXT_PUBLIC_API_URL` at
`api.biasmarket.com`/`biasmarket.com`. Refuses to overwrite an existing `.env` —
pass `--force` to regenerate. See `scripts/init-env.ts`.

Deploying under a different domain? Run `pnpm env:init --prod`, then edit the
four URL vars by hand (`BETTER_AUTH_URL`, `WEB_URL`, `NEXT_PUBLIC_API_URL`,
`S3_PUBLIC_URL`) — and update `../caddy/Caddyfile`, which is hardcoded to
`api.biasmarket.com` / `biasmarket.com` / `cdn.biasmarket.com`.

## 6. Bring up the stack

```bash
cd ../..   # repo root
pnpm docker:prod
# equivalent to: docker compose -f infra/docker/docker-compose.yml up -d --build
```

The `api` container runs `prisma migrate deploy` automatically on every start
before launching the server (see `api.Dockerfile`), so the schema is created on
first boot — no manual migration step needed.

## 7. Verify

```bash
docker compose -f infra/docker/docker-compose.yml ps        # all healthy
docker compose -f infra/docker/docker-compose.yml logs api  # migrations ran, no errors
curl -I https://biasmarket.com                                # 200, valid cert
curl https://api.biasmarket.com/api/health                    # {"status":"ok","db":"ok"}
```

If the cert didn't issue: check `docker compose logs caddy` — almost always
either DNS not yet resolving, or port 80/443 still blocked by security
list/iptables (steps 1–2).

Caddy attempts the ACME challenge once at container boot and does **not** retry
immediately if it fails — if you fix DNS or firewall issues _after_ the stack is
already up, restart Caddy to force a retry rather than waiting:

```bash
docker restart biasmarket-caddy-1
docker logs biasmarket-caddy-1 --tail 50 -f
```

Look for a "certificate obtained successfully" log line before retesting
`curl -I https://biasmarket.com`.

### Image uploads (MinIO)

Product images and store logos are stored in a self-hosted MinIO instance (the
`minio` service), not the R2 setup described in [`roadmap.md`](roadmap.md) — see
the note there. On first boot the one-shot `minio-init` service (`minio/mc`)
creates three buckets — `S3_BUCKET` for product images and `S3_LOGO_BUCKET` for
store logos, both set public-read, and `S3_PAYMENT_BUCKET` for payment-proof
images (bank-transfer/Yape/Plin screenshots), deliberately left **without** a
public-read policy — it's idempotent, so it also runs harmlessly on every
redeploy.

Payment images are never linked directly (no public URL is ever handed to a
browser); they're read exclusively through the authenticated
`GET stores/:storeId/orders/:orderId/payments/:paymentId/image` endpoint, which
streams the object through the API after the usual `assertOwnership` check — see
`apps/api/src/modules/orders/infrastructure/order.controller.ts` and
`docs/plans/2026-08-08-payment-proof-image-access-control-plan.md` for why a
presigned-URL redirect was rejected in favor of streaming (the Docker-internal
vs. public `S3_ENDPOINT` mismatch).

`S3_LOGO_BUCKET`/`S3_PAYMENT_BUCKET` are validated at boot the same way as the
other `S3_*` vars — if either is missing from the server's `.env`, the API
crashes on startup rather than just failing that upload/read path. When pulling
in the change that introduced `S3_PAYMENT_BUCKET`, add
`S3_PAYMENT_BUCKET=payments` to `~/biasmarket/infra/docker/.env` **before**
running `pnpm docker:prod`.

Verify it worked:

```bash
docker compose -f infra/docker/docker-compose.yml logs minio-init
# should show "Bucket created successfully" / "Access permission ... set successfully"
```

Then upload a product image through the dashboard and confirm the returned URL
(`https://cdn.biasmarket.com/<bucket>/products/<uuid>.jpg`) loads over HTTPS in
a browser, and a store logo the same way
(`.../<S3_LOGO_BUCKET>/logos/<uuid>.jpg`). If uploads fail, check
`docker compose logs api` for a `Missing required env var: S3_...` error first —
`StorageService` now validates these at boot instead of failing silently.

## 8. Set up Uptime Kuma monitoring

`uptime-kuma` comes up with the rest of the stack (step 6) but needs one-time
configuration — monitors, the durable-history webhook notification, and the
public status page. `scripts/setup-kuma.ts` does this over Kuma's Socket.IO
admin API (Kuma has no REST/config-file admin surface, so this is as close to
"config as code" as it gets — nothing here is committed to the repo except the
container itself and this script). See
[`docs/plans/2026-08-09-uptime-kuma-monitoring-plan.md`](../plans/2026-08-09-uptime-kuma-monitoring-plan.md)
for the full design rationale.

1. Run the setup script on the VM, from the repo root:

   ```bash
   KUMA_USERNAME=admin KUMA_PASSWORD='<pick a real password>' node scripts/setup-kuma.ts
   ```

   Creates the admin account (if Kuma's setup wizard hasn't run yet),
   `MONITORING_WEBHOOK_SECRET` is read automatically from `infra/docker/.env`
   (same file `api` reads on boot). Idempotent — safe to re-run; it skips
   anything that already exists by name. Creates:
   - The 6 monitors below, each wired to a `webhook`-type notification
     pointed at `https://api.biasmarket.com/api/monitoring/webhook` with
     header `X-Webhook-Secret: <MONITORING_WEBHOOK_SECRET value>` (Kuma
     custom-header support on the built-in webhook notification type,
     confirmed on the pinned 1.23.16 image).
   - A public status page at the `status` slug containing **only** the two
     external monitors (API, Web) — the user-facing surfaces. The other four
     stay dashboard-only, used for triage (see
     [`incident-response.md`](incident-response.md)).
   - The status page's icon set to the site's own favicon
     (`scripts/assets/kuma-status-page-favicon.png`, a PNG export of
     `apps/web/app/favicon.ico` — Kuma's logo upload only accepts PNG).

   | Monitor        | Type | Target                                  |
   | -------------- | ---- | --------------------------------------- |
   | API (external) | HTTP | `https://api.biasmarket.com/api/health` |
   | API (internal) | HTTP | `http://api:3000/api/health`            |
   | Web (external) | HTTP | `https://biasmarket.com/api/health`     |
   | Web (internal) | HTTP | `http://web:3001/api/health`            |
   | DB             | TCP  | `db:5432`                               |
   | MinIO          | HTTP | `http://minio:9000/minio/health/live`   |

   The script deliberately does **not** configure a real-time Slack/Discord
   notification — add one by hand in the Kuma UI (Settings → Notifications)
   and attach it to the same 6 monitors, or extend the script with another
   `addNotification` call (see the comment block at the top of
   `scripts/setup-kuma.ts`).
2. Visit `https://status.biasmarket.com/` — the Caddyfile internally rewrites
   the root path to `/status/status` (Kuma has no native "set as homepage"
   setting), so the public status page serves directly from the bare domain;
   `/dashboard` and everything else still works normally. Kuma's own login
   endpoint has a built-in 20-req/min rate limiter (confirmed on the pinned
   1.23.16 image); no additional Caddy `basicauth` layer is configured on top.
3. Verify: stop one backend (e.g. `docker compose stop api`) and confirm both
   the paired internal/external monitors go down, the webhook notification
   fires (check `docker compose logs api` for the incoming POST, or query
   `GET /api/monitoring/incidents` as an admin), and (once restarted) the "up"
   transition closes things out. See the plan doc's "Verification" section for
   the full check list.
4. Set up an external, off-VM dead-man's-switch (e.g. UptimeRobot,
   healthchecks.io, Better Stack) pinging `https://status.biasmarket.com` — this
   is the one piece of monitoring deliberately _not_ self-hosted, since a
   watcher hosted on the VM can't report the whole VM being down.

## Day 2

### Redeploy after a change

```bash
cd ~/biasmarket && git pull && pnpm docker:prod
```

Rebuilds and restarts anything that changed, migrations reapply automatically
(same `prisma migrate deploy` on `api` boot as step 6). No firewall/DNS/cert
steps needed again — those are one-time, tied to the VM and domain, not the
code.

- **Logs:**
  `docker compose -f infra/docker/docker-compose.yml logs -f <service>`
- **DB backup:** the Postgres data lives in the `db_data` named volume. Simplest
  snapshot:
  `docker compose -f infra/docker/docker-compose.yml exec db pg_dump -U biasmarket biasmarket > backup.sql`
- **Uploaded images backup:** MinIO's data lives in the `minio_data` named
  volume — back it up the same way you'd back up any other Docker volume (e.g.
  `docker run --rm -v biasmarket_minio_data:/data -v $(pwd):/backup
  alpine tar czf /backup/minio-backup.tar.gz /data`).
- **Stack won't come up after a reboot:** confirm `docker` and the containers
  restarted (`restart: unless-stopped` is set on every service, so a VM reboot
  should bring everything back — verify with `docker compose ps`).

### Reset (wipe DB, start clean)

For wiping prod's database and starting from an empty schema — e.g. before real
users exist, when only seed/test accounts are on the server. Targets **only**
the `db_data` volume — deliberately not `docker compose down -v`, which would
also delete `caddy_data`/`caddy_config` (forcing Let's Encrypt re-issuance,
burning into its rate limits) and `minio_data` (uploaded product images/store
logos).

```bash
cd ~/biasmarket
git pull

# stop just the two containers that touch the DB, remove them (not volumes)
docker compose -f infra/docker/docker-compose.yml stop api db
docker compose -f infra/docker/docker-compose.yml rm -f api db

# actually delete the Postgres data (compose project name is "biasmarket")
docker volume rm biasmarket_db_data

# regenerate .env so any env vars added since the last env:init exist —
# --force since infra/docker/.env already exists. This rotates EVERY
# secret (Postgres password, BETTER_AUTH_SECRET, S3 keys), not just new
# ones — every existing session/login invalidates
pnpm env:init --prod --force
# then manually re-add RESEND_API_KEY / RESEND_FROM_EMAIL to
# infra/docker/.env — never auto-generated, see script output

# bring everything back up; api's CMD runs `prisma migrate deploy` against
# the now-empty DB, applying every migration in order from scratch
pnpm docker:prod

docker compose -f infra/docker/docker-compose.yml logs api --tail 50
pnpm seed:base:prod
```

## Known limitations

Deliberately out of scope for this first deploy — fine for "get pages live and
share the link," not for handling real traffic or real payment data at volume:

- **Rate limiting is targeted, not app-wide.** Throttled today: buyer
  login/register/forgot-password (5 req/min via `@nestjs/throttler`),
  better-auth's native limiter on seller sign-in/sign-up (3 req/10s), public
  checkout creation (10/min), and payment registration (`addPayment`, 20/min).
  Most other authenticated state-changing endpoints
  (`review`/`advance`/`cancel`, product/category/collection writes, ...) still
  have no explicit rate limit.
- **No app-wide CSRF middleware.** `helmet` (CSP included) is active on every
  API response except the `/api/docs` Swagger surface, and buyer-auth mutations
  carry an `OriginGuard` check — but seller-auth routes rely on the session
  cookie's `SameSite=Lax` alone; a global `OriginGuard`/CSRF-token scheme was
  explicitly deferred (see
  [`docs/plans/2026-08-08-security-baseline-csrf-helmet-rate-limiting-plan.md`](../plans/2026-08-08-security-baseline-csrf-helmet-rate-limiting-plan.md)).
- **Single VM, no managed DB.** Fine at MVP scale; see
  [`roadmap.md`](roadmap.md) §11 for the documented scaling path (managed
  Postgres once this is the bottleneck).
- **Self-hosted MinIO, not Cloudflare R2.** `roadmap.md`/`architecture.md`/
  `security-payments.md` spec R2 specifically to avoid self-hosting object
  storage on the VPS; MinIO is a deliberate MVP shortcut instead — no image
  resizing/CDN caching layer, and one more stateful volume (`minio_data`) to
  back up on the single VM.
