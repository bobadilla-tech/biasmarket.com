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

**Review body (COMMENT):**

> The owner-scoped routes and token-gated photo read are present, and the
> focused API and order detail tests passed. The multipart upload contract is
> missing from the committed OpenAPI document.

### 345-1 · should fix · `apps/api/src/modules/orders/infrastructure/order.controller.ts:489`

> The generated operation has no `requestBody`, even though `PACKED_PHOTO_PIPE`
> requires a `file`. API docs and clients therefore cannot discover the upload
> contract. Please add an `@ApiBody` schema with the required binary `file`
> property, then regenerate `openapi.json`.

## #343: fix(api): rate-limit public orders by the visitor IP

**Review body (APPROVE):**

> The current proxy path forwards Caddy's parsed client IP, and the Sentry
> scrubber covers trace context data. Both existing CodeRabbit findings are
> addressed in this head. I found no additional correctness issue; hosted API
> and E2E checks pass.
