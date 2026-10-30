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
3. **Deletion and retention:** Defined, implemented, and tested in [assisted-order-data-retention-2026-10-29.md](./assisted-order-data-retention-2026-10-29.md): a verified per-store request workflow and daily erasure of unclaimed assisted orders 90 days after closure. The workflow preserves financial, order, event, and audit records and does not delete buyer accounts.
4. **Test evidence:** Existing focused tests are present for event sanitation, audit metadata, public token access, and tenant boundaries, but this audit did not run them. Review their current coverage and record the exact passing commands/results before calling the verification criteria complete.
5. **Operational evidence:** Source inspection cannot establish whether production Caddy access logs are enabled or whether deployed API/web error-tracking configuration uses these scrubbers. Confirm deployment settings and log samples without exposing buyer data.
6. **Audit coverage completeness:** Source shows audit records in creation, phone/link changes, payment review/void, cancellation/expiry, and fulfillment code paths; verify each criterion against its concrete path and ensure buyer claim and photo/tracking actions are covered. Do not treat this source search as runtime proof.

## Verification boundary

This document records source evidence only. It does not certify deployed behavior, live Caddy or GlitchTip settings, database retention, or end-to-end tenant isolation. The checklist in issue #279 remains open until the open items above are resolved and required tests are run.
