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
6. **Audit coverage completeness:** Source shows audit records in creation, phone/link changes, payment review/void, cancellation/expiry, and fulfillment code paths; verify each criterion against its concrete path and ensure buyer claim and photo/tracking actions are covered. Do not treat this source search as runtime proof.

## Verification boundary

This document records source evidence only. It does not certify deployed behavior, live Caddy or GlitchTip settings, database retention, or end-to-end tenant isolation. The checklist in issue #279 remains open until the open items above are resolved and required tests are run.


## Issue #463: production redaction verification (2026-10-29)

### Deployment revision evidence

- GitHub Actions CD run [#935](https://github.com/bobadilla-tech/biasmarket.com/actions/runs/40946588942) completed successfully at 2026-10-29 20:20:59 UTC. It built/pushed the API, web, and worker images and its “Sync & deploy” job succeeded for revision `5e2eac4760ddce72868988e6194cb9428a9967f6`.
- The later CD run [#936](https://github.com/bobadilla-tech/biasmarket.com/actions/runs/40960679403) was skipped; it does not provide newer deployment evidence.
- The VPS `state/current_sha`, active Caddy config, and running container config could not be read: the only configured SSH route returned `Operation not permitted` under this execution environment. The workflow result is evidence of a successful deployment operation, not direct confirmation of the VPS state.

### Source and synthetic-token checks

- `infra/vps/Caddyfile` applies the same two path replacements in both the global logger (for reverse-proxy runtime errors) and `(redact_log)` (for API/web access logs): `/public/orders/<segment>` and `/pedido/<segment>` become `REDACTED`. Both logger layers delete `request>headers>Referer` before writing a log line. The blue/green active fragments contain only upstream selection, so they do not override those logger rules.
- API and web source initializes Sentry-compatible clients with scrub callbacks before sending errors and transactions. The web browser client also scrubs breadcrumbs. These clients are environment-gated; production DSN presence and live event delivery could not be inspected here.
- API review found the Sentry scrubber did not traverse nested event fields. It now recursively scrubs synthetic public-order token strings in request headers, exception data, and extra/context fields as well as the explicit URL, transaction, tag, trace, and span fields. This change is source-only until deployed.
- Synthetic-token unit checks passed: API `error-tracking.spec.ts` and `scrub-request-url.spec.ts` (2 files, 8 tests); web `scrub-sentry.test.ts` (1 file, 6 tests). The API event checks assert the token is absent from the serialized event, including a Referer and nested error context. No real buyer URL or token was used.
- No production access-log line or GlitchTip event was collected. Therefore redaction in production access logs and error-tracking payloads is not confirmed.

### Drift and remaining production check

- No mismatch was found between the checked-in Caddy logger rules and their source documentation/templates.
- Production application code is associated with the successful CD revision above, but the active Caddy config may have drifted: `docs/core/caddy.md` records that the Caddyfile is bind-mounted as a single file and an rsync inode replacement can leave the container reading the old file. The normal deploy job syncs `infra/vps/` and deploys but does not recreate Caddy. Without reading `/etc/caddy/Caddyfile` inside the running container, it is not possible to establish whether the redaction rules are loaded.
- The production VPS and error-tracking projects were not changed. Issue #463 remains open until an operator can read the running Caddy config and error-tracking settings, then inspect only synthetic-token log/event samples and record the sanitized result.
