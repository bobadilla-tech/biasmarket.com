# Docs full audit: proposal

## 1. Scope and state

- Scope: **full** (every doc in `docs/core` and `docs/business`, plus
  `apps/web/AGENTS.md`, `apps/mobile/README.md`, `apps/sanity/README.md`,
  `CLAUDE.md`, root `README.md`).
- Audited commit: `0d425bd3` (branch `fix/402-e2e-configurable-postgres-port`).
- Date: 2026-10-30.
- `git status`: 64 modified or untracked paths from other work (api sources,
  e2e specs, `.artifacts/`, `.claude/skills/update-docs/SKILL.md`, generated
  types, `packages/queue`, `packages/validation`). **`docs/` has no uncommitted
  changes.** Nothing was stashed, reset, or staged. Code findings below were
  read from the working tree, so a few can change when that work lands.
- Method: five read-only subagents (architecture/product/roadmap;
  security/admin; infra/CI; i18n/flows/web/mobile; business + workspace
  coverage) plus a link/anchor checker
  (`/private/tmp/claude-501/-Users-ultirequiem-ulti-biasmarket-com/bc26e0ec-cf46-4270-9908-ef51a1a4ec5a/scratchpad/linkcheck.mjs`).
  Agent reports are claims. The **Ver.** column says whether the lead session
  re-checked the claim itself: `V` = verified by command in this session, `A` =
  agent-reported, must be re-verified by the accuracy reviewer and again at
  apply time.

## 2. Summary

Counts are over the numbered findings in section 4 (see the count command in
section 8; numbers are filled in by that command output, not by hand).

Top problems:

1. **Buyer proof upload is built, but five docs say it is not** (`product.md`,
   `architecture.md`, `security-payments.md` §10, `buyer-flow.md`,
   `seller-flow.md`, `roadmap.md`). `OrderPayment.source = BUYER_SUBMITTED`,
   `buyer-payment-proof.service.ts`, and `POST /public/orders/:token/payments`
   exist.
2. **Whole shipped subsystems have no doc**: assisted orders with private
   links, global buyer accounts and Google claim, order events, identity
   retention/erasure (90 days after close), audit-log actions, coupons/premium,
   workers jobs, rate-limit inventory.
3. **Security claims that are false**: passwords are said to use `bcrypt`
   (code uses `better-auth/crypto`), ownership is said to live at the DTO layer
   (it lives in `assertOwnership` in the service layer), `admin.md` says there
   is no client-side admin redirect (the admin layout redirects).
4. **Navigation is broken**: no `docs/readme.md`; `docs/core/readme.md` holds
   the Docker dev guide instead of an index; ten broken anchors; `docker.md` is
   a dated audit narrative; `blue-green-migrations.md` (674 lines) mixes
   runbook, concept, provisioning, and history.
5. **Ops gaps**: no restore runbook or statement that there is no scheduled
   backup, Terraform documented only in `.artifacts/guides/`, no env-var
   reference, Cloudflare/edge setup undocumented, `ci.md` omits half the CI
   jobs.

## 3. Code map and tree

### Code map (doc -> code)

| Doc | Code and config it describes |
| --- | --- |
| `core/architecture.md` | `apps/*`, `packages/*`, `apps/api/src/modules/*`, `schema.prisma`, `apps/web/app`, `infra/vps` |
| `core/product.md`, `core/roadmap.md` | `apps/web/features`, `app/[locale]`, API modules, `schema.prisma` enums |
| `core/security-payments.md` | `modules/orders/**`, `auth/auth.config.ts`, `modules/customer-auth`, `common/*`, `storage/`, `checkout.controller.ts`, throttler usages |
| `core/admin.md`, `core/admin-access.md` | `app/[locale]/(dashboard)/admin`, `modules/{users,stores,contact,coupons}`, `infra/vps/bin/admin.sh`, `apps/api/scripts/seed` |
| `core/i18n.md` | `packages/i18n`, `apps/web/i18n`, `apps/web/proxy.ts`, `apps/mobile/src/i18n` |
| `core/deploy.md`, `core/blue-green-migrations.md` | `infra/vps/{deploy.sh,lib,bin,docker-compose.yml,env}`, `.github/workflows/cd.yml`, `cleanup-fallback.yml` |
| `core/caddy.md` | `infra/vps/Caddyfile`, `infra/terraform/cloudflare.tf` |
| `core/infra.md`, `core/readme.md` (dev content), `core/docker.md` | `infra/docker/*` |
| `core/incident-response.md` | `scripts/setup-kuma.ts`, `modules/monitoring`, `infra/vps/lib/migrate.sh` |
| `core/ci.md` | `.github/workflows/ci.yml`, `scripts/ci/*`, vitest configs |
| `core/mobile-release.md` | `.github/workflows/mobile-release.yml`, `apps/mobile` |
| `business/*-flow.md` | `apps/web/app`, `apps/web/features`, `apps/api/openapi.json` |
| `business/{icp,gtm,outreach}.md` | none (strategy) |

### Doc tree: current vs proposed

```
docs/                                   docs/
  business/                               readme.md                 NEW front door
    readme.md                             business/
    icp.md gtm.md outreach.md               (unchanged files + edits)
    buyer-flow.md seller-flow.md          core/
    marketplace-flow.md                     readme.md               REWRITE: index
    store-management-flow.md                docker-dev.md           MOVED from readme.md (git mv)
  core/                                     infra.md                EDIT: overview + seed table
    readme.md  (Docker dev guide)           docker.md               REWRITE: image-build reference
    infra.md                                architecture.md product.md roadmap.md
    docker.md  (audit narrative)            security-payments.md    EDIT
    architecture.md product.md roadmap.md   auth-and-identity.md    NEW
    security-payments.md                    assisted-orders.md      NEW (incl. retention)
    admin.md admin-access.md                workers-and-queues.md   NEW
    i18n.md                                 admin.md admin-access.md i18n.md
    deploy.md                               deploy.md               EDIT: cheat sheet + state files
    blue-green-migrations.md (674 lines)    blue-green-migrations.md EDIT: mechanics only
    caddy.md                                provisioning.md         NEW (Terraform + manual fallback)
    incident-response.md                    shared-services.md      NEW (db, redis, minio, kuma, caddy)
    ci.md                                   backups-and-recovery.md NEW (restore of pre-migrate dumps)
    mobile-release.md                       env.md                  NEW (env var reference)
                                            caddy.md incident-response.md ci.md mobile-release.md
                                        apps/workers/README.md      NEW (short, links to workers-and-queues.md)
                                        apps/api/README.md          NEW (short pointer)
                                        apps/sanity/README.md       REWRITE
```

No new top-level folder under `docs/`. `docs/readme.md` is a new file in the
existing `docs/` folder.

## 4. Findings

Types: error, stale, gap, orphan, dup, aspirational. Severity: **B** blocking,
**I** important, **m** minor. Source column: agent ids (A=arch/product/roadmap,
B=security/admin, C=infra/CI, D=i18n/flows/web, E=business/coverage), `L` =
link checker, `S` = lead session.

### 4.1 `architecture.md`, `product.md`, `roadmap.md`

| Id | Doc | Type | Sev | Evidence | Action | Src | Ver. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F01 | `architecture.md` §9, `roadmap.md` §11 | error | I | "single Hetzner VPS", "Host: Hetzner VPS ... (`web`, `api`, `db` images)"; prod is Contabo, blue/green, plus redis/minio/caddy/uptime-kuma/workers (`infra/vps/docker-compose.yml`, `contabo.tf`) | Replace, see 5.1 | A1,A2 | V |
| F02 | `architecture.md` §7.1 | error | B | "bcrypt ... `bcrypt.hash(password, 12)`"; no `bcrypt` in `apps/api`; `hashPassword` from `better-auth/crypto` in `customer-auth.service.ts`, better-auth defaults in `auth/auth.config.ts` | Replace, see 5.1 | A4,B1 | V |
| F03 | `architecture.md` §7, §9 | error | I | "re-encode/strip EXIF before storing in R2", "(R2) already externalized"; storage is MinIO (`storage/storage.service.ts`); `security-payments.md` says R2 is "spec only" | Say MinIO; keep EXIF/`sharp` only if confirmed in code, else label "not implemented" | A5,A6 | A |
| F04 | `architecture.md` §6 | error | I | Route tree `dashboard/[storeId]`, `products/[id]`, "no URL locale prefix"; real tree is `app/[locale]/(storefront)/store/[slug]/...`, `(dashboard)/dashboard/[slug]/{analytics,collections,customers,notifications,orders,payments,preferences,products,restock,sections,settings,shipping}` | Rewrite tree under `app/[locale]/`; confirm prefix behavior in `apps/web/i18n/routing.ts` before stating it | A7 | A |
| F05 | `architecture.md` §6 | stale | m | "SWR/React Query" | "React Query" | A7b | A |
| F06 | `architecture.md` §1 | error | I | Tree lists 2 apps and 6 packages and a root `docker-compose.yml` that does not exist; missing `apps/{workers,mobile,sanity}`, `packages/{query,validation}` | Rebuild tree from `ls apps packages`; replace compose line with `infra/{docker,vps,terraform}` | A8,E8 | V |
| F07 | `architecture.md` §3 | stale | I | "audited across all 13 tenant-scoped modules ... zero IDOR gaps"; audit dated 2026-08-08, now 21 modules incl. assisted orders, public tokens, buyer proofs | Add "(as of 2026-08-08; later modules not covered)" | A9 | A |
| F08 | `architecture.md` §2 | stale | I | `orders/` tree omits `assisted-orders.controller.ts`, `public-order-token.guard.ts`, `buyer-payment-proof.service.ts`, `void-order-payment.usecase.ts`, `order-events.service.ts`, etc. | Mark tree "abbreviated" and link to `assisted-orders.md`; add the missing files | A10 | A |
| F09 | `architecture.md` §4 | stale | I | `Order` snippet lacks `source`, `accessTokenHash`, `closedAt`, `buyerIdentityErasedAt`, ...; models `OrderEvent`, `BuyerAccount`, `CustomerStoreLink`, `Coupon*`, `RestockRequest`, `Courier*`, `WhatsAppMessageTemplate`, `PlatformIncident` unmentioned | Label snippet "abridged, see `schema.prisma`"; add a model index table | A12,B41 | A |
| F10 | `architecture.md` §4 | error | B | "`PAYMENT_SUBMITTED` ... no code path sets it"; "live flow is seller-recorded OrderPayment"; `void-order-payment.usecase.ts` sets it; buyer proofs are `OrderPayment` rows (`BUYER_SUBMITTED`) | Replace, see 5.1 | A13,B10 | V (buyer upload, `PAYMENT_SUBMITTED` event); A (void path) |
| F11 | `architecture.md` §4 | stale | I | "AuditLog ... Not written on product mutations"; actions now include `order.cancelled`, `order.assisted_created`, `order.claimed`, identity erasure (PR #467) | Re-grep `auditLog.create`; link the action list in `assisted-orders.md` | A14,B14 | A |
| F12 | `architecture.md` §9 | stale | m | Queue section omits `premium` and retention jobs, "7 call sites" count unverified | Link `workers-and-queues.md`; drop the count | A16 | A |
| F13 | `architecture.md` §9 | aspirational | m | "in-memory LRU", "Redis (v1+)" while Redis already runs (BullMQ) | Label planned vs built after re-check | A19 | A |
| F14 | `roadmap.md` | error | m | `architecture.md#8-docker--deployment-improvements`; heading is `## 8. Docker / Deployment` | Anchor `#8-docker--deployment` | A3,L | V |
| F15 | `architecture.md` §3 | stale | m | "Reserve a slug blocklist"; implemented as `RESERVED_SLUGS` in `stores.service.ts` | Present tense | A17 | A |
| F16 | `product.md` §3, §5.6, §5.7, `roadmap.md` | error | B | "no in-app buyer proof upload in the MVP"; shipped (see F10, F80) | Replace, see 5.1 | A13 | V |
| F17 | `product.md` §5.8 | error | B | "No social login in MVP", phone+password only; `BuyerAccount`, `buyer-google.controller.ts`, `/my-purchases`, claim tickets exist | Replace, see 5.1 | A30,B2 | V (Google controller, `BuyerAccount` per agents; controller file seen in git status) |
| F18 | `product.md` §3 vs §5 | dup | I | Two MVP-scope sections; §3 status "Fulfilled", "Dropped off at courier" match no enum (real: `ORDERING/IN_TRANSIT/READY/COMPLETED`) | Reduce §3 to a pointer to §5; remove stale vocabulary | A25 | A |
| F19 | `product.md` | error | I | Sections 1-7 then 13; cross-refs "see 4.4/4.5/4.6/4.7" point at wrong sections | Renumber, fix refs (4.4->5.4, 4.5->5.5, 4.6->5.6, 4.7->5.7) | A26 | A |
| F20 | `product.md` §4.1 | stale | I | "three screens"; admin has inquiries, stores, users, coupons | "four screens" | A23 | A |
| F21 | `product.md` §3.1/§5.4 | stale | I | Methods list omits `CASH`; enum `PaymentMethodType` = `YAPE, PLIN, TRANSFER, CASH`; Wise/PayPal appear only as manual descriptions | List the four enum values; keep "Wise/PayPal by manual transfer details, no integration" | A24,E7 | V |
| F22 | `product.md` §7 | stale | I | Open Decisions "deposit window (24h? 48h?)", "multi-store from day one" are decided (`holdWindowHours` default 48; all tables `storeId`) | Remove both bullets | A29 | V (48 default per B) |
| F23 | `product.md` | gap | I | Built, undocumented: assisted orders, coupons/premium, collections, sections, restock, couriers, WhatsApp templates, addresses, notifications, analytics, blog, mobile, monitoring | Add "Built beyond the original MVP" section with links to owning docs | A33 | A |
| F24 | `roadmap.md` | stale | I | v1 "Analytics dashboard" shipped (`modules/stats`, dashboard `analytics`) | Move to built | A37 | A |
| F25 | `roadmap.md` | gap | I | No mention of mobile, assisted orders, global accounts, coupons/premium, blog | Add "Shipped beyond MVP" list | A41 | A |
| F26 | `roadmap.md` §11 | dup | m | Stack/host list duplicates `architecture.md` §8 and `deploy.md` | Replace with links | A42 | A |
| F27 | `roadmap.md`, `product.md` | stale | m | Section numbers 11, 12, 14, 15 | Drop numbers or renumber | A44 | A |

### 4.2 `security-payments.md`, `admin.md`, `admin-access.md`

| Id | Doc | Type | Sev | Evidence | Action | Src | Ver. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F28 | §7.1 | error | B | `bcrypt.hash(password, saltRounds)`; see F02 | Replace, see 5.1 | B1 | V |
| F29 | §7.2 | error | B | "validate that the seller owns store_id ... at the DTO/guard layer"; ownership is `assertOwnership(storeId, userId)` in `order.repository.ts` and service/use-case layer; matches `CLAUDE.md` | Replace, see 5.1 | B3 | A (matches CLAUDE.md) |
| F30 | §7.2 | stale | m | "Zod (optional ...)" and dangling `email: string;` example, "— new"; API uses class-validator `ValidationPipe`; multipart bodies hand-validated (`buildValidatedDto`) | Rewrite to what runs | B4 | A |
| F31 | §7.4 | aspirational | I | "Add: Rate limiting, CSRF, sanitization" as a to-do; per-module `ThrottlerModule`, `SellerThrottlerGuard`, better-auth limiter, `OriginGuard`, `text-sanitize.ts` exist | Replace with implemented-controls table, see 5.2 | B6,B9 | A |
| F32 | §7.4 | error | I | "per IP and per buyer account"; checkout is `@Throttle` 10/min per IP only | "per IP (10/min)" | B7 | A |
| F33 | §9.3 table | error | I | "`PAYMENT_SUBMITTED` ... no code path sets it" | Replace, see 5.1 | B10 | A |
| F34 | §9.2 | stale | m | "Buyer-proof-upload caveat (stale ..., kept for history)" | Delete; fold live content into step 2 | B11 | A |
| F35 | §9.2/§9.3 | gap | I | `OrderStatus` axis, `cancel-order.usecase.ts` (`PATCH :orderId/cancel`, `CancellationResolution`), per-proof review and void endpoints, shipping/packed photo | Add cancel transition and resolution paragraph; extend table | B12 | A |
| F36 | model | gap | I | `AuditLog` actions undocumented (`payment.approved/rejected/voided`, `order.cancelled/expired`, `fulfillment.advanced`, `order.assisted_created`, `order.claimed`, `order.link_regenerated`, `order.phone_corrected`, `*_identity_erased`) | New "Audit log" section in `assisted-orders.md`; link from §9 | B14 | A |
| F37 | n/a | gap | I | Assisted orders: idempotency key, private link (SHA-256 `accessTokenHash`), `access-link`/regenerate, buyer notices, `OrderEvent` timeline (polled, not SSE), `receipt` | New `assisted-orders.md` | B15 | A |
| F38 | n/a | gap | I | Buyer identity: `BuyerAccount`, `CustomerStoreLink`, Google flow, `claim-ticket` (10-minute TTL), buyer session cookie (7 days), `OriginGuard`, seller vs buyer auth split | New `auth-and-identity.md` | B16,B2 | A |
| F39 | n/a | gap | B | No doc for identity retention/erasure: 90 days from `Order.closedAt`, `POST /internal/orders/assisted-identity-retention-sweep`, `assisted-identity-erasure-request`, `buyerIdentityErasedAt`, `Customer.identityErasedAt`; `grep retention docs/core` finds only Caddy log retention | New section in `assisted-orders.md` | B17 | V (grep) / A (values) |
| F40 | §10 | error | B | "There is no buyer-uploaded proof model"; proofs are `OrderPayment.imageUrl` in private `S3_PAYMENT_BUCKET`; packed photos private | Replace, see 5.1 | B18 | A |
| F41 | n/a | gap | I | Redaction (`scrub-request-url.ts`, `error-tracking.ts`, token guard comment) not covered | Add short "Redaction" section after reading what is scrubbed | B22 | A |
| F42 | n/a | gap | I | better-auth config: email verification, synthetic-user anti-enumeration, `bearer`, Google, `accountLinking`, `trustedOrigins`, CORS, `User.plan/premiumUntil` | In `auth-and-identity.md` | B23 | A |
| F43 | n/a | gap | m | Security env vars (`BETTER_AUTH_SECRET`, `CUSTOMER_ACCOUNT_TOKEN_SECRET`, `INTERNAL_JOBS_SECRET`, `GOOGLE_*`) not in any doc | `env.md` | B40 | A |
| F44 | `admin.md` | error | I | "No client-side auth redirect"; `app/[locale]/(dashboard)/admin/layout.tsx` does `router.push("/dashboard")` for non-admins unless impersonating | Replace, see 5.1 | B24 | V |
| F45 | `admin.md` | stale | I | "All three NAV_ITEMS"; four (inquiries, stores, coupons, users); no Coupons section though admin coupon endpoints exist (`@Roles(['admin'])`) | Add Coupons section, fix counts | B25,A23 | A |
| F46 | `admin.md` | stale | m | Rate-limit note says "not a project-wide rollout" and links `deploy.md#known-limitations` (no such heading) | Link the new table in `security-payments.md#74-abuse-prevention` | B33,L | V (anchor) |
| F47 | `admin.md`, `admin-access.md` | dup | m | "Becoming an admin" in both | Keep in `admin-access.md`, link | B36 | A |
| F48 | `admin-access.md` | stale | m | `seed:append -- --batch=` vs "do not put `--`" warning | Add one sentence on why the stray `--` is harmless | B39 | A |

### 4.3 Deploy, infra, CI, ops

| Id | Doc | Type | Sev | Evidence | Action | Src | Ver. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F49 | `deploy.md` | stale | I | "all 24 API E2E specs"; `ls apps/api/test/*e2e-spec.ts` = 37 | "the API E2E suite (`scripts/ci/e2e.sh`)" | C1 | V |
| F50 | `deploy.md` | error | I | `NEXT_PUBLIC_*` listed as `production` environment variables; `cd.yml` `build-push` has no `environment:`, uses repo-level `vars.*`; `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_STOREFRONT_REDESIGN_STORE_SLUGS` unlisted | Split: SSH secrets in `production` environment, `NEXT_PUBLIC_*` repo variables (full list from `cd.yml` build-args) | C2 | V |
| F51 | `blue-green-migrations.md` Step 6 | stale | I | Variable table lists two `NEXT_PUBLIC_*` vars; `cd.yml` passes six | Same list as F50, one place only | C3 | V |
| F52 | `blue-green-migrations.md` | error | I | Numbered deploy list: step 8 is followed by an orphan paragraph "`state/current_color`/`current_sha`/`rollback_target`, append ..." (the full-switch step is missing; `deploy.sh` has `full_switch`, `state_committed`) | Insert "Full switch: write 100% candidate config, reload, verify; commit state" as step 9, renumber | C4 | V |
| F53 | `blue-green-migrations.md` | dup | m | Scheduled-cleanup state files written in list steps 11-12 and in "Scheduled cleanup" | Keep the section, shorten steps | C5 | A |
| F54 | `blue-green-migrations.md` | stale | I | Provisioning steps written for Ubuntu 24.04/Oracle arm64; "same install ... in deploy.md step 3" (no such step); Terraform path only in `.artifacts/guides/oracle-to-contabo-terraform.md` | Move provisioning to `provisioning.md` (Terraform first, manual as fallback); fix dead reference | C6 | A |
| F55 | `blue-green-migrations.md` | dup | I | 674 lines mixing runbook, expand/contract concept, BullMQ addendum, provisioning, history | After F54, keep deploy mechanics and expand/contract; remove "Bootstrap lessons (on Oracle)" history to `.artifacts` | C7 | A |
| F56 | `incident-response.md` | error | m | "The other four (internal API/web, DB, MinIO)"; `scripts/setup-kuma.ts` defines 8 monitors plus a push monitor | "all non-external monitors" | C9 | V |
| F57 | `incident-response.md`, `deploy.md` | gap | B | No restore runbook; pre-migrate dump `pre-migrate-*.sql.gz` pruned after `SNAPSHOT_RETENTION_DAYS` (14); no scheduled DB/MinIO backup found; `--bootstrap` "DR only" has no steps | New `backups-and-recovery.md` documenting what exists and stating plainly that no scheduled backup exists; do not invent a policy | C12 | A |
| F58 | `incident-response.md` | gap | m | No entries for minio/redis/db/uptime-kuma/caddy restarts, disk full, `docker image prune -af` in cleanup | Add under `shared-services.md`, link | C13 | A |
| F59 | `caddy.md` | gap | I | `/internal/*` 404 on api, `/robots.txt`, `.php` probe 404, Cloudflare `trusted_proxies`, `CF-Connecting-IP`, four proxied DNS records (`cloudflare.tf`); `Caddyfile` comment line 52 confirms the `/internal/*` block | Add "Edge: Cloudflare" and "Blocked routes" sections | C14 | V (internal block) / A |
| F60 | `caddy.md`, `deploy.md` | dup | m | Bind-mount/force-recreate caveat three times | Keep in `caddy.md` | C15 | A |
| F61 | `caddy.md` | aspirational | m | "Local check" recipe not repeatable as written | Move to a script or drop | C16 | A |
| F62 | `docker.md` | stale | I | Whole file is a dated audit ("Research + fixes ...", "Gap found", "Status"); ignores `workers.Dockerfile` | Rewrite as image-build reference; move narrative to this audit folder as history | C17 | A |
| F63 | `core/readme.md` | orphan | I | Title `# infra/docker`; content is the Docker dev guide ("Postgres 15" stale; compose uses `postgres:18`, plus redis, minio, workers) | `git mv` to `docker-dev.md`, fix, rebuild `readme.md` as index | E14,C19,S | V |
| F64 | `core/readme.md`, `infra.md`, `docker.md` | dup | I | Same dev Compose commands in three docs; `infra.md` says "See [readme.md]" | One dev doc (`docker-dev.md`); `infra.md` becomes overview + seed table | C18 | V |
| F65 | `infra.md` | stale | m | Struck-through fixed issue; `localhost:5432` known issue (HEAD commit made host ports configurable); links `.artifacts/guides/` as the Terraform walkthrough | Delete resolved item; verify ports; link `provisioning.md` | C20,C23 | A |
| F66 | `ci.md` | error | I | "`packages/types` gates `lines` only (35 statements, ...)"; `vitest.config.ts` has `thresholds: { lines: 79 }` | "lines: 79" | C27 | V |
| F67 | `ci.md` | gap | I | Omits jobs `web-e2e`, `e2e`, `migration-safety`, `hygiene` (actionlint, shellcheck), `sanity`, `db`; guards `check-openapi-drift.sh`, `check-types-sdk-drift.sh`, `check-destructive-migrations.sh`; workflows `dependabot-automerge.yml`, `cleanup-fallback.yml`, `.github/actions/deploy-ssh-setup` | Add a per-job and per-workflow inventory; add "e2e filters are special-cased" and "`mobile-release.yml` reads the `mobile` filter" to wiring list | C25,C29,C31 | V (job list) |
| F68 | `ci.md` | stale | m | "N = number of `package.json` in apps/* and packages/*" (13); `packages/ui` is an empty untracked directory | "13 today"; drop the number | C26,E20 | V |
| F69 | `ci.md` | stale | m | Floors described as formula; current floors differ per workspace | Table pointing to the vitest configs | C28 | A |
| F70 | `deploy.md` | gap | I | Runtime layout omits `bin/`, `lib/`, `env/`, `systemd/`, state files (`current_color`, `current_sha`, `rollback_target*`, `scheduled_cleanup.*`, `last_deploy_result`, `deploy.lock.meta`, `migration_pending`, `shared_env.sha256`) | Add layout and state-file table | C33 | A |
| F71 | `deploy.md` | dup | m | "ignored paths do not start the chain" twice; E2E described as a separate step (it is a CI job); `Verification` lacks web health URL | Dedupe, rephrase, add `https://biasmarket.com/api/health` | C37,C38,C39 | A |
| F72 | n/a | gap | I | No env-var reference; `infra/vps/env/*.example` have header comments only; no `apps/*/.env.example` | New `env.md` generated from examples and `env.validation.ts` files | C34,E21,E22 | A |
| F73 | n/a | gap | I | minio (buckets, public-read policy, `cdn.` mapping), redis persistence, uptime-kuma setup, volumes (`db_data`, `redis_data`, `minio_data`, `uptime_kuma_data`, `caddy_data`) undocumented | New `shared-services.md` | C35 | A |
| F74 | n/a | gap | I | Terraform state is local (`terraform.tfstate`, gitignored), holds secrets, no remote backend; no doc on storage, backup, `imports.tf`, reinstall triggers | In `provisioning.md` | C36 | A |
| F75 | n/a | gap | I | Workers jobs (`ping`, `mailer`, `orders` expiry + retention, `premium`) undocumented beyond one line | New `workers-and-queues.md`, short `apps/workers/README.md` | E19,A16 | A |

### 4.4 i18n, business flows, web, mobile, sanity

| Id | Doc | Type | Sev | Evidence | Action | Src | Ver. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F76 | `i18n.md` | error | I | Tree lists `landing, dashboard, storefront, onboarding, admin, marketing, emails`; real files: `admin, blog, common, coupons, dashboard, for-sellers, landing, marketing, mobile, onboarding, storefront`; no `emails.json` | Replace tree; note `mobile` entrypoint | D1 | A |
| F77 | `i18n.md` | stale | m | Consumers: web "and later api"; mobile consumes `@biasmarket/i18n/mobile` | Add mobile | D2 | A |
| F78 | `i18n.md` | error | m | `apps/web/components/landing/language-toggle.tsx`; real: `apps/web/features/landing/components/language-toggle.tsx` | Fix path | D3 | V |
| F79 | `i18n.md` | error | m | "no hardcoded default" vs `locale String @default("es")` on `User` and `Store` | Reword | D6 | A |
| F80 | `buyer-flow.md` | error | B | "no in-app proof upload in the MVP"; `features/checkout/components/payment-proof-upload.tsx`, `features/public-order/components/proof-upload-form.tsx`, `POST /public/orders/{token}/payments` | Replace, see 5.1 | D8 | V |
| F81 | `seller-flow.md` | error | B | "no buyer-uploaded proof image to review"; seller review (`PATCH .../payments/{id}/review`), void, image endpoints exist | Replace, see 5.1 | D9 | V |
| F82 | `buyer-flow.md` | error | m | `/store/:slug/products/:id`; route is `/store/:slug/product/:productId` | Fix | D10 | A |
| F83 | `buyer-flow.md` | gap | I | Missing: `/my-purchases`, per-store `/account`, `pedido/:token`, assisted-order link, claim/Google, restock request, saved addresses, couriers/shipping tracking | Add sections with real routes | D11,D12,D14 | A |
| F84 | `seller-flow.md`, `store-management-flow.md` | stale | I | Dashboard menu "Productos, Pedidos, Categorías/Colecciones, Pago y entrega, Configuración"; real: analytics, collections, customers, notifications, orders (+new), payments, preferences, products, restock, sections, settings, shipping | Replace menu, add one short section each | D15 | A |
| F85 | `store-management-flow.md` | error | I | "banner image ... none of those exist in the schema"; `Store.bannerUrl` exists (`schema.prisma`), `POST /stores/{storeId}/banner` exists; onboarding/login/verify-email, sections, WhatsApp templates, coupon redeem flows absent | Fix parenthetical; add flows | D16 | V (bannerUrl) |
| F86 | `marketplace-flow.md` | gap | m | Other acquisition surfaces: `/blog`, `/for-sellers`, `/how-it-works`, `/faq`, sitemap | One short note | D18 | A |
| F87 | `web/AGENTS.md` | error | I | "`features/account/` is the reference implementation (schema -> api -> query -> component)"; it has only `components/`, `queries/`, `index.ts` | Name a real full-shape feature (e.g. `features/collections`) | D20 | V |
| F88 | `web/AGENTS.md` | stale | I | Orval tag list stops at `Restock/Users`; `orval.config.ts` `input.filters` now includes `PublicOrderEvents, WhatsappTemplates, Addresses, Monitoring, Coupons, Couriers, PublicCouriers, GlobalAccount` | Replace enumeration with "see `orval.config.ts`" | D21 | A |
| F89 | `web/AGENTS.md` | stale | I | "Migration complete" list and raw-`fetch`/`FormData` carve-outs predate `assisted-orders`, `coupons`, `couriers`, `restock`, `buyer-purchases`, `my-account`, `blog` | Grep `fetch(`/`FormData` in `features/` and rewrite the list | D23,D24 | A |
| F90 | `web/AGENTS.md` | gap | I | Convention `{schemas,api,queries,mutations,components}` + barrel; real features also have `lib/`, `hooks/`, `server.ts`; `storefront` has no `index.ts`; 30 feature dirs | Document accepted extras and thin features | D25 | A |
| F91 | `web/AGENTS.md` | dup | m | Long Orval history duplicates CLAUDE.md and `.artifacts/` | Keep only rules | D28 | A |
| F92 | `apps/sanity/README.md` | stale | m | Sanity boilerplate; package name `project-cerise-globe` | Real README: what it holds (blog), how to run, webhook to web | D32,E18 | V (boilerplate per two agents) |
| F93 | `apps/mobile/README.md` | gap | m | Screens list missing; checkout/order tracking not built | List routes; state what is not built | D29 | A |

### 4.5 `CLAUDE.md`, root `README.md`, business strategy docs, links

| Id | Doc | Type | Sev | Evidence | Action | Src | Ver. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F94 | `CLAUDE.md` | stale | I | Package list omits `query`, `validation`; apps list omits `mobile`, `workers`, `sanity` | Update both | E8 | V |
| F95 | `CLAUDE.md` | stale | I | CI jobs "api, web, workers, db, design-tokens, i18n, queue, types, utils"; `ci.yml` jobs: api, web, mobile, workers, db, migration-safety, queue, types, design-tokens, utils, validation, query, sanity, hygiene (no `i18n` job; filter only) | Update list, confirm `i18n` coverage | E9 | V |
| F96 | `CLAUDE.md` | error | m | `"type": "module"` in every package; `apps/web/package.json` has none | Soften or fix code (open question Q5) | E11 | V |
| F97 | `CLAUDE.md` | gap | m | Core models list lacks `OrderEvent`, `BuyerAccount`, `CustomerStoreLink`, `Coupon*`; Google buyer claim not mentioned | Add one line each | B41,D34 | A |
| F98 | `README.md` | stale | m | Stack line omits Redis, BullMQ, MinIO, Caddy, Expo, Sanity, better-auth; "`pnpm dev` starts api/web only" vs root `dev = turbo run dev --parallel`; no link to `docs/business` | Update; link `docs/readme.md` | E15-E17 | V (script) |
| F99 | `business/{icp,gtm,outreach}.md` | gap | I | "Set it up for free / No cost" with no pricing source; code has `User.premiumUntil`, premium expiry job, coupon `plan` | Ask owner (Q3), then one pricing/plan paragraph in `product.md` linked from `gtm.md` | E1 | A |
| F100 | `business/{gtm,outreach,icp}.md` | dup | m | Overlapping targets and qualification thresholds (200-300 leads/week vs 50 leads/7 days; 30+ vs 50+ orders) | State in `business/readme.md` which supersedes; unify thresholds only if the owner agrees | E4,E6 | A |
| F101 | `business/icp.md` | gap | m | "LATAM, SEA, US" while product is Peru-first, ES/EN only | One sentence | E2 | A |
| F102 | all | error | I | 10 broken anchors | See 5.4 | L | V |

## 5. Changes

### 5.1 Edits with exact replacement text

All replacement text is for the doc named; re-verify each claim at apply time.

**E1 (F01).** `architecture.md` §9 and `roadmap.md` §11:

- `architecture.md`: replace "single Hetzner VPS (api + web + db + Caddy via
  compose)" with "single Contabo Cloud VPS (blue/green `api`, `web`, `workers`
  plus shared `db`, `redis`, `minio`, `uptime-kuma`, `caddy`, see
  [deploy.md](deploy.md))".
- `roadmap.md`: replace the host line with "Host: Contabo Cloud VPS, single box,
  blue/green Docker Compose (see [deploy.md](deploy.md))".

**E2 (F02, F28).** Replace the password rule in both docs:

> Passwords are hashed with better-auth's `hashPassword` (salted). Seller
> credentials live in better-auth's `Account` rows; buyer credentials in
> `BuyerAccount.passwordHash` (`modules/customer-auth/customer-auth.service.ts`).
> Never store or log a raw password.

(The algorithm name is deliberately not stated; read `better-auth` source
before adding it.)

**E3 (F10, F16, F33, F40, F80, F81).** One canonical paragraph lives in
`security-payments.md` §9.3.1, and the other docs link to it:

> A buyer can submit a proof image for an order (at checkout, on the private
> order page `/store/:slug/pedido/:token`, or from `/store/:slug/account/orders/:id`).
> The proof is stored as an `OrderPayment` row with `source = BUYER_SUBMITTED`
> and `reviewStatus = PENDING_REVIEW`. The seller approves or rejects it
> (`PATCH /stores/:storeId/orders/:orderId/payments/:paymentId/review`) or
> records a payment manually. Submitting a proof does not change
> `paymentStatus` by itself; `PAYMENT_SUBMITTED` is set when a void leaves a
> pending buyer proof and no paid amount.

(The last sentence rests on B10 and must be confirmed in
`void-order-payment.usecase.ts` and `order-status.vo.ts` before apply.) Then:

- `security-payments.md` §9.3 row `PAYMENT_SUBMITTED`: "Reached by: voiding a
  payment that leaves an unreviewed buyer proof and no paid amount. Also
  accepted by seller approve/reject."
- `security-payments.md` §10: "Buyer and seller proofs are `OrderPayment.imageUrl`
  rows in the private payment bucket (`S3_PAYMENT_BUCKET`). Packed photos are
  private too. Cloudflare R2 is a spec-only option."
- `buyer-flow.md` header and payment step: replace "no in-app proof upload"
  with a link to the paragraph above, and add the upload to the diagram after
  the WhatsApp handoff.
- `seller-flow.md` header and payment step: replace "no buyer-uploaded proof
  image" with the review queue (approve, reject, void) next to manual recording.
- `architecture.md` §4: delete "no code path sets it" and "PaymentProof was
  removed ... live flow is seller-recorded" and link to the paragraph.
- `product.md` §3/§5.6/§5.7 and `roadmap.md`: same replacement, plus remove
  "no buyer-side proof upload" from the exclusions.

**E4 (F17).** `product.md` §5.8: delete "No social login in MVP" and add:

> Buyers have a global account (`BuyerAccount`, unique phone, optional Google
> sign-in) with a purchases page at `/my-purchases`. A buyer who received an
> assisted-order link can claim the order into an account. Per-store customer
> records (`Customer`) are linked through `CustomerStoreLink`. See
> [auth-and-identity.md](auth-and-identity.md).

**E5 (F29).** `security-payments.md` §7.2:

> Ownership is enforced in the service layer: every seller mutation calls
> `assertOwnership(storeId, userId)` and every tenant query filters by
> `storeId`. It is not a DTO or guard concern; there is no tenant middleware.

**E6 (F44).** `admin.md`:

> The admin layout (`app/[locale]/(dashboard)/admin/layout.tsx`) redirects
> sessions that are not admin and not impersonating to `/dashboard`. The API
> still enforces `@Roles(['admin'])` on every admin route; the redirect is a
> convenience, not the control.

### 5.2 Edits with precise before/after

- `security-payments.md` §7.4: replace the "Add: ..." list with a table
  `Control | Where | Limit` containing the 14 limits B9 listed (checkout 10/min
  per IP; assisted order create/access-link/regenerate 20/min per seller via
  `SellerThrottlerGuard`; buyer-notices 60/min; seller `addPayment` and packed
  photo 20/min; customer-order-payments 20/min; `GET /public/orders/:token`
  30/min; `:token/events` 20/min; `:token/receipt` 20/min; `:token/claim-ticket`
  10/min with `OriginGuard`; buyer login/register/confirm 5/min; buyer Google 10/min;
  coupon redeem 5/min; restock 5/min; public search 60/min; `/internal/*`
  5/min). **Each number is re-read from the decorators at apply time**; the
  table is not written from the agent's list.
- `deploy.md`: "runs all 24 API E2E specs" -> "runs the API E2E suite
  (`scripts/ci/e2e.sh`)".
- `deploy.md` and `blue-green-migrations.md` Step 6: replace the variable lists
  with one table in `deploy.md` (secrets in the `production` environment;
  `NEXT_PUBLIC_API_URL`, `_SITE_URL`, `_SENTRY_DSN`, `_SANITY_PROJECT_ID`,
  `_SANITY_DATASET`, `_STOREFRONT_REDESIGN_STORE_SLUGS` as repository
  variables), and link to it from Step 6.
- `ci.md`: `packages/types` row -> "`lines: 79`".
- `i18n.md`: path -> `apps/web/features/landing/components/language-toggle.tsx`.
- `incident-response.md`: "The other four (internal API/web, DB, MinIO)" ->
  "All monitors except the external ones".
- `blue-green-migrations.md` list: insert after step 8 "9. Full switch: write
  the 100% candidate Caddy config, reload, re-verify the public domain, then
  commit `state/current_color`, `current_sha`, `rollback_target` and append to
  `releases/history.log`. The previous color keeps running as the rollback
  target ..." and renumber 9-12 to 10-13, keeping the existing text of the
  orphan paragraph as the body.
- `store-management-flow.md`: remove "(none of those exist in the schema)" for
  banner; keep other items only if still true.

### 5.3 Additions

Each new doc follows the house style: plain, present tense, ~80 columns,
"Next / Related" links. Outlines only; full text is drafted after approval,
because every sentence must be read from the listed sources.

| New file | Audience | Outline | Read first | Inbound links |
| --- | --- | --- | --- | --- |
| `docs/readme.md` | new developer, cofounder | one paragraph on what Bias Market is; reading order (`business/product`, `core/architecture`, `core/docker-dev`, `core/security-payments`, `core/deploy`); links to `core/readme.md` and `business/readme.md` | `README.md`, `CLAUDE.md` | root `README.md` Docs section |
| `docs/core/readme.md` (rewrite) | any developer | index: one line + "read this when ..." per core doc, grouped: product/architecture, security/identity, API behavior, ops, CI | all core docs | `docs/readme.md` |
| `docs/core/docker-dev.md` (git mv) | developer | existing dev guide with Postgres 18, minio/redis/workers services, seed-on-boot, configurable ports | `infra/docker/docker-compose.dev.yml`, `scripts/` | `readme.md`, `infra.md`, root `README.md` |
| `docs/core/auth-and-identity.md` | backend dev | seller auth (better-auth config, verification, Google, bearer), buyer auth (`BuyerAccount`, session cookie, `passwordVersion`), claim ticket, `OriginGuard`, admin roles, premium/coupon; env vars | `auth/auth.config.ts`, `modules/customer-auth`, `buyer-google.controller.ts` | `security-payments.md`, `architecture.md`, `admin.md` |
| `docs/core/assisted-orders.md` | backend dev, support | what it is, private link lifecycle, idempotency key, `OrderEvent` timeline, receipt confirmation, claim, audit-log actions, **retention and erasure (90 days)**, internal endpoints and `INTERNAL_JOBS_SECRET` | `modules/orders/**`, `packages/utils/src/assisted-order-payment`, `packages/queue` | `security-payments.md` §9, `product.md`, `buyer-flow.md`, `seller-flow.md` |
| `docs/core/workers-and-queues.md` | backend/ops | queues and job names from `packages/queue`, schedulers, retries/backoff, env, how workers reach the internal API, deploy-side notes | `apps/workers/src`, `packages/queue/src` | `architecture.md`, `deploy.md`, `apps/workers/README.md` |
| `docs/core/provisioning.md` | operator | Terraform apply, tfvars, what `cloud-init` does, state storage and backup, import, reinstall triggers; manual fallback (moved from `blue-green-migrations.md` Steps 1-8) | `infra/terraform/*.tf`, `cloud-init.yaml.tftpl`, `.artifacts/guides/oracle-to-contabo-terraform.md` (history only) | `deploy.md`, `infra.md` |
| `docs/core/shared-services.md` | operator | `db`, `redis`, `minio`, `uptime-kuma`, `caddy`: purpose, volumes, health checks, restart, per-service gotchas; MinIO buckets and `cdn.` mapping; Kuma setup order | `infra/vps/docker-compose.yml`, `scripts/setup-kuma.ts` | `deploy.md`, `incident-response.md`, `caddy.md` |
| `docs/core/backups-and-recovery.md` | operator on call | what exists (pre-migrate dump, 14-day retention, location), restore steps read from `lib/migrate.sh`, what does **not** exist (scheduled DB/MinIO backup), DR via `--bootstrap` | `infra/vps/lib/migrate.sh`, `deploy.sh` | `incident-response.md`, `deploy.md` |
| `docs/core/env.md` | developer, operator | table per example file: variable, used by, required, notes; secrets-shape only, no values | `infra/docker/.env.example`, `infra/vps/env/*.example`, `scripts/ci/e2e.env.example`, `env.validation.ts` (api, workers) | `docker-dev.md`, `deploy.md` |
| `apps/workers/README.md`, `apps/api/README.md` | developer | 10-line pointer: purpose, scripts, link to the owning core doc | `package.json` | root `README.md` table |
| `apps/sanity/README.md` (replace) | content editor, dev | what the studio holds, how to run, webhook/revalidation to web | `apps/sanity`, `apps/web/features/blog/lib/sanity.ts` | root `README.md`, `i18n.md` |

### 5.4 Deletions, moves, link fixes

- `git mv docs/core/readme.md docs/core/docker-dev.md`, then create the new
  `readme.md` index. Inbound links to fix: `docs/core/infra.md`
  (`[readme.md](readme.md)`), `docs/core/docker.md`, `docs/business/readme.md`
  (links `../core/readme.md`, stays valid because the new file is the index).
- `docs/core/docker.md`: rewritten in place as a reference. The removed audit
  narrative is saved to `.artifacts/2026/10/20261030--docs-full-audit/docker-audit-history.md`
  before overwrite. Unique content preserved: cache mounts, `COMPOSE_BAKE`,
  shared `base` stage, the bug found while testing.
- `blue-green-migrations.md`: Steps 1-8 and "Bootstrap lessons" move to
  `provisioning.md`; no other doc links into those anchors (the checker
  reports the file's only inbound anchor problem as `#uptime-kuma-monitors`).
- Broken anchors (F102) and targets:

  | From | Broken target | New target |
  | --- | --- | --- |
  | `product.md`, `roadmap.md` (4 refs) | `security-payments.md#92-flow` | `security-payments.md#92-flow-whats-actually-live` |
  | `roadmap.md` | `architecture.md#8-docker--deployment-improvements` | `architecture.md#8-docker--deployment` |
  | `roadmap.md`, `security-payments.md` | `deploy.md#image-uploads-minio` | `shared-services.md#minio` (new) |
  | `admin.md` | `deploy.md#known-limitations` | `security-payments.md#74-abuse-prevention` |
  | `incident-response.md` | `blue-green-migrations.md#uptime-kuma-monitors` | `shared-services.md#uptime-kuma` (new) |

- Docs that link into `.artifacts/` as a runbook (`infra.md` Terraform
  walkthrough) switch to `provisioning.md`. Links to `.artifacts` plans as
  history (`incident-response.md`, `docker-dev.md`) stay, labeled as history.
- Nothing in `docs/` is deleted outright.

## 6. Link and index updates

- New `docs/readme.md`, rewritten `docs/core/readme.md`, existing
  `docs/business/readme.md` (add `buyer/seller` flow sync note, link back to
  `docs/readme.md`).
- Root `README.md`: Docs section links `docs/readme.md`, `docs/core/`,
  `docs/business/`; the dev-setup link (`docs/core/infra.md`) changes to
  `docs/core/docker-dev.md`; stack and `pnpm dev` lines corrected (F98).
- `CLAUDE.md`: docs list gains the new files; F94-F97 edits. This file is a
  maintained doc, but the project's CLAUDE.md is the user's own instruction
  file, so these edits are listed for approval separately (Q6).
- Every new doc gets a "Next / Related" footer; `product.md`,
  `architecture.md`, `security-payments.md` get links to the new topic docs.

## 7. Open questions (recommended defaults)

| # | Question | Scope-changing? | Recommended default |
| --- | --- | --- | --- |
| Q1 | Split `blue-green-migrations.md` into mechanics, migration discipline, provisioning? | yes (moves 300+ lines) | Move only provisioning and "Bootstrap lessons"; leave expand/contract in place |
| Q2 | Backup policy: the repo has none beyond pre-migrate dumps. Document the gap only, or also propose a scheduled backup? | yes | Document the gap only; open an issue for a scheduled backup (code change, out of scope here) |
| Q3 | Pricing/premium: what is the public pricing story (free early access, premium tier)? Needed for F99 | yes | Skip F99's text until the owner answers; leave business docs unchanged |
| Q4 | Wise/PayPal: are they intended as free-text transfer instructions or planned enum values? | no | Treat as manual transfer details (matches `product.md` "manual, screenshot-based") |
| Q5 | `apps/web/package.json` lacks `"type": "module"` while CLAUDE.md says every package has it. Fix the code or soften the rule? | no | Soften the rule in CLAUDE.md; do not touch code |
| Q6 | OK to edit `CLAUDE.md` (F94-F97)? | no | Yes, limited to those four edits |
| Q7 | Move `docker.md`'s audit narrative into this audit's folder as history? | no | Yes |
| Q8 | `docs/core/product.md` is 462 lines with duplicated §3/§5. Reduce §3 to a pointer? | no | Yes |

Code and comment follow-ups found along the way, **not part of this docs
change** (reported so they are not lost): `seller-throttler.guard.ts` header
says `trust proxy` is never set but `main.ts` sets it; `api.Dockerfile` and
`workers.Dockerfile` comments mention migrate-on-boot; `seed:base` is reachable
in production with published dev accounts; `apps/sanity` package name
`project-cerise-globe`; empty `packages/ui` directory.

Unverified at proposal time and to be settled by the accuracy reviewer or at
apply: `scrypt` as the algorithm, EXIF stripping/`sharp`, locale-prefix
behavior (`localePrefix`), the full rate-limit numbers, `PAYMENT_SUBMITTED` via
void, the 5 MB/MIME limits, featured-store rule, mobile README claims, i18n
`proxy.ts` claims, Kuma monitor counts after edit.

## 8. Verification plan

1. Link and anchor checker over every maintained `.md` (docs, `CLAUDE.md`,
   `README.md`, `apps/*/AGENTS.md`, `apps/*/README.md`): expect 0 broken (today:
   10).
2. For every command in a code block I add or change: `grep` the script in a
   `package.json`, `infra/`, or `scripts/`; run only `--help`/`--dry` variants.
3. For every path or symbol in new text: `ls`/`grep`.
4. Re-read each rate-limit decorator before writing the table.
5. Formatter: run the repo's markdown formatter on touched files only
   (`prettier --check` on those paths, after confirming it is the configured
   formatter). Do not run `pnpm fix` unless asked.
6. `git diff --stat` must list only docs, the files named in section 6, and
   this audit folder.
7. Finding counts for the final reply:
   `grep -c '^| F' proposal.md` and a per-type count with
   `awk -F'|' '/^\| F[0-9]/{gsub(/ /,"",$4);print $4}' proposal.md | sort | uniq -c`.
