# Assisted order security and privacy audit

**Scope:** GitHub issue [#279](https://github.com/bobadilla-tech/biasmarket.com/issues/279), reviewed from the repository checkout on 2026-10-29.

**Status:** Code inspection completed. This is a static review; tests, production configuration, live logs, and the KoreaLexa pilot were not exercised.

## Findings

### Protections confirmed in source

- Assisted-order creation requires an authenticated seller and checks store ownership before creating the order. The access token is returned once in a `no-store` response; only its hash is persisted. Creation audit metadata contains order ID, item count, delivery type, and payment method, not the buyer's phone, alias, or token. (`apps/api/src/modules/orders/infrastructure/assisted-orders.controller.ts`; `apps/api/src/modules/orders/application/create-assisted-order.usecase.ts`.)
- Seller routes have per-user throttling: creation, link rotation, and phone correction are limited to 20 requests per minute per signed-in seller and endpoint. This does not implement a separate burst or distinct-phone threshold. (`apps/api/src/common/guards/seller-throttler.guard.ts`; `apps/api/src/modules/orders/infrastructure/assisted-orders.controller.ts`.)
- Link rotation and phone correction write audit records without phone, alias, or token. Phone correction is restricted until the link is opened or claimed. (`apps/api/src/modules/orders/application/manage-assisted-order-link.usecase.ts`.)
- Order-event payloads are allow-listed to non-identity fields. Buyer timeline queries filter on `visibleToBuyer`, which is set from an explicit event-type allow-list. (`apps/api/src/modules/orders/application/order-events.service.ts`.)
- The public order API hashes tokens for lookup, rejects unknown/revoked tokens with a common 404, rate limits public routes, and sends no-store/no-referrer headers. Proof uploads check the token before multipart parsing. (`apps/api/src/modules/orders/infrastructure/public-order-events.controller.ts`; `apps/api/src/modules/orders/infrastructure/public-order-token.guard.ts`; `apps/api/src/modules/orders/application/order-events.service.ts`.)
- API exception paths and Sentry events scrub public-order token paths. The web Sentry scrubber covers `/pedido/` paths and deep event data. (`apps/api/src/common/filters/all-exceptions.filter.ts`; `apps/api/src/common/error-tracking.ts`; `apps/web/lib/scrub-sentry.ts`.)
- Google OAuth requests `openid email profile`; no broader scopes were found in the buyer OAuth configuration. (`apps/api/src/modules/customer-auth/buyer-google-oauth.ts`.)

### Open items before #279 can be marked complete

1. **Seller creation abuse control:** The current 20/min per-user throttle is a general endpoint limit. No additional burst or many-distinct-phone control was found. Decide and implement a suitable policy if the issue's abuse-control criterion requires more than this throttle.
2. **Buyer privacy notice:** I did not find the short notice on the public assisted-order page stating that the store has the buyer's number to send order updates. Search and confirm the rendered page before closure.
3. **Deletion and retention:** I found no documented process for a buyer's request to delete/anonimize phone and alias across `Order`, `Customer`, and `OrderEvent`, and no retention period for unclaimed assisted orders. Define and document these before collecting pilot data.
4. **Test evidence:** Existing focused tests are present for event sanitation, audit metadata, public token access, and tenant boundaries, but this audit did not run them. Review their current coverage and record the exact passing commands/results before calling the verification criteria complete.
5. **Operational evidence:** Source inspection cannot establish whether production Caddy access logs are enabled or whether deployed API/web error-tracking configuration uses these scrubbers. Confirm deployment settings and log samples without exposing buyer data.
6. **Audit coverage completeness:** Addressed in source by adding actor-attributed records for assisted tracking, packed-photo, and buyer-claim actions. The mapping below records the relevant existing and added paths. Runtime behavior still requires the focused tests to pass.

## Verification boundary

This document records source evidence only. It does not certify deployed behavior, live Caddy or GlitchTip settings, database retention, or end-to-end tenant isolation. The checklist in issue #279 remains open until the open items above are resolved and required tests are run.

## Assisted-order AuditLog coverage mapping

| #279 action | AuditLog action | Actor | Metadata |
| --- | --- | --- | --- |
| Creation | `order.assisted_created` | Creating seller (`User.id`) | Source, item count, delivery method, payment method; no phone, alias, or token |
| Phone correction | `order.phone_corrected` | Correcting seller (`User.id`) | Empty |
| Link regeneration | `order.link_regenerated` | Seller (`User.id`) | Empty |
| Payment registration | `payment.partial` or `payment.recorded`; settlement also writes `payment.approved` | Recording/reviewing seller (`User.id`) | Amount, method, resulting status where relevant; no proof contents |
| Payment proof decision | `payment_proof.approved` / `payment_proof.rejected` | Reviewing seller (`User.id`) | Sanitized reason only |
| Payment void | `payment.voided` | Voiding seller (`User.id`) | Order ID and sanitized reason |
| Fulfillment state change | `fulfillment.advanced` | Advancing seller (`User.id`) | From/to statuses |
| Cancellation | `order.cancelled` | Cancelling seller (`User.id`) | Resolution and bounded money amounts |
| Automatic expiry | `order.expired` | System | Resolution and bounded money amounts |
| Tracking number added or changed | `order.tracking_added` | Editing seller (`User.id`) | Empty; tracking number and URL are excluded |
| Packed photo uploaded | `order.packed_photo_added` | Uploading seller (`User.id`) | Empty; photo URL and contents are excluded |
| Buyer claim | `order.claimed` | Claiming buyer (`BuyerAccount.id`) | Actor type only; email, Google subject, phone, token, and claim-ticket data are excluded |

The tracking, packed-photo, and claim AuditLog inserts share the corresponding successful write transaction. Rejected or repeated claims write no new audit row. Tracking/photo audit rows are limited to `VENDOR_ASSISTED` orders so marketplace paths do not gain unrelated duplicate audit records. Focused tests were updated for attribution, sensitive-value exclusion, and rejected claims; they were not run during this static review.
