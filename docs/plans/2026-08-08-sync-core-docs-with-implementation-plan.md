# Sync core docs with actual implementation

**Status:** Pre-implementation plan (written ahead of the work, per audit
follow-up request).

**Source:** `docs/audits/audit-2026-08-08.md` §0, §12 (important finding #9).

## Context

This is a documentation-only plan — zero source code changes, so it carries the
lowest collision risk of any plan in this batch and can safely run fully in
parallel with all the code-focused ones. The audit found the three core spec
docs (`docs/core/architecture.md`, `docs/core/security-payments.md`,
`docs/core/product.md`) describe an earlier version of the product that the code
has since evolved past, in ways significant enough to mislead a new contributor.
`docs/core/admin.md` has a smaller, similar staleness problem.

## Concrete discrepancies to fix (all confirmed against code during the audit)

1. **`architecture.md` §4** still presents the "split `Order.status` into
   `paymentStatus`/`fulfillmentStatus`" split as a _recommendation_ — it's
   already fully implemented (`packages/db/prisma/schema.prisma`'s `Order` model
   has had separate `paymentStatus`, `fulfillmentStatus`, and `status` fields
   since migration `20260720175558`). Rewrite this section to describe the
   current schema as-is, not as a proposal.
2. **`architecture.md` §3** describes a `TenantMiddleware`/
   `AsyncLocalStorage`-based tenant resolution layer as the design — this was
   never built. What's actually implemented is the per-service
   `assertOwnership`/`findOwned*` pattern, audited and confirmed to have zero
   IDOR gaps across all 13 tenant-scoped modules
   (`docs/audits/audit-2026-08-08.md` §5, §13). Rewrite this section to describe
   the pattern that's actually running, and either remove the `TenantMiddleware`
   code sample or clearly re-label it as a considered- and-rejected-for-now
   alternative rather than the design.
3. **`security-payments.md` §9 and `product.md` §5.6/§5.7** describe the buyer
   uploading payment proof in-app (`PaymentProof` model,
   `PENDING_REVIEW`/`APPROVED`/`REJECTED`). **Correction: the original drafting
   cited `product.md` §5.8, which is actually "Buyer Authentication" and
   unrelated — the real payment-proof references are §5.6 ("Checkout & Order
   Creation Flow," step 5: "Buyer uploads payment proof → status
   `PAYMENT_SUBMITTED`") and §5.7 ("Order Tracking States," listing
   `PAYMENT_SUBMITTED` as a real state).** This was never built. What actually
   ships: checkout hands the buyer to WhatsApp
   (`apps/api/src/modules/orders/domain/order-status.vo.ts:10-13`'s comment
   explains why), and the **seller** manually records what came in via
   `OrderPayment` (with an optional image), then approves/rejects. Rewrite these
   sections to describe the WhatsApp-handoff + seller-recorded- payment flow as
   what's actually live, and reframe in-app buyer proof upload as a possible
   future addition rather than current behavior. Check whether
   `docs/business/buyer-flow.md` and `seller-flow.md` (which the audit found
   already correct themselves on this point) can be cross-referenced or
   partially reused as source material — they already describe the real flow
   accurately.
4. **`admin.md`** says the Users admin page is "a disabled 'coming soon'
   placeholder." It isn't —
   `apps/web/features/admin/components/admin-users-table.tsx`
   - `use-toggle-user-ban.ts` are real and wired, `/admin/users` has a real page
     (`apps/web/app/[locale]/(dashboard)/admin/users/page.tsx`), and the
     sidebar's `NAV_ITEMS` entry for `users` carries no `disabled: true` (only
     `admin.md`'s prose is stale, not the nav config). **Correction to the
     original audit-derived wording:** the plan as first drafted also claimed
     admin.md "frames Stores/impersonation as unbuilt" — that part is no longer
     accurate (and wasn't accurate even at audit time; only §0's summary
     mentioned Users, not Stores). `admin.md` already has a full, detailed
     "Stores & impersonation" section (added in commit `0b0a50d`, 2026-07-31,
     well before the audit) correctly describing
     `admin-stores-table.tsx`/`use-impersonate-store.ts`, better-auth's `admin`
     plugin, the impersonation banner, and the 1h session expiry as shipped.
     **Scope for this item is now narrower than originally stated: fix only the
     "Users still placeholder" line** (line ~21-22, "'Stores' is real (see
     below); 'Users' is still a disabled 'coming soon' placeholder, matching
     product.md §4.1's still-unbuilt scope.") — don't touch the Stores section,
     it's already correct.
5. **`deploy.md`**'s "Known limitations" list should be checked against
   whichever of the other concurrent plans (security-baseline, observability)
   land first or in parallel — if this doc-sync work finishes before those,
   leave the limitations list as-is (it's accurate today); if it finishes after,
   update the list to remove whichever items got closed. Use `git log` on
   `docs/core/deploy.md` and the relevant source files to check actual landed
   state rather than assuming. **Re-verified 2026-08-08 during plan review:**
   both
   `docs/plans/2026-08-08-security-baseline-csrf-helmet-rate-limiting-plan.md`
   and `docs/plans/2026-08-08-observability-and-env-validation-plan.md` are
   still status "Pre-implementation plan" (not landed) as of this review —
   `deploy.md`'s "Known limitations" list (rate limiting, CSRF/helmet, env
   validation, single VM, MinIO) is confirmed still 100% accurate today. No edit
   needed to `deploy.md` unless implementation lands first — re-check
   `git log docs/core/deploy.md` and the two plan files' `Status:` lines
   immediately before starting execution, since this could change between review
   and implementation.

## Re-verification (2026-08-08, plan review pass)

Independently re-checked all 5 items against current `docs/core/*.md` and the
actual code (not re-trusting the audit's claims from memory):

- **Item 1** (three-way order status): confirmed still stale in
  `architecture.md` §4 (line 172: "Split the single `status` field... " still
  phrased as a recommendation, with a Prisma sample showing a single two-enum
  shape that doesn't match reality). Confirmed live schema
  (`packages/db/prisma/schema.prisma:231-234`) has `paymentStatus`,
  `fulfillmentStatus`, and `status` (`OrderStatus`, cancellation axis) as three
  separate fields, present since migration
  `20260720175558_add_order_flow_tables`. Still real.
- **Item 2** (`TenantMiddleware`): confirmed still present verbatim in
  `architecture.md` §3 (lines 125-157), including the code sample and the
  `AsyncLocalStorage`-based `RequestContext` design. No `TenantMiddleware` class
  or `tenantContext`/`AsyncLocalStorage` usage exists anywhere in `apps/api/src`
  (grep-confirmed). Still real.
- **Item 3** (WhatsApp handoff vs. in-app proof): confirmed
  `security-payments.md` §9.2 and `product.md` §5.6/§5.7 still describe "buyer
  uploads payment proof → `PAYMENT_SUBMITTED`" as the flow. Confirmed in code:
  `order-status.vo.ts:10-13`'s comment states plainly "MVP checkout redirects
  the buyer to WhatsApp instead of collecting an in-app payment proof, so there
  is no guaranteed PAYMENT_SUBMITTED step." Confirmed `PaymentProof` is
  schema-only — referenced only for reads/response-shaping
  (`order-response.dto.ts`, `order.controller.ts`'s `toPaymentProofDto`) and
  never created anywhere (`prisma.paymentProof.create`/`.upsert`: zero hits
  repo-wide). Still real, and the highest-impact item — see severity below.
- **Item 4** (admin.md): partially stale as originally drafted — narrowed, see
  the correction inline above. The Users-placeholder claim is still real; the
  Stores/impersonation claim was never accurate for this doc and has been
  removed from scope.
- **Item 5** (deploy.md): confirmed both concurrent plans this item is
  conditioned on are still pre-implementation — list is accurate as-is, no edit
  needed at this time (re-check before execution, see inline note above).

No additional discrepancies were found in the sections read during this pass.
`docs/core/admin.md` and `docs/core/product.md` were already partially updated
same-day in commit `589e831` ("docs: update stale docs") — that commit added
`product.md` §5.10 (Discovery Layer) and fixed an inquiries-mailer claim in
`admin.md`, but did **not** touch `product.md` §5.6/§5.7's payment-proof
description or `admin.md`'s Users-placeholder line, so item 3 and the narrowed
item 4 both remain open work for this plan.

## Severity Classification

Severity here rates how misleading/costly the gap is to a new reader of these
docs-only, not implementation effort (all 5 items are "small, writing only" per
the Verification section below).

| # | Item                                                                                               | Severity        | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| - | -------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3 | WhatsApp handoff vs. in-app buyer proof upload (`security-payments.md` §9, `product.md` §5.6/§5.7) | **HIGH**        | The docs describe a buyer-facing upload endpoint/UI and a `PENDING_REVIEW`/`APPROVED`/`REJECTED` proof-review state that were never built. An engineer or reviewer reading only these docs would reasonably plan to build (or debug the absence of) a feature that doesn't exist and isn't planned, and could waste real implementation time before discovering the actual flow is seller-recorded `OrderPayment` + WhatsApp handoff. This is the one item that can send someone to build the wrong thing, not just describe stale internals. |
| 2 | `TenantMiddleware`/`AsyncLocalStorage` tenant resolution (`architecture.md` §3)                    | **MEDIUM-HIGH** | Presented as "CRITICAL" design in the doc's own heading, with a full code sample — a new contributor could go looking for (or start building) a middleware/context layer that isn't there, or misjudge how tenant isolation is actually enforced (per-service `assertOwnership`, audited with zero IDOR gaps per the audit's §5/§13). Slightly below item 3 because the actual pattern is at least documented correctly one section over in CLAUDE.md, giving a careful reader a second source to catch the contradiction.                    |
| 1 | Three-way order status split framed as a recommendation (`architecture.md` §4)                     | **MEDIUM**      | Misleading in a "this looks unfinished" direction rather than a "build the wrong thing" direction — a reader would underestimate how far the order model has progressed, and the stale Prisma sample (two enums, no `OrderStatus` cancellation axis, wrong enum values like `PENDING`/`SHIPPED` vs. real `PENDING_PAYMENT`/`ORDERING`) could get copy-pasted into new code by mistake. Real but lower-stakes than 2/3 since it doesn't point someone at nonexistent buyer-facing surface area.                                                |
| 4 | `admin.md` "Users still placeholder" (narrowed scope)                                              | **LOW-MEDIUM**  | One stale sentence in an otherwise-accurate, already-mostly-fixed doc. Low cost to a reader — worst case someone avoids touching `/admin/users` code assuming it's a stub, or is mildly surprised the "coming soon" page has a working ban button. No risk of building the wrong thing since the real feature already exists to compare against.                                                                                                                                                                                              |
| 5 | `deploy.md` known limitations (conditional)                                                        | **LOW**         | Currently a no-op — re-verified accurate as of this review, contingent only on two other plans' completion timing. Not a live discrepancy right now, just a watch item.                                                                                                                                                                                                                                                                                                                                                                       |

## Approach

Don't do a line-by-line rewrite of every doc — target the specific sections
named above, keep everything else that's still accurate as-is. Where a doc
section describes something as a future improvement that's already done, say so
explicitly rather than just quietly updating the prose (a "✅ implemented — see
X" style note is more useful to a future reader than a silent edit, consistent
with how `architecture.md` already does this in a couple of places, e.g. its
MinIO-vs-R2 callout).

## Files touched

- `docs/core/architecture.md`
- `docs/core/security-payments.md`
- `docs/core/product.md`
- `docs/core/admin.md`
- `docs/core/deploy.md` (conditionally, see item 5)

## Verification

None needed beyond a careful re-read against the current code for each claim
changed — this is prose, not code, but every factual claim should still be
checked against a real file/line the way the audit did, not written from memory
of what "should" be true.

## Definition of done

A new engineer reading only `architecture.md`, `security-payments.md`, and
`product.md` would correctly describe the actual current payment-proof flow
(WhatsApp handoff + seller-recorded payment), the actual current order status
model (three-way split), and the actual current tenant-isolation approach
(per-service ownership checks, no middleware) — no contradiction between what
these docs say and what `docs/audits/audit-2026-08-08.md` found in the code.
