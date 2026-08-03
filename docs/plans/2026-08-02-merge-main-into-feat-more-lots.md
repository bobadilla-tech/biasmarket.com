# Merge `origin/main` into `feat/more-lots`

## Context

GitHub reported `feat/more-lots` as conflicting with `main` across 5 files. Root
cause: `main` picked up a small teammate feature ("feat: add payment method on
checkout", PR #41) — a new public payment-methods endpoint, a payment-locking
rule for orders, and a payment-method selector on the storefront checkout page —
landing directly on the old monolithic `orders/page.tsx` and
`checkout/page.tsx`. Meanwhile `feat/more-lots` had already split both pages
into the `features/orders/` and `features/checkout/` feature-sliced structure
(per `apps/web/AGENTS.md`'s migration roadmap), so a naive merge collided the
two page files entirely rather than at a few lines.

## Decisions

- **Take the feature-sliced structure as the base, port main's logic into it**,
  not the other way around — the monolithic `page.tsx` versions are gone for a
  reason (migration roadmap step 6, already completed on this branch).
- **Payment lock rule** (`CANCELLED`/`REJECTED`/`VERIFIED` payment status, or
  `IN_TRANSIT`/`READY`/`COMPLETED` fulfillment status blocks new payments) moved
  into `features/orders/lib/order-status.ts` as `paymentsLocked(order)`, reused
  from both `order-detail-sheet.tsx` (hides `RegisterPaymentForm`, shows a
  locked-state card instead) and `orders-page-client.tsx` (belt-and-suspenders
  guard on the `onRegisterPayment` callback, in case of stale selection state).
  Progress-bar percentage also now clamps to 100% once
  `fulfillmentStatus ===
  "COMPLETED"`, matching main's fix.
- **Checkout payment-method selector ported but kept display-only**, matching
  main's actual behavior: traced the backend `CreateOrderDto` and confirmed
  `paymentMethod` was never part of the checkout payload on main either — the
  selector shows the store's enabled methods but doesn't feed the submission.
  Rebuilding it as functional (validated + submitted) would have been new scope
  beyond what main shipped, not a merge decision to make silently.
- **Backend conflicts (`payment-config.controller/module.ts`,
  `pickup-points.service.ts`) were near-identical** — main added
  `PublicPaymentConfigController` (`GET /stores/:slug/public/payment-methods`,
  `@Public()`) which both features (orders lock UI didn't need it, checkout
  selector did) depend on for fetching enabled methods pre-auth. Kept as-is,
  normalized to the repo's double-quote style.

## What changed

**New logic (ported from main, adapted to feature-sliced code):**

- `apps/web/features/orders/lib/order-status.ts` — added `paymentsLocked()`.
- `apps/web/features/orders/components/order-detail-sheet.tsx` — gates
  `RegisterPaymentForm` behind `paymentsLocked()`, clamps progress % at 100 for
  completed orders.
- `apps/web/features/orders/index.ts` — export `paymentsLocked`.
- `apps/web/app/[locale]/(dashboard)/dashboard/[slug]/orders/orders-page-client.tsx`
  — `onRegisterPayment` early-returns when `paymentsLocked(selectedOrder)`.
- `apps/web/features/checkout/schemas/checkout.schema.ts` — added
  `paymentMethodSchema`/`paymentMethodListSchema`.
- `apps/web/features/checkout/api/checkout.api.ts` — `getDeliveryOptions` now
  also fetches `/stores/:slug/public/payment-methods` in parallel.
- `apps/web/features/checkout/components/checkout-form.tsx` — display-only
  payment-method `Select`, defaults to the store's first enabled method.
- `apps/web/features/checkout/index.ts` — export the new schema/types.
- `apps/web/features/checkout/api/checkout.api.test.ts` — updated for the third
  parallel fetch.

**Straight merges (no logic changes beyond formatting):**

- `apps/api/src/modules/payment-config/payment-config.controller.ts` — added
  `PublicPaymentConfigController`.
- `apps/api/src/modules/payment-config/payment-config.module.ts` — registers the
  new controller.
- `apps/api/src/modules/pickup-points/pickup-points.service.ts` — auto-merged,
  whitespace-only diff.
- `apps/api/src/modules/orders/infrastructure/order.controller.ts` — auto-merged
  cleanly (backend `paymentsLocked` guard on the register-payment endpoint).
- `packages/i18n/{en,es}/dashboard.json` — auto-merged, added `paymentsLocked`
  translation key.

**Rewritten to drop dead code:**

- `apps/web/app/[locale]/(dashboard)/dashboard/[slug]/orders/page.tsx` and
  `.../checkout/page.tsx` — resolved back to the thin server-component wrapper
  (`generateMetadata` + render the `*PageClient`); the ~900-line monolithic
  implementations from main's side of the conflict were fully superseded and
  deleted rather than kept unreachable.

## Verification

- `pnpm turbo run typecheck --filter=api --filter=web` — clean.
- `pnpm turbo run test --filter=api --filter=web` — 283 + 197 = 480 tests
  passed, no failures.
- `git diff --check` — no leftover conflict markers.
- Not manually smoke-tested in a browser (no seeded DB in this session) — only
  typecheck/test verified, consistent with how the preceding feature-sliced
  migration work on this branch was verified.

Merge committed and pushed to `feat/more-lots` (`ac014b1`, merging
`origin/main`'s `6881ce3`).
