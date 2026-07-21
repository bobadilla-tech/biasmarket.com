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
  every image in this stack (`node:26-slim`, `postgres:15`, `caddy:2-alpine`)
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

  Console path: **Networking → Virtual Cloud Networks → (your VCN) →
  Subnets → (your subnet) → Security Lists → Default Security List →
  Ingress Rules → Add Ingress Rules**. The Default Security List ships with
  only `22/tcp` + ICMP — 80/443 are **not** there by default and are easy to
  assume are already open when they aren't. For each: Source CIDR
  `0.0.0.0/0`, IP Protocol `TCP`, Destination Port Range `80` (repeat for
  `443`), Stateless unchecked.

## 2. Open the OS firewall (the actual "why can't I connect" fix)

Ubuntu images on OCI ship with pre-populated `iptables` rules
(netfilter-persistent) that drop unsolicited inbound traffic — opening the
port in the OCI console alone is not enough, this trips up almost everyone on
their first OCI deploy.

**Check the actual rule order first** — don't assume a fixed position:

```bash
sudo iptables -L INPUT -n --line-numbers
```

Find the line number of the `REJECT ... reject-with icmp-host-prohibited`
rule. New ACCEPT rules must be inserted **at that line number** (pushing
REJECT down), not after it — the position isn't reliably `6`, it drifts as
other rules (ufw, prior attempts) get added. If you insert after REJECT
instead of before it, the rule is silently dead: traffic hits REJECT first
and never reaches your ACCEPT rule.

```bash
# replace 5 with the REJECT line number you found above
sudo iptables -I INPUT 5 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 5 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

If you already ran a version of this before and it didn't work, check for
**duplicate dead rules** sitting below REJECT (`iptables -L INPUT -n
--line-numbers` again) — delete them instead of adding more on top
(`sudo iptables -D INPUT <n>`, highest number first so line numbers don't
shift under you), then re-insert at the correct position.

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

The stack uses two subdomains — `biasmarket.com` for the storefront/dashboard
(`web`) and `api.biasmarket.com` for the API (`api`), each getting its own
Caddy-issued cert (see [`../caddy/Caddyfile`](../caddy/Caddyfile)). Create
**two** A records pointing at the reserved public IP from step 1:

| Host | Points to |
|---|---|
| `biasmarket.com` (and `www` if you use it) | VM's reserved public IP |
| `api.biasmarket.com` | VM's reserved public IP |

Confirm both resolve (`dig +short biasmarket.com`, `dig +short
api.biasmarket.com`) before starting the stack — Caddy's automatic HTTPS
will fail its ACME challenge for a domain that isn't live yet, though it
retries.

**If DNS is proxied through Cloudflare** (orange cloud, not grey/DNS-only):
set SSL/TLS mode to **Full** in Cloudflare dashboard → SSL/TLS → Overview.
Not Flexible (Caddy always serves HTTPS, so Flexible mismatches). Not
Full-strict until you've confirmed Caddy's origin cert issued successfully
— strict mode will hard-fail the handshake against an unissued/self-signed
cert.

Cloudflare surfaces origin-connectivity problems as its own error codes,
useful for diagnosing which layer is broken:

| Code | Meaning | Check |
|---|---|---|
| `522` | Cloudflare can't reach the origin at all (TCP timeout) | OS iptables (step 2) **and** OCI Security List/NSG (step 1) — both must allow 80/443, not just one |
| `525` | Cloudflare reached the origin but the TLS handshake failed | Caddy likely hasn't obtained a valid cert yet — see the cert troubleshooting note in step 7 |

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
`api.biasmarket.com`/`biasmarket.com`. Refuses to overwrite an existing `.env`
— pass `--force` to regenerate. See `scripts/init-env.ts`.

Deploying under a different domain? Run `pnpm env:init --prod`, then edit
the three URL vars by hand — and update `../caddy/Caddyfile`, which is
hardcoded to `api.biasmarket.com` / `biasmarket.com`.

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
curl -I https://biasmarket.com                                # 200, valid cert
curl https://api.biasmarket.com/api/health                    # {"status":"ok","db":"ok"}
```

If the cert didn't issue: check `docker compose logs caddy` — almost always
either DNS not yet resolving, or port 80/443 still blocked by security
list/iptables (steps 1–2).

Caddy attempts the ACME challenge once at container boot and does **not**
retry immediately if it fails — if you fix DNS or firewall issues *after*
the stack is already up, restart Caddy to force a retry rather than waiting:

```bash
docker restart biasmarket-caddy-1
docker logs biasmarket-caddy-1 --tail 50 -f
```

Look for a "certificate obtained successfully" log line before retesting
`curl -I https://biasmarket.com`.

## Day 2

### Redeploy after a change

```bash
cd ~/biasmarket
git pull
pnpm docker:prod
```

Rebuilds and restarts anything that changed, migrations reapply
automatically (same `prisma migrate deploy` on `api` boot as step 6). No
firewall/DNS/cert steps needed again — those are one-time, tied to the VM
and domain, not the code.

- **Logs:** `docker compose -f infra/docker/docker-compose.yml logs -f <service>`
- **DB backup:** the Postgres data lives in the `db_data` named volume.
  Simplest snapshot: `docker compose -f infra/docker/docker-compose.yml exec db pg_dump -U biasmarket biasmarket > backup.sql`
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
