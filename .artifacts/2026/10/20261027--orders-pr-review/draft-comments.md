## #347: feat(orders): add assisted payment rules and voids (#260)

**Review body (REQUEST_CHANGES):**

> The payment summary and void flow hold up in the current head, and the
> existing CodeRabbit findings are addressed. The generated OpenAPI artifact
> still fails the hosted API lint check; please fix that before merge.

### 347-1 · should fix · `apps/api/openapi.json:1744`

> This generated response schema is not Prettier-formatted. The hosted API lint
> job reports `Prettier: 1 changed file(s) in apps/api/openapi.json` and fails
> on this file. Please format or regenerate the OpenAPI artifact, then rerun the
> API check.

## #345: feat(orders): add tracking details and private package photos (#267)

**Review body (REQUEST_CHANGES):**

> The owner-scoped routes and token-gated photo read are present, and the
> focused API and order detail tests passed. One live risk remains: Multer
> buffers the upload before the 5 MiB check. Please add a parser-level limit
> before merging.

### 345-1 · should fix · `apps/api/src/modules/orders/infrastructure/order.controller.ts:491`

> With no `limits.fileSize` passed to Multer, its default memory storage buffers
> the entire part before `PACKED_PHOTO_PIPE` can reject files over 5 MiB. A
> signed-in store owner can submit very large uploads to exhaust API memory. Set
> the interceptor limit to `MAX_UPLOAD_SIZE_BYTES` so Multer rejects oversized
> files while parsing.

## #343: fix(api): rate-limit public orders by the visitor IP

**Review body (REQUEST_CHANGES):**

> The Caddy client-IP forwarding and Sentry trace-data findings are addressed in
> this head, and the hosted API/E2E jobs pass. One test-only randomness warning
> leaves Codacy action required; please clear that check before merge.

### 343-1 · should fix · `apps/api/test/public-orders.e2e-spec.ts:29`

> `Math.random()` is only being used for a unique E2E email suffix, not a
> security token, but Codacy reports it as a new weak-randomness issue and this
> check allows zero new issues. Please use `randomUUID()` from `node:crypto` for
> the run suffix so the required Codacy check can pass.
