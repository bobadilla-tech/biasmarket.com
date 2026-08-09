# Buyer-initiated proof-of-payment upload

Written before execution, at the user's explicit request, to allow a review pass
before code is written (deviates from this directory's normal "record after the
work lands" convention — see `docs/plans/README.md`).

**Explicit deviation from a standing recommendation, flagged for the record:**
`docs/audits/product-engineering-business-audit-2026-08-08.md` §16 item 10 says
explicitly: "don't build it speculatively; ask 5-10 sellers using the Phase 1
flow whether manual recording is actually painful" — i.e. build this _after_
validating demand, not before. §17 doesn't list this one as a hard "don't
build," but §15 places it in Phase 2, gated on Phase 1 being live first. The
user has explicitly asked for the whole proof-of- payment system now, including
this buyer-upload half. This plan proceeds on that explicit instruction; whoever
executes should not silently defer scope back to the audit's phased
recommendation.

## Context

Confirmed via investigation:

- A `PaymentProof` model (`PENDING_REVIEW`/`APPROVED`/`REJECTED` `ProofStatus`)
  **used to exist** and was **deleted outright** in migration
  `20260808192135_delete_payment_proof`, per
  `docs/plans/2026-08-08-payment-proof-image-access-control-plan.md`'s execution
  notes — it was "never written to anywhere in `apps/api/src`," and that plan's
  own Problem 2 explicitly framed "wire it up for real" as the road not taken.
  This plan is, in effect, building the thing that was just removed as dead
  weight — worth being deliberate about the shape this time so it doesn't end up
  dead again.
- **Today, `OrderPayment` (the replacement — schema.prisma:275-290) is
  exclusively seller-recorded.** The only write path is
  `POST stores/:storeId/orders/:orderId/payments`
  (`apps/api/src/modules/orders/infrastructure/order.controller.ts:325-466`),
  class-level `@UseGuards(AuthGuard)` (better-auth seller session, line
  255-256) + `assertOwnership(storeId, session.user.id)` (line 339). No
  `@Public()` override, no `CustomerSessionGuard` variant exists on this
  endpoint today.
- **A real, working buyer-session primitive already exists** and is the correct
  mechanism to gate a new buyer-upload endpoint: `CustomerSessionGuard` +
  `@CustomerSession()` decorator, used today on `stores/:slug/account/me`
  (GET/PATCH) and `change-password` (`customer-auth.controller.ts:96-133`).
  Reuse this — don't invent a new buyer-auth mechanism.
- Storage: `StorageService.uploadPaymentImage`
  (`apps/api/src/storage/storage.service.ts:40-42`) already writes into the
  **private** `paymentBucket` (`S3_PAYMENT_BUCKET`, no anonymous-read policy —
  landed via the payment-proof-image-access-control plan). This is the correct
  bucket for buyer-submitted proof too — reuse the method, don't add a third
  bucket.
- Reading a payment image back is already access-controlled and ownership-gated
  for the **seller** path
  (`GET stores/:storeId/orders/:orderId/payments/:paymentId/image`,
  `order.controller.ts:301-323`, streams via
  `StorageService.getPaymentImageStream`). A buyer-facing read path (so a buyer
  can see their own previously- submitted screenshot, per the user's "mini
  dashboard... to see all of its previous buys, their previously sent
  screenshots" ask) needs an equivalent endpoint gated by
  `CustomerSessionGuard` + an ownership check that the requesting buyer's
  `customerId`/order actually matches, not the seller's `assertOwnership`.

## Decision: model shape

**Do not resurrect a separate `PaymentProof` model with a duplicate
review-status lifecycle running alongside `OrderPayment`.** The prior deletion's
stated reason was exactly this kind of duplication risk (two overlapping
payment-tracking concepts). Instead: **extend `OrderPayment`** with the fields
needed to distinguish buyer-submitted rows from seller-recorded ones and give
buyer-submitted rows a review state:

```prisma
model OrderPayment {
  id          String             @id @default(cuid())
  orderId     String
  storeId     String
  amount      Decimal            @db.Decimal(10, 2)
  currency    String
  method      PaymentMethodType?
  note        String?
  imageUrl    String?
  createdAt   DateTime           @default(now())
  // new:
  source      PaymentSource      @default(SELLER_RECORDED)
  reviewStatus PaymentReviewStatus @default(N_A)   // buyer-submitted rows start PENDING_REVIEW
  reviewedAt  DateTime?
  reviewedBy  String?            // User.id, seller who approved/rejected

  order Order @relation(fields: [orderId], references: [id])
}

enum PaymentSource {
  SELLER_RECORDED
  BUYER_SUBMITTED
}

enum PaymentReviewStatus {
  N_A            // seller-recorded rows: no review needed, counts toward paidAmount immediately
  PENDING_REVIEW // buyer-submitted, not yet counted toward paidAmount
  APPROVED       // seller approved — now counts toward paidAmount
  REJECTED       // seller rejected — never counts
}
```

**Critical invariant, must not be skipped**:
`OrderRepository.withPaymentSummary` /`computePaymentSummary`
(`apps/api/src/common/payment-summary.ts`, referenced in `apps/web/AGENTS.md`'s
Batch 4 note as the shared Decimal-safe helper) sums `OrderPayment.amount` to
compute `paidAmount`/`pendingAmount`. **A buyer-submitted, unreviewed row must
NOT be summed into `paidAmount`** — only `SELLER_RECORDED` and `APPROVED` rows
should count. Read `payment-summary.ts` fully before changing anything here;
this is exactly the kind of money-precision-adjacent logic that plan's own
history shows is easy to get subtly wrong (see the Batch 4 note's
float-vs-Decimal bug that was found and fixed independently). Also re-check the
`order-status-buyer-login-
pickup-checkout-fixes-plan.md`'s Feature 1 guard
(blocking `VERIFIED` when `paidAmount <= 0`) — that guard's correctness now
depends on this same "only counted rows count" invariant holding.

**This invariant has more call sites than just `payment-summary.ts` — confirmed
via grep, all of the following sum `OrderPayment.amount` directly, unfiltered by
source/review status, and must be updated in the same PR or they will silently
inflate revenue/spend numbers with unreviewed buyer submissions:**

- `apps/api/src/modules/stats/stats.service.ts:74-77` — dashboard revenue,
  `orderPayment.aggregate({ _sum: { amount: true } })`.
- `apps/api/src/modules/stats/stats.service.ts:154,191-203` — analytics- bucket
  revenue, manual `.reduce()` over a narrow `select: { amount: true }`.
- `apps/api/src/modules/orders/application/customers.service.ts:60-65,89-93,
  75,138-142`
  — seller-dashboard `lifetimeSpend` (both registered and guest customers),
  manual `.reduce()` over the same narrow shape.

Concretely: a buyer submits a `BUYER_SUBMITTED`/`PENDING_REVIEW` proof against
an order that's already `VERIFIED` (e.g. the seller already recorded the balance
via their own flow, and the buyer separately re-submits a screenshot) — every
one of the sites above would count that unreviewed amount today. Fix each one
the same way `payment-summary.ts` is fixed (add `source`/`reviewStatus` to the
`select`/`where`), and add all three files to "Files likely touched" below —
they are not optional cleanup, they're the same bug in three more places.

**`computePaymentSummary`/`withPaymentSummary`'s current type signature only
accepts `{ amount: Prisma.Decimal }[]`** (`payment-summary.ts:12-14,32-36`) — it
has no `source`/`reviewStatus` fields to filter on today. "Filter the sum" below
is not a one-line change inside the function body; it requires **widening the
input type** to carry the two new fields, and updating every caller that passes
a narrow `select` (not a full `include`) to actually select them — callers
already using `include` get the new fields for free.

## Backend changes

1. Prisma migration: `OrderPayment.source`/`reviewStatus`/`reviewedAt`/
   `reviewedBy` as above.
2. `payment-summary.ts`: filter the sum to
   `source === "SELLER_RECORDED" || reviewStatus === "APPROVED"` — this is the
   single most important line in this whole plan, get a second pair of eyes on
   it during review.
3. **New buyer endpoint**: `POST stores/:slug/account/orders/:orderId/payments`
   (nested under the existing customer-auth route prefix, gated by
   `CustomerSessionGuard`), multipart upload (mirror the seller `addPayment`
   endpoint's multipart handling in `order.controller.ts` for the actual
   `FileInterceptor`/validation pattern — same 5MB-ish cap, same mime-type
   allowlist). Body: `amount`, `method`, optional `note`, required image.
   **Validate `amount` against `order.pendingAmount`** (same guard
   `order.controller.ts:363-375` already applies on the seller path) — low
   money-risk since an unreviewed submission doesn't count yet, but there's no
   reason to let a buyer submit a nonsense amount a seller then has to manually
   catch. **Update since this plan was written:
   `2026-08-08-global-buyer-account-plan.md` has landed** (see its own Execution
   notes) — `CustomerSessionGuard`'s real shape today is
   `{ buyerAccountId: string }` only, **no `storeId`, no `id`, no `customerId`
   at all** (`customer-session.guard.ts:39-40`). Ignore this plan's earlier "use
   `session.id` unless the global plan has landed" hedge — that plan has landed,
   use the real shape directly: ownership check is
   `order.buyerAccountId === session.buyerAccountId` **and**
   `order.storeId === store.id` (resolved from `:slug`). `Order.buyerAccountId`
   is a real nullable column already (`schema.prisma:227`, added alongside the
   legacy `customerId`). Route shape stays store-scoped
   (`stores/:slug/account/orders/:orderId/payments`) even though the identity
   behind it is global — mirror `addresses.controller.ts`'s already-landed
   precedent for this exact pattern (`@ApiParam({ name: "slug" })` without a
   matching `@Param` — required or Orval's spec validator rejects the `{slug}`
   path segment, same gap `customer-auth.controller.ts` hit first). Creates an
   `OrderPayment` row with `source: BUYER_SUBMITTED`,
   `reviewStatus: PENDING_REVIEW`. **Guest orders
   (`Order.buyerAccountId === null`) are out of scope for this endpoint** —
   `CustomerSessionGuard` requires an authenticated `BuyerAccount`, so a guest
   buyer has no session and cannot reach this endpoint even for their own order;
   state this explicitly as a non-goal rather than leaving it an implicit gap,
   since guest checkout is common in this product.
4. **New buyer read endpoint** for the buyer's own submitted images: extend
   `GET stores/:slug/account/orders/:orderId/payments/:paymentId/image` (or fold
   into whatever the mini-dashboard plan needs) — same `CustomerSessionGuard` +
   ownership check as above. **The lookup must be a compound query scoped by
   `{paymentId, orderId, storeId/customerId}` together** — mirror
   `OrderRepository.findPaymentForStore` (`order.repository.ts:57-69`), the
   pattern the seller path already uses. Checking order-ownership for `:orderId`
   and then fetching `:paymentId` as an independent lookup would let a buyer
   view another buyer's payment image by pairing their own valid `orderId` with
   someone else's `paymentId` — an IDOR gap that's easy to introduce if the two
   checks aren't written as one compound query. Streams via the existing
   `StorageService.getPaymentImageStream`.
5. **Seller review UI needs a corresponding backend surface**: the existing
   seller `addPayment`/list-payments endpoints should now distinguish
   `PENDING_REVIEW` buyer submissions needing action from already-recorded
   payments. Add `approve`/`reject` actions on a `BUYER_SUBMITTED` row
   (`PATCH stores/:storeId/orders/:orderId/payments/:paymentId/review`, seller
   `AuthGuard` + `assertOwnership`) — approving sets
   `reviewStatus: APPROVED, reviewedAt: now(), reviewedBy: session.user.id`;
   rejecting sets `REJECTED`. Neither mutates `amount`/`method` — if a seller
   disagrees with the buyer's claimed amount, rejecting and manually recording
   their own `SELLER_RECORDED` row is the existing, unchanged path.
6. **Notify the seller** when a buyer submits a proof — check
   `apps/api/src/modules/notifications/` for the existing notification- creation
   pattern (used elsewhere for order events) and add a new notification type
   here; don't leave submissions silent until a seller happens to open the
   order.

## Frontend changes

1. New buyer-facing upload UI — likely lives in the mini-dashboard plan's
   order-detail view (`2026-08-08-buyer-mini-dashboard-plan.md`), since that's
   where a buyer would see "amount pending" and act on it. **This plan owns the
   upload form component and its mutation
   (`features/customer-auth/mutations/use-submit-payment-proof.ts` or similar,
   raw `FormData` multipart — same carve-out pattern as the seller's
   `registerPayment`, per `apps/web/AGENTS.md`'s documented multipart
   exceptions); the mini-dashboard plan owns where it's mounted.** Coordinate
   sequencing (see that plan's own note).
2. Seller dashboard: `RegisterPaymentForm`/payment-history list
   (`apps/web/features/orders/components/payment-history-list.tsx`) needs to
   visually distinguish `PENDING_REVIEW` buyer submissions (needs action —
   approve/reject buttons) from already-settled rows. Check
   `order-detail-sheet.tsx` and `payments-page-client.tsx` (both call sites for
   payment history, per the earlier order-status-guard plan's file list) for
   where to add the approve/reject affordance.
3. Regenerate OpenAPI + Orval client after DTO changes.

## Sequencing note — resolved, `global-buyer-account` already landed

This plan was originally written to hedge against `CustomerSessionGuard` still
carrying the old per-store `{customerId, storeId}` shape. That's no longer the
case: `2026-08-08-global-buyer-account-plan.md` and
`2026-08-08-buyer-shipping-addresses-plan.md` (which hit and fixed exactly this
"built against the stale session shape" bug once already, see that plan's own
Execution notes) have both landed. Implement directly against today's real
shape, `{buyerAccountId}` — see the updated ownership-check text above. No
hedging needed.

**Migration-application check before starting**: `global-buyer-account`'s own
execution notes record that its schema migration
(`20260809220000_add_buyer_account`) was hand-written but **never applied to a
real database** in that session (no live Postgres available then). Confirm
`prisma migrate status` is clean (all migrations through
`20260809230000_add_buyer_shipping_addresses` applied) against whatever dev DB
this session has access to before writing new migrations on top — otherwise
`pnpm db:generate`/`prisma migrate dev` may generate a diff against tables that
don't actually exist yet.

## Non-goals

- Not building a generic "moderation queue" UI beyond simple approve/reject
  buttons on the existing order-detail surfaces — no separate admin page.
- Not auto-approving based on any image analysis/OCR — purely manual seller
  review, matching how `OrderPayment` review already works today for
  seller-recorded entries (there is no automated verification anywhere in this
  codebase, don't introduce the first one here).
- Not changing how `SELLER_RECORDED` rows behave — they keep counting
  immediately, no review step added retroactively.

## Files likely touched

- `packages/db/prisma/schema.prisma` + migration
- `apps/api/src/common/payment-summary.ts` (the critical filter change)
- `apps/api/src/modules/orders/infrastructure/order.controller.ts` (new buyer
  endpoints — **note:** several other plans/recent work also touch this file,
  re-read before editing)
- `apps/api/src/modules/customer-auth/` (routing the new nested endpoints, or a
  new small module if that's cleaner — decide during implementation)
- `apps/api/src/modules/notifications/` (new notification type)
- `apps/web/features/orders/components/payment-history-list.tsx`,
  `order-detail-sheet.tsx`, `payments-page-client.tsx`
- `apps/web/features/customer-auth/` (new upload mutation)
- `apps/api/openapi.json` + `packages/types/generated/**`

## Verification

- Unit tests: `payment-summary.spec.ts` (or wherever its current coverage lives)
  — explicit case proving a `PENDING_REVIEW` row does NOT count toward
  `paidAmount`, and an `APPROVED` row does.
- e2e: buyer submits proof → order's `paidAmount` unchanged → seller approves →
  `paidAmount` updates → seller can still reject instead, row never counts.
- Manual: confirm a buyer can only upload against their own order (attempt
  cross-order/cross-customer submission, expect 403/404), confirm the image read
  endpoint has the same ownership gate as the seller one.
- `pnpm --filter api test`, `pnpm typecheck`.

## Definition of done

A buyer can submit a payment screenshot in-app against their own order without
contacting the seller via WhatsApp first; the submission does not silently count
as "paid" until a seller explicitly approves it; a seller sees pending
submissions and can approve/reject from the same surfaces they already use to
record payments manually.
