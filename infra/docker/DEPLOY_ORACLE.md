# Deploying to Oracle Cloud (OCI)

Prod deploy target for the MVP: a single Oracle Cloud VM running the
`infra/docker/docker-compose.yml` stack. This doc covers everything specific
to OCI — the stack itself (Docker Compose + Caddy) is host-agnostic and
already documented in [`infra/readme.md`](../readme.md) and
[`docker/readme.md`](readme.md).

Goal here is "get it live and shareable," not a hardened production setup —
see [Known limitations](#known-limitations) at the bottom for what's
deliberately deferred.

## 1. Provision the VM

- Shape: an Ampere A1 (arm64) instance is the free-tier default and is fine —
  every image in this stack (`node:24-slim`, `postgres:15`, `caddy:2-alpine`)
  is multi-arch, no x86-only dependency anywhere in the build.
- OS: Ubuntu 24.04 (matches what's assumed below; aarch64).
- **Attach a reserved/static public IP**, not the default ephemeral one. A
  reserved IP survives instance stop/reboot; an ephemeral one can change,
  which silently breaks your DNS A record and any Google indexing pointed at
  it. (Instance → attached VNIC → IP management → reserve.)
- Open ports in the instance's **Security List or Network Security Group**
  (VCN → your subnet → Security Lists/NSGs) — this is separate from the OS
  firewall and both must allow the traffic:
  - `22/tcp` (SSH, ideally restricted to your IP)
  - `80/tcp`, `443/tcp` (HTTP/HTTPS — Caddy needs 80 for the ACME challenge
    even though it upgrades everything to HTTPS)

## 2. Open the OS firewall (the actual "why can't I connect" fix)

Ubuntu images on OCI ship with pre-populated `iptables` rules
(netfilter-persistent) that drop unsolicited inbound traffic — opening the
port in the OCI console alone is not enough, this trips up almost everyone on
their first OCI deploy. Either:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

(insert position `6` targets before the default REJECT rule — run
`sudo iptables -L INPUT -n --line-numbers` first and adjust if your rule
order differs), or replace iptables with `ufw`:

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

Create an A record for your domain (and any subdomain you're using) pointing
at the reserved public IP from step 1. Confirm it resolves
(`dig +short yourdomain.com`) before starting the stack — Caddy's automatic
HTTPS will fail its ACME challenge if DNS isn't live yet, though it retries.

## 5. Clone the repo and configure secrets

```bash
git clone <your-repo-url> biasmarket
cd biasmarket/infra/docker
cp .env.example .env
```

Edit `.env` and replace every value that isn't dev-safe:

| Var | Set to |
|---|---|
| `POSTGRES_PASSWORD` | a strong random password |
| `DATABASE_URL` | same password as above, e.g. `postgresql://barri:<new-password>@db:5432/biasmarket` |
| `BETTER_AUTH_SECRET` | a fresh secret — **never reuse the committed dev value**. Generate one: `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | `https://yourdomain.com` |
| `WEB_URL` | `https://yourdomain.com` |
| `NEXT_PUBLIC_API_URL` | `https://yourdomain.com` (no `/api` suffix — the app appends that itself) |

Then edit [`../caddy/Caddyfile`](../caddy/Caddyfile) and replace the
placeholder domain on the first non-comment line with your real domain.

## 6. Bring up the stack

```bash
cd ../..   # repo root
pnpm docker:prod
# equivalent to: docker compose -f infra/docker/docker-compose.yml up -d --build
```

The `api` container runs `prisma migrate deploy` automatically on every
start before launching the server (see `api.Dockerfile`), so the schema is
created on first boot — no manual migration step needed.

## 7. Verify

```bash
docker compose -f infra/docker/docker-compose.yml ps        # all healthy
docker compose -f infra/docker/docker-compose.yml logs api  # migrations ran, no errors
curl -I https://yourdomain.com                               # 200, valid cert
curl -I https://yourdomain.com/api                            # API reachable through Caddy
```

If the cert didn't issue: check `docker compose logs caddy` — almost always
either DNS not yet resolving, or port 80/443 still blocked by security
list/iptables (steps 1–2).

## Day 2

- **Redeploy after a change:** `git pull && pnpm docker:prod` — rebuilds and
  restarts anything that changed, migrations reapply automatically.
- **Logs:** `docker compose -f infra/docker/docker-compose.yml logs -f <service>`
- **DB backup:** the Postgres data lives in the `db_data` named volume.
  Simplest snapshot: `docker compose -f infra/docker/docker-compose.yml exec db pg_dump -U barri biasmarket > backup.sql`
- **Stack won't come up after a reboot:** confirm `docker` and the containers
  restarted (`restart: unless-stopped` is set on every service, so a VM
  reboot should bring everything back — verify with `docker compose ps`).

## Known limitations

Deliberately out of scope for this first deploy — fine for "get pages live
and share the link," not for handling real traffic or real payment data at
volume:

- **No rate limiting wired in.** `@nestjs/throttler` is installed but not
  registered in `AppModule` — nothing currently throttles request volume.
- **No CSRF middleware, no `helmet`.**
- **No startup env-var validation.** Missing/misconfigured prod env vars
  (e.g. forgetting to set `WEB_URL`) fail silently or fall back to a
  `localhost` default rather than refusing to boot.
- **Single VM, no managed DB.** Fine at MVP scale; see
  [`docs/spec/roadmap.md`](../../docs/spec/roadmap.md) §11 for the
  documented scaling path (managed Postgres once this is the bottleneck).
