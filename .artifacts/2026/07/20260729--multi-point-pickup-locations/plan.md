# Multi-point pickup locations

## Context

Store settings only supported a single free-text pickup address
(`DeliveryMethodConfig` row of type `PICKUP`, address stored ad-hoc inside its
`details` Json blob, one row per store enforced by `@@unique([storeId,
type])`).
Reported via GitHub issue: many sellers on the platform are small K-pop/merch
resellers without a physical store — they hand off orders at meetup points
(Alameda 28 de Julio, Plaza Norte, metro/bus stations), and the UI's "Retiro en
tienda" / "Dirección de recojo" copy implied a fixed shop address, confusing
both sellers and buyers.

Asked for: let a seller maintain a list of named pickup/meetup points (add,
rename, enable/disable, remove), keep a master on/off toggle for pickup as a
delivery method, and let the buyer pick one specific point at checkout. No
map/geocoding integration for MVP — plain text labels only, confirmed explicitly
out of scope by the reporter.

## What changed

**Data model**: new `PickupPoint` model (`packages/db/prisma/schema.prisma`) —
`id`, `storeId`, `label`, `enabled`, `sortOrder`, `createdAt`, indexed on
`storeId` and `[storeId, enabled]`. `Store.pickupPoints` relation added.
`Order.pickupPointId` added as a nullable FK with `onDelete: SetNull`, so
deleting a point later never breaks order history — the chosen label is also
snapshotted into `Order.deliveryDetails.pickupPointLabel` at order-creation
time. `DeliveryMethodConfig` (the `PICKUP`/`COURIER` master toggle) is
untouched; its `details.address` field simply stops being read/written.
Migration: `packages/db/prisma/migrations/20260729211058_add_pickup_points/`.

**Backfill**: `apps/api/scripts/backfill-pickup-points.ts` (wrapped as
`pnpm --filter api run backfill:pickup-points`), mirroring the existing
`seed/client.ts` Prisma-client-construction pattern rather than hand-rolled SQL,
so it can use normal `cuid` id generation. Reads every `DeliveryMethodConfig`
row where `type = 'PICKUP'` and `details.address` is a non-empty string, creates
one `PickupPoint` per store with that label. Not idempotent by design (no
natural key to dedupe an already-promoted address against) — meant to run
exactly once per environment, same operational shape as `seed:base:prod` (manual
`docker compose exec`, no auto-run wired into container boot). Ran once locally
against the dev DB: 1 point backfilled from existing seed data.

**Backend**: new `apps/api/src/modules/pickup-points/` module, sibling to
`delivery-config/` rather than folded into it (distinct CRUD lifecycle + its own
public listing endpoint). `PickupPointsService` mirrors the
`assertOwnership(storeId, userId)` / `findOwned*` pattern already duplicated
per-service in `products.service.ts` and `delivery-config.service.ts` rather
than extracting a shared helper, matching existing repo convention. Routes:
owner-authed `GET/POST /stores/:storeId/pickup-points`,
`PATCH/DELETE /stores/:storeId/pickup-points/:pointId`; public
`GET /stores/:slug/public/pickup-points` (enabled-only, sorted).

`create-order.usecase.ts`: when `deliveryMethodType === 'PICKUP'` and the store
has at least one enabled point, `pickupPointId` becomes required and is
validated to belong to that store and be enabled (`BadRequestException`
otherwise) — a store with zero configured points still completes checkout with
`pickupPointId: null`, preserving today's behavior for stores that haven't
migrated to using points yet. `packages/utils/src/whatsapp/index.ts` gained
`pickupPointLabel` on its input type, appended to the "Entrega:" line when
present.

**Copy change beyond the address field**: renamed "Retiro en tienda" → "Retiro
presencial" (dashboard toggle, storefront checkout option, WhatsApp message
label) — the ticket's core ask was replacing the "fixed shop" framing, not just
the address input, so the toggle/option label needed to change along with it,
not just the field underneath it.

**Frontend**: dashboard settings
(`apps/web/app/[locale]/(dashboard)/dashboard/[slug]/settings/page.tsx`) —
single `pickupAddress` string replaced with a `PickupPoint[]` list; rows get a
`Switch` (enable/disable), editable `Input` (label), and remove button, plus an
add-point row, mirroring the existing add/remove-badge pattern from the product
options editor (`products/page.tsx`) adapted to rows since each point needs its
own toggle. No batch endpoint exists, so save is diff-based: temp-id (`new:...`)
rows → `POST`, existing rows → `PATCH`, removed existing rows → `DELETE`, all
fired in one `Promise.all` then reloaded.

Storefront checkout
(`apps/web/app/[locale]/(storefront)/store/[slug]/checkout/page.tsx`) — a second
`<Select>` appears when `PICKUP` is chosen and the store has points; submission
is blocked until one is picked. `pickupPointId` included in the checkout POST
body only when relevant.

**i18n**: `packages/i18n/{es,en}/dashboard.json` `settings.delivery.*` — dropped
`pickupAddressLabel`/`pickupAddressPlaceholder`, added `pickupPointsLabel`,
`pickupPointPlaceholder`, `addPickupPoint`, `removePickupPoint`,
`noPickupPoints`. `packages/i18n/{es,en}/storefront.json`
`checkoutPage.deliveryPickup` copy updated. Unrelated `pickup` badge label
(order-status short label) and `payments.items.cash.*` left untouched —
different concept, same word.

## Verification

- `pnpm --filter api test` — 126/126 passing, including 5 new cases in
  `create-order.usecase.spec.ts` (no-point-selected, cross-store point, disabled
  point, zero-points backward compatibility, label snapshot in
  `deliveryDetails` + WhatsApp message) and a new 7-test
  `pickup-points.service.spec.ts` covering ownership checks and
  `findEnabledForSlug` filtering.
- `pnpm typecheck` clean across all 11 packages/apps.
- `pnpm --filter @biasmarket/db exec prisma migrate dev --create-only` then
  applied locally; generated SQL reviewed by hand before applying
  (`CREATE
  TABLE "PickupPoint"`,
  `ALTER TABLE "Order" ADD COLUMN "pickupPointId"`, both FKs).
- Ran `backfill:pickup-points` against the local dev DB — 1 point created from
  an existing seeded store's legacy address, script exited cleanly.
- `pnpm lint` — no lint task currently wired up at the root (pre-existing gap,
  unrelated to this change).

## Follow-up

- Backfill still needs to run once against prod after this deploys (manual step,
  not automatic — see Context/backfill section above).
- No map/geocoding integration — explicitly deferred; a free option (e.g.
  OpenStreetMap Nominatim) could be layered on later for point-address
  autocomplete without changing the `PickupPoint.label` free-text model.

## Hotfix (same day): CI break + points not persisting

Two issues surfaced right after the above shipped:

**CI red**: `packages/utils/src/whatsapp/index.test.ts:24` still asserted the
old `"Entrega: Retiro en tienda"` string; the feature work above renamed that
label to `"Retiro presencial"` without updating this pre-existing test. One-line
fix.

**Bug report** (dashboard settings): sellers could add pickup points and see
them appear locally, but after "Guardar" + reload the list was empty again, and
checkout never showed a point selector as a downstream consequence. Initial
suspicion (wrong, but fixed defensively anyway): the whole pickup-points list in
`settings/page.tsx` was nested inside `<Field>`, which renders a native
`<label>` — semantically incorrect for a list of multiple interactive
`Switch`/`Input`/`Button` elements (all "labelable" per the HTML spec). Replaced
with a plain `<div>`, same styling, no logic change.

**Actual root cause**, found by reproducing live: the local
`docker-compose.dev.yml` `api` service runs `prisma generate` exactly once, as
the first step of its container `command:` (see that file's `api.command`) — it
does not re-run on file watch. The running `biasmarket-dev-api-1` container had
been up for 3 hours, i.e. since before the `PickupPoint` model was added to
`schema.prisma` this session. Every `prisma.pickupPoint.*` call in the running
container was therefore hitting a Prisma Client that didn't know that model
existed, throwing and producing a 500 on every pickup-points request — which
explains both symptoms (nothing ever actually saved; the public checkout
endpoint had nothing to return). Fixed by
`docker compose -f infra/docker/docker-compose.dev.yml restart api`, which
re-runs the full startup chain (`db:generate` → `migrate deploy` → seed → watch)
and picks up the current schema. Confirmed via `docker logs` (new
`PickupPointsController`/`PublicPickupPointsController` routes now mapped) and a
real authed round trip via curl: `POST .../pickup-points` → `GET` → new point
present; public `GET .../public/pickup-points` correctly excludes the disabled
seeded point.

**Gotcha for future schema changes in local dev**: after editing
`schema.prisma`, the running `docker:dev` `api` container needs a manual
`docker compose -f infra/docker/docker-compose.dev.yml restart api` (or a full
`pnpm docker:dev` down/up) to pick up the new Prisma Client — the compose file's
live-reload only covers application source, not a schema change requiring
`prisma generate`. Not fixed here (out of scope for this hotfix); worth
automating later (e.g. watching `schema.prisma` and re-running `db:generate` in
the container's command chain) if it recurs.

Also finished, same session: wired
`apps/api/scripts/seed/{fixtures,helpers,
apply}.ts` to seed pickup points too
(`PickupPointSpec`, `ensurePickupPoint`, `pickupPointKey` on seeded orders) —
verified by running `seed:base` twice locally: stable point counts across reruns
(3 for `demo-tienda-de-camila`, 1 for `demo-kpop-corner`, one seeded point
deliberately `enabled: false` to exercise the disabled-point-hidden-at-checkout
path), and seeded PICKUP orders correctly carry `pickupPointId` +
`deliveryDetails.pickupPointLabel`.
