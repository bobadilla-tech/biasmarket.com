# Prod-capable, idempotent, complete seed command

## Context

`apps/api/scripts/seed-dev.ts` only ran automatically inside
`docker-compose.dev.yml` — no way to seed prod, and no `pnpm` script even
wrapped it for a manual dev run. Idempotency was coarse: users/stores were
upserted by hand, but products used `count > 0 ? skip : create-all`, so once a
store had one product, schema changes to the fixture list never repaired
existing dev DBs, and there was no way to add more demo data on demand.

The schema had also grown well past what the script seeded — `Category`,
`Collection`, `CollectionProduct`, `StoreSection`, `Order`/`OrderItem` — none
of it seeded, so a tester couldn't exercise storefront merchandising, checkout,
or the seller's order/payment-review dashboard from seed data alone.

Asked for: a real operator command, safe to run against prod, idempotent on
rerun (repair not duplicate), with an append mode for piling on extra labeled
demo data, and a seed set complete enough to exercise every flow a tester
needs.

## What changed

**Replaced `seed-dev.ts` with `apps/api/scripts/seed/`** (6 files):
`client.ts` (Prisma client construction), `ids.ts` (`seedId(batch, type,
...parts)` — deterministic, human-readable ids like
`seed:base:product:demo-tienda-de-camila:photobook`, used for every model that
has no natural unique key), `helpers.ts` (one `ensureX` per model, all real
`prisma.x.upsert`), `fixtures.ts` (pure data — base fixture set + an
append-mode factory), `apply.ts` (turns a fixture spec into rows via the
helpers), `run.ts` (CLI entry).

**Real upserts everywhere**, keyed by natural unique constraints where they
exist (`Store.slug`, `Collection [storeId,slug]`, `DeliveryMethodConfig
[storeId,type]`, etc.) or by `seedId(...)` where they don't (`Product`,
`ProductVariant`, `StoreSection`, `Order`, `OrderItem`) — every model's `id` is
a plain `String @id` with `@default(cuid())` only applied when omitted, so
supplying a stable string lets `upsert` target a fixed row on every rerun.
One wrinkle: `Category`'s compound unique `[storeId, parentId, name]` rejects
`parentId: null` in a Prisma `where` (Postgres treats every `NULL` as distinct,
so the constraint can't address a single top-level row) — top-level categories
fall back to `findFirst` + `create` instead of `upsert`.

**Expanded fixtures** (2 admins, unchanged; 2 demo stores, batch `"base"`):
2-level category tree, collections with ordered products, storefront sections
(`COLLECTION`/`BANNER`/`TEXT_BLOCK`), and products/variants deliberately
covering inventory edge cases — unlimited (`stock: null`), low (`1`),
sold-out (`0`), `reserved > 0`, `priceOverride`/`imageOverride`, a `DRAFT`
product, one with `availableUntil` in the past and one in the future. Orders
cover every `paymentStatus`×`fulfillmentStatus` combination a seller's
dashboard can show (`PENDING_PAYMENT`, `PAYMENT_SUBMITTED`, `VERIFIED` ×
`IN_TRANSIT`/`COMPLETED`, `REJECTED`, `CANCELLED`), written directly via
Prisma with amounts computed the same way `create-order.usecase.ts` does
(line-item total + delivery `estimatedCost`).

**Scope trim, found during implementation, not in the original plan:**
dropped `Customer`, `PaymentMethodConfig`, `PaymentProof`, `AuditLog` from the
fixture set. Grepped both `apps/web/src` and `apps/api/src` — zero usage of
any of the four anywhere outside the schema itself. `PaymentMethodConfig` has
no API module at all; checkout is WhatsApp-redirect only, no in-app
proof-upload flow exists (`order-status.vo.ts`'s own comment: "MVP checkout
redirects the buyer to WhatsApp instead of collecting an in-app payment
proof"). Seeding rows nothing reads or displays would've just been wasted
complexity.

**Naming**: seeded sellers/stores prefixed `seed-`/`demo-`
(`seed-seller1@biasmarket.dev`, `demo-tienda-de-camila`) so seeded data stays
identifiable if this ever runs against prod. Admin emails
(`admin@biasmarket.dev`/`owner@biasmarket.dev`) unchanged — those are the real
documented dev/ops logins, not demo data.

**Append mode**: `run.ts --append --batch=<label>` builds one more
labeled demo store from the same fixture shape, namespaced by the label so ids
never collide with `"base"` or other labels. Rerunning the same label repairs
that batch in place (no dupes); a new label adds a separate one. Missing
`--batch` when `--append` is passed exits 1 with a usage message.

**Command surface**, mirroring the existing `admin:create:*`/`admin:promote:*`
wrapper pattern:
- `apps/api/package.json`: `seed:base`, `seed:append`
- root `package.json`: `seed:base:dev`, `seed:append:dev`, `seed:base:prod`,
  `seed:append:prod` — each just `docker compose -f <compose-file> exec api
  pnpm --filter api run seed:...`
- `docker-compose.dev.yml`'s `api` boot command now runs
  `scripts/seed/run.ts` instead of the deleted `seed-dev.ts`
- `docker-compose.yml` (prod): unchanged, no auto-seed step — matches the
  existing "prod never auto-seeds" convention. `apps/api/scripts/` is already
  copied whole into the runtime image, so `scripts/seed/` is reachable via
  `docker compose exec` without any Dockerfile change (just updated a stale
  comment there to mention the new scripts).

**No confirmation gate for prod beyond the manual `docker compose exec`
invocation itself** — same as `admin:create:prod`. Confirmed as the right
call with the user given the command is idempotent and additive-only, never
deletes.

**Runtime deviation from CLAUDE.md's `.js`-extension convention:** the seed
scripts run raw via `node scripts/seed/run.ts` with no build step (unlike
`apps/api/src`, which goes through the SWC build that turns `.js`-suffixed
relative imports into real matching `.js` files). Node's native TypeScript
support does not remap a `.js` import specifier to a sibling `.ts` file at
runtime, so these scripts' relative imports use literal `.ts` extensions —
confirmed necessary by first hitting `ERR_MODULE_NOT_FOUND` with `.js`, then
confirming plain `node -e "import('./x.ts')"` resolves fine inside the
container.

**Docs**: `docs/core/infra.md` (dev seed section rewritten — new script path,
new credentials table, append-mode pointer), `docs/core/admin-access.md` (new
"Seeding demo data" section, including the exact `ssh <you>@<vm-ip>` → `cd
~/biasmarket` → `pnpm seed:base:prod` sequence for prod, matching
`deploy.md`'s established `~/biasmarket` clone path), `docs/core/admin.md` and
`infra/docker/api.Dockerfile`'s comment (stale `seed-dev.ts` path references).

## Verification

- `pnpm --filter api typecheck` clean.
- Ran `seed:base` twice against the live dev stack — store-scoped row counts
  identical after both runs (5 categories, 11 products, 9 variants, 3
  collections, 8 collection-products, 5 sections, 4 delivery methods, 8
  orders, 8 order items) — confirms upsert-based idempotency, no duplication.
- `seed:append -- --batch=qa1` run twice, then `--batch=qa2` once — exactly
  one `demo-qa1` store and one `demo-qa2` store, no duplicates.
- `seed:append` with no `--batch` → usage error, exit 1, as designed.
- `pnpm seed:base:dev` (root wrapper) → same result as calling the script
  directly inside the container.
- Signed in via the real `/api/auth/sign-in/email` endpoint with
  `seed-seller1@biasmarket.dev` / `seedpassword123` → 200, real session.
- That session's `GET /stores/:id/orders` → all 6 seeded orders, correct
  `paymentStatus`/`fulfillmentStatus`, totals matching hand-computed
  expectations (e.g. `photobook` variant `a` × 1 @ 45.00 + courier 8.00 =
  53.00).
- Public storefront endpoint `GET /stores/:slug/public` → sections → nested
  collections → nested products → nested variants all render correctly with
  seeded content.
