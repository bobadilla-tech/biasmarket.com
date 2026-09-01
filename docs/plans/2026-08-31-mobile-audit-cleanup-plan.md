# Mobile audit cleanup — stale docs, dead package, duplicated validation

**Status:** Not started. Written ahead of the work.

**Original status (pre-implementation):** written ahead of the work, per
mobile-audit follow-up request — deviates from this directory's usual "record
after it lands" convention (see `docs/plans/README.md`).

**Source:** `docs/audits/mobile-architecture-audit-2026-08-31.md` §12
(documentation drift) and §13 (correctness findings).

## Context

The mobile architecture audit surfaced a handful of things that are broken,
stale, or misleading in the repo today — independent of whether mobile ever gets
built. None of these block the mobile MVP plan directly, but leaving them in
place means the mobile team (or anyone else) inherits wrong documentation and a
dead package with a name that invites reuse. Grouping them here because they're
small, independent, low-risk, and better landed as one coherent pass before
mobile work starts touching the same modules.

None of these are urgent production bugs. Sequence this whenever convenient —
before Phase 0 of the mobile MVP plan is a reasonable default so the mobile team
starts from accurate docs and doesn't build against the dead `packages/ui`
package.

## Severity classification

- **Problem 1 (`packages/ui` dead stub) — MEDIUM.** Not causing a bug today, but
  the name actively misleads: CLAUDE.md documents it as the shared component
  package, and any future dev (mobile or web) could reasonably start importing
  from it or adding to it, unaware it's never been wired up.
- **Problem 2 (CLAUDE.md module list stale) — LOW.** Documentation-only, no
  functional risk, but 7 of 23 modules being undocumented is a meaningful gap
  for anyone using CLAUDE.md as the map of the codebase.
- **Problem 3 (`docs/core/security-payments.md` stale on expiry sweep) — LOW.**
  Documentation-only. The actual behavior (BullMQ + internal endpoint) is
  correct and tested; only the doc's description of _how_ is wrong.
- **Problem 4 (state-machine VO bypassed on 2 of 4 paths) — LOW/MEDIUM.** Not
  presently causing an observed bug — both bypass paths (`expire-orders`,
  `cancel-order`) have their own correct-looking guard conditions — but it means
  a future change to `order-status.vo.ts`'s rules silently won't apply to those
  two paths, which is exactly the kind of thing that causes a real bug later.
- **Problem 5 (duplicated file-validation logic) — LOW.** No functional bug;
  purely a maintenance-cost issue (a future size-limit or file-type change needs
  5+ correct edits instead of 1).
- **Problem 6 (`packages/i18n` unused by `apps/api`) — LOW.** Documentation
  claim in CLAUDE.md ("shared by api + web") is inaccurate for `api`; no
  functional issue since backend strings work fine as hardcoded Spanish, but
  worth a decision (fix the claim, or actually wire it up) rather than leaving
  the drift.
- **Problem 7 (missing `Product` JSON-LD on product detail page) — LOW.** SEO
  gap, not a defect; product pages are the most likely deep-link/share target
  and currently carry no structured data of their own.

## Problem 1 — `packages/ui` is a dead, misleadingly-named stub

`packages/ui/index.tsx` is the package's entire content: a 5-line `Button`
component that renders a plain `<button>`. `grep -rn "@biasmarket/ui"` across
`apps/web` returns zero import sites — only the `package.json` dependency
declaration (`apps/web/package.json`) references it at all. CLAUDE.md describes
it as "Shared React components (theme-aware, no business logic, no fetching)."

**Fix — pick one, don't leave it as-is:**

- **(a) Delete it.** Remove `packages/ui` entirely, drop it from
  `apps/web/package.json`'s dependencies and from the root workspace list,
  update CLAUDE.md's monorepo layout table to remove the row.
- **(b) Repurpose it explicitly.** If the mobile MVP plan's
  `packages/design-tokens` package (color/spacing/type-scale values shared
  between Tailwind config and NativeWind config) is a better fit for this
  package name/slot, rename `packages/ui` to `packages/design-tokens` (or
  replace its content) rather than creating a second new package alongside a
  dead one with a confusingly similar name.

Recommend **(b)** if the mobile MVP plan proceeds soon (avoids two
similarly-purposed packages existing at once); recommend **(a)** if mobile is
not imminent. Either way, update CLAUDE.md's package table to match reality.

## Problem 2 — CLAUDE.md's module list is stale

CLAUDE.md's "API structure" section lists 16 modules under
`apps/api/src/modules/*`. The actual directory has 23: `coupons`, `couriers`,
`monitoring`, `restock`, `addresses`, `whatsapp-templates` are missing from the
list, and a separate `global-account` controller (buyer-facing,
slug-independent) isn't mentioned anywhere.

**Fix:** update the module list in CLAUDE.md's "API structure (apps/api/src)"
section to include all 23, plus a one-line note on `global-account` alongside
the existing `customer-auth` description since they're closely related (global
buyer identity vs. per-store buyer session).

## Problem 3 — `docs/core/security-payments.md` §9 is stale on the expiry sweep

The doc describes the order-expiration sweep as an in-process
`@Cron("*/5 * * * *")` inside a file called `orders-cron.service.ts`. That file
does not exist in the current codebase (confirmed — no `@Cron`/`@Interval`
decorator anywhere in `apps/api/src`). The actual implementation:
`apps/workers/src/jobs/orders/expire-orders-scheduler.service.ts` registers a
BullMQ repeatable job (`queue.upsertJobScheduler`), and
`apps/workers/src/jobs/orders/expire-orders.processor.ts` calls
`POST /internal/orders/expire-sweep`
(`apps/api/src/modules/orders/infrastructure/internal-jobs.controller.ts`),
guarded by a shared secret + network isolation. This is a deliberate,
already-migrated architecture (comment in
`expire-orders-scheduler.service.ts:7-13` explicitly notes the migration from
`apps/api`'s own in-process `@Cron`) — only the doc is behind.

**Fix:** update `docs/core/security-payments.md` §9's description of the sweep
mechanism to match the current BullMQ + internal-endpoint architecture. No code
change needed.

## Problem 4 — order state-machine VO bypassed on 2 of 4 mutation paths

`apps/api/src/modules/orders/domain/order-status.vo.ts`'s `PAYMENT_TRANSITIONS`
forbids `PAYMENT_SUBMITTED → CANCELLED` directly (only
`review-payment.usecase.ts` is meant to drive terminal transitions after that
state). But `expire-orders.usecase.ts:52-65` and `cancel-order.usecase.ts` both
mutate `Order.paymentStatus`/`status` via a raw
`tx.order.updateMany({ where: {...}, data: {...} })` call, bypassing the `Order`
domain entity and `assertPaymentTransition` entirely — and both achieve exactly
the transition the VO forbids, through a path the VO never sees.

**Fix — align intent and enforcement, choose one:**

- **(a)** If the two bypass paths' behavior is correct as designed (an expiring
  or seller-cancelled order _should_ be able to move straight from
  `PAYMENT_SUBMITTED` to `CANCELLED`), update `PAYMENT_TRANSITIONS` in
  `order-status.vo.ts` to actually allow it, and route
  `expire-orders.usecase.ts`/`cancel-order.usecase.ts` through the `Order`
  entity's methods instead of raw `Prisma.updateMany`, so the VO becomes the
  actual single source of truth its own comments claim it is.
- **(b)** If routing through the entity is impractical for these two paths (e.g.
  because they operate on a batch of orders inside one transaction, unlike the
  single-order approve/reject flow), at minimum add a comment in
  `order-status.vo.ts` next to `PAYMENT_TRANSITIONS` noting that
  `expire-orders.usecase.ts` and `cancel-order.usecase.ts` intentionally bypass
  this table and why, so a future reader doesn't assume the table is exhaustive.

Prefer (a) if it's a small lift — it closes a real (if currently harmless) gap
between the code's stated invariant and its actual behavior.

**Files likely touched:**
`apps/api/src/modules/orders/domain/order-status.vo.ts`,
`apps/api/src/modules/orders/application/expire-orders.usecase.ts`,
`apps/api/src/modules/orders/application/cancel-order.usecase.ts`, plus existing
e2e coverage in `apps/api/test/orders.e2e-spec.ts` to confirm no regression in
the expiry-sweep or cancel behavior.

## Problem 5 — duplicated file-validation logic across controllers

The 5MB size cap + JPEG/PNG/PDF magic-byte sniffing is hand-rolled inline in at
least 5 places: `products.controller.ts`, `stores.controller.ts`,
`payment-config.controller.ts`, `checkout.controller.ts`, `order.controller.ts`
/ `customer-order-payments.controller.ts`.

**Fix:** extract a shared NestJS pipe or decorator (e.g.
`@ValidateUploadedImage({ maxSizeBytes, allowedTypes })`) in
`apps/api/src/common/` and replace each inline check with it. Low risk since
each call site's current validation is functionally equivalent — this is a
mechanical consolidation, not a behavior change. Add one unit test for the
shared pipe covering size-over-limit, wrong-magic-bytes, and happy-path cases;
existing controller e2e tests should continue passing unchanged since the
externally observable behavior doesn't change.

## Problem 6 — `packages/i18n` declared but unused by `apps/api`

`apps/api/package.json` lists `@biasmarket/i18n` as a dependency, but
`grep -rn "i18n" apps/api/src` returns zero matches — every backend
error/notification string is a hardcoded Spanish literal (e.g. `'Máximo 5MB'`,
`'Solo JPEG o PNG'`). CLAUDE.md's package table describes `packages/i18n` as
"shared by api + web," which is only true at the dependency-declaration level.

**Fix — pick one:**

- **(a)** Drop the unused dependency from `apps/api/package.json` and correct
  CLAUDE.md's description to say `packages/i18n` is web-only today.
- **(b)** Actually wire it up — replace the hardcoded backend strings with
  `@biasmarket/i18n` lookups, respecting `User.locale`/`Store` locale settings.
  Larger scope; only worth doing if there's an actual near-term need for
  localized backend error messages (e.g. an English-speaking seller base
  emerging). Not recommended as part of this cleanup pass — flag as a separate
  decision rather than defaulting to it here.

Recommend **(a)** for this pass; treat **(b)** as a separate, deliberately
scoped future plan if the need arises.

## Problem 7 — missing `Product` JSON-LD on the product detail page

`apps/web/app/[locale]/(storefront)/store/[slug]/product/[productId]/page.tsx`
has no structured data of its own; only the parent store's listing page
(`store/[slug]/page.tsx:93-123`) emits `Product`/`Offer` JSON-LD nodes, one per
visible product.

**Fix:** add a `Product` JSON-LD block to the product detail page's server
component, following the same pattern already used on the store listing page
(`buildJsonLd()` in `store/[slug]/page.tsx`) — reuse or extract that function's
per-product node-building logic rather than writing a second, divergent
implementation.

## Files likely touched

- `packages/ui/*`, `apps/web/package.json`, root workspace config, `CLAUDE.md`
  (Problem 1)
- `CLAUDE.md` (Problems 2, 6a)
- `docs/core/security-payments.md` (Problem 3)
- `apps/api/src/modules/orders/domain/order-status.vo.ts`,
  `apps/api/src/modules/orders/application/expire-orders.usecase.ts`,
  `apps/api/src/modules/orders/application/cancel-order.usecase.ts` (Problem 4)
- `apps/api/src/common/` (new shared upload-validation pipe),
  `products.controller.ts`, `stores.controller.ts`,
  `payment-config.controller.ts`, `checkout.controller.ts`,
  `order.controller.ts`, `customer-order-payments.controller.ts` (Problem 5)
- `apps/api/package.json` (Problem 6a)
- `apps/web/app/[locale]/(storefront)/store/[slug]/product/[productId]/page.tsx`
  (Problem 7)

## Verification

- `pnpm typecheck` and `pnpm lint` — clean across all touched packages after the
  `packages/ui` change (Problem 1), since it changes a workspace dependency
  graph.
- `pnpm --filter api test` — existing `orders` unit specs pass unchanged; add
  new unit coverage for the shared upload-validation pipe (Problem 5).
- `pnpm --filter api test:e2e` — `orders.e2e-spec.ts` and any
  file-upload-touching e2e specs (products, checkout, payment-config) stay green
  after Problems 4 and 5, confirming no behavior change slipped in during the
  consolidation/alignment work.
- Manual: load the product detail page, verify `Product` JSON-LD renders via
  browser devtools or Google's Rich Results Test (Problem 7).
- Docs-only fixes (Problems 2, 3, 6a) need no automated verification — just a
  read-through against the current code to confirm accuracy before merging.
