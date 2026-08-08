# Payment-proof / payment image access control

**Status:** Pre-implementation plan (written ahead of the work, per audit
follow-up request).

**Source:** `docs/audits/audit-2026-08-08.md` §7, §12 (critical finding #2), §13
(finding #1), §16 (#2, #7).

## Context

Uploaded payment-registration images (`OrderPayment.imageUrl`) are stored in
MinIO/S3 and served from a permanent, unsigned, public URL
(`${S3_PUBLIC_URL}/${bucket}/${key}`, built in
`apps/api/src/storage/storage.service.ts`). Anyone who obtains the URL — UUID
guess, log leakage, a shared screenshot, browser history sync — can view a
buyer's bank-transfer/Yape screenshot indefinitely, with no ownership check and
no audit trail on who viewed it. This is more sensitive than a product image
(which is _supposed_ to be public) and is currently protected by the same
"public bucket, unguessable key" model.

Separately, the schema has a `PaymentProof` model (buyer-uploaded proof,
`PENDING_REVIEW`/`APPROVED`/`REJECTED`) that is never written to anywhere in
`apps/api/src` — the actual flow is seller-recorded `OrderPayment` instead
(buyer pays via WhatsApp handoff, seller records what came in). This plan also
requires making a real decision on that dead model rather than leaving it
half-real.

## Problem 1 — authenticated image serving (do this first, it's the actual security fix)

Add an authenticated endpoint that streams or redirects to a short-lived signed
URL, gated the same way every other tenant-scoped resource in this codebase
already is: `AuthGuard` + `assertOwnership(storeId, userId)` on the order the
image belongs to. Reuse the existing ownership-check pattern from
`apps/api/src/modules/orders/infrastructure/order.repository.ts` — don't invent
a new authorization mechanism for this one endpoint.

**Presigned-URL feasibility, checked against the actual SDK setup (this changes
the whole approach, so verify before implementing):**
`@aws-sdk/s3-request-presigner` (the package that provides `getSignedUrl`, not
`@aws-sdk/client-s3` itself) **is already an installed dependency**
(`apps/api/package.json:37`, matching the pinned `client-s3` version) but is
currently **imported nowhere in `apps/api/src`** — so presigned GETs are
technically available without adding a new package, but there is no existing
usage to copy from.

There is one real gotcha that makes this non-trivial, not a drop-in
`getSignedUrl(client, command)` call against the existing `S3Client` in
`storage.service.ts`: in prod, `S3_ENDPOINT` is the **internal Docker network
hostname** `http://minio:9000` (`infra/docker/.env.example:54-56`), while the
publicly reachable host is `https://cdn.biasmarket.com`
(`infra/caddy/Caddyfile:11-13`, `docs/core/deploy.md` §4). `S3Client` bakes its
configured `endpoint` into the signed URL/signature (SigV4 signs the host), so
calling `getSignedUrl` against the existing client would produce a URL pointing
at `minio:9000` — unreachable from any buyer's or seller's browser. Making
presigned URLs work requires a **second `S3Client` instance constructed with
`endpoint: S3_PUBLIC_URL`** (or an equivalent per-call endpoint override) purely
for signing, separate from the client used for `Put`/`Delete`. That's a
manageable but real piece of implementation, not a one-line addition.

Given that added complexity and Caddy-proxy-signature risk (worth confirming in
a spike that a `cdn.biasmarket.com`-signed URL actually validates through the
reverse proxy before committing to this path — Caddy's default `reverse_proxy`
forwards the original `Host` header, which SigV4-signed requests are sensitive
to), **default recommendation: stream the image through the API**
(`res.send`/pipe the S3 `GetObjectCommand` body through the Nest response)
rather than redirect to a presigned URL. Streaming has no endpoint-mismatch
risk, keeps the ownership check as the only gate (no signed-URL-sharing side
channel once issued), and is simple to reason about at this traffic volume.
Revisit presigned redirects only if API bandwidth becomes a real cost — the
second-`S3Client` approach above is the correct shape if/when that happens.

Suggested shape: `GET stores/:storeId/orders/:orderId/payments/:paymentId/image`
→ look up the `OrderPayment`, confirm `order.storeId === storeId` and ownership,
then stream. Update the frontend
(`apps/web/features/orders/components/payment-proof-lightbox.tsx`, which renders
`<img src={url}>` directly from the `url` prop it's given, and
`payment-history-list.tsx`, which passes `payment.imageUrl` straight into both
its `onPreview` callback and a `next/image` `src` — both confirmed by reading
the components) to hit this endpoint instead of using `imageUrl` directly.

**Bucket-policy correction:** the plan's original framing ("decide whether the
bucket itself should be made non-public") undersells a real constraint —
`uploadPaymentImage` in `storage.service.ts` writes to `this.bucket`, the **same
`S3_BUCKET` used for product images** (`uploadImage` uses the same bucket, just
a different key prefix: `payments/` vs `products/`). MinIO's anonymous-read
policy (`mc anonymous set download`, applied in
`infra/docker/docker-compose.yml`'s `minio-init` service) is set **per bucket**,
so flipping it off would also break public product-image serving, which must
stay public. Making the bucket itself non-public is therefore **not viable as a
one-line policy flip** — it requires first splitting payment images into their
own bucket (mirroring how `S3_LOGO_BUCKET` is already split from `S3_BUCKET`
today), i.e. a new `S3_PAYMENT_BUCKET` env var, a new `mc mb`/policy line in
`minio-init`, and pointing `uploadPaymentImage` at it. Two real options, pick
one and document the choice here:

- **(a) New private bucket** (`S3_PAYMENT_BUCKET`, no anonymous-read policy
  applied in `minio-init`) — the new authenticated endpoint becomes the _only_
  possible way to read a payment image, old public URLs for already-uploaded
  images stop resolving (acceptable — those are the ones most likely to have
  already leaked). Closes the hole for real, more setup.
- **(b) Leave the shared bucket public, rely on the app never printing
  `imageUrl` again** — after the frontend change above, no UI surface links to
  the raw URL anymore, closing the main leak vectors (logs, screenshots, browser
  history) going forward. The object itself remains technically fetchable by
  anyone who already has or reconstructs the exact key (UUID-named, not
  enumerable — no bucket listing is granted — but not cryptographically
  inaccessible either). Zero infra change, weaker guarantee; document this
  residual risk explicitly if chosen.

**Recommendation: (a).** Given the severity finding below (Problem 1 is
genuinely internet-facing, not same-network), the marginal setup cost of a
second bucket is worth actually closing the hole rather than only closing the
app-level leak vectors.

## Severity Classification

**Problem 1 (unauthenticated payment-image access): HIGH.** Checked against
actual prod deployment, not assumed: `cdn.biasmarket.com` is a real,
publicly-DNS-resolved, Caddy-TLS-terminated domain (`docs/core/deploy.md` §4,
`infra/caddy/Caddyfile:11-13`) proxying MinIO's S3 API port directly — this is
genuinely internet-reachable, **not** an internal-network-only exposure that a
defense-in-depth argument could downgrade. `infra/docker/docker-compose.yml`'s
`minio-init` service applies `mc anonymous set download` to the bucket, so any
exact object URL returns the image to an unauthenticated request from anywhere.
Aggravating factors: the content is unusually sensitive (bank-transfer/Yape/Plin
screenshots, which can contain bank account numbers or personal payment-app QR
codes), access is permanent with no expiry or revocation, and there is no audit
trail of who viewed an image. Mitigating factors that keep this from being
"trivially mass-exploitable": keys are random UUIDs, not sequential or
guessable, and no bucket-listing permission is granted (`download`, not
`public`, policy), so this isn't a walk-the-bucket scenario — it requires an
attacker to already possess or reconstruct one exact URL, via ordinary leak
vectors this design already creates (server access logs, a shared screenshot,
browser history sync, a support chat). Net: real exposure of sensitive
financial-adjacent data to anyone who obtains one URL, which this plan's own
frontend audit confirms is rendered directly in two components today — matches
the audit's own "Critical" classification in §12 and §13, independently
confirmed here rather than taken on faith.

**Problem 2 (`PaymentProof` dead model): LOW.** Confirmed via
`grep -rn "paymentProof" apps/api/src` (case-sensitive Prisma client accessor) —
zero matches, the model is genuinely never read or written anywhere in the API.
This is pure schema-level dead code: no query executes against it, no endpoint
exposes it beyond the harmless `include: { proofs: true }` pass-through in
`order.repository.ts` (which Problem 2(a) would also remove). No security or
data-integrity exposure — the only cost is engineer confusion (the schema
implies a buyer-upload feature that doesn't exist), which is a real but
low-urgency maintainability issue, correctly scoped as "minor but real" rather
than a vulnerability.

## Problem 2 — decide `PaymentProof`'s fate

Two options, pick one:

- **(a) Delete the dead model** from `packages/db/prisma/schema.prisma` (the
  `PaymentProof` model, its enum `ProofStatus`, the `proofs` relation on
  `Order`, and the `reviewedProofs` relation on `User`), run a migration, and
  remove the now-pointless `include: { proofs: true }` in
  `order.repository.ts:29,35`. Simpler, matches what's actually shipped.
- **(b) Wire it up for real** as a genuine buyer-facing in-app upload — larger
  scope, and per the audit (§17) probably premature without evidence WhatsApp
  handoff is actual friction for real sellers.

**Default recommendation from the audit: pick (a) unless there's a product
reason to pick (b).** Whoever executes this should not silently pick (b) without
flagging it back — it's a scope-expanding decision, not a pure cleanup.

## Files likely touched

- `apps/api/src/storage/storage.service.ts` (new streaming-read method; if
  bucket-split option (a) is chosen, also a new `paymentBucket` field reading a
  new `S3_PAYMENT_BUCKET` env var, and `uploadPaymentImage` pointed at it
  instead of `this.bucket`)
- `apps/api/src/modules/orders/infrastructure/order.controller.ts` (new image
  endpoint — **note:** the orders-module-hardening plan also touches this file
  for unrelated changes; re-read before editing)
- `apps/web/features/orders/components/payment-proof-lightbox.tsx`,
  `payment-history-list.tsx`
- `packages/db/prisma/schema.prisma` + new migration (Problem 2, if (a))
- `apps/api/src/modules/orders/infrastructure/order.repository.ts` (Problem 2
  cleanup)
- If bucket-split option (a) is chosen for Problem 1:
  `infra/docker/docker-compose.yml`'s `minio-init` service (new `mc mb` + no
  anonymous-read line for the payment bucket), `infra/docker/.env.example` (new
  `S3_PAYMENT_BUCKET` var, documented the same way `S3_LOGO_BUCKET` is), and
  `scripts/init-env.ts` if it enumerates bucket vars explicitly.

## Verification

- `pnpm --filter api test` + relevant e2e for orders/payments.
- Manually confirm: fetching the old raw bucket URL for a _new_ upload no longer
  works (if bucket-split option (a) was taken) or that the frontend no longer
  references it either way (option (b)); fetching the new authenticated endpoint
  as the owning seller works; fetching it as a different seller 403s; fetching
  it unauthenticated 401s.
- If streaming through the API (the default recommendation above): confirm the
  response sets the correct `Content-Type` for the stored image and that
  large-ish images (near the existing 5MB cap) don't time out or buffer the
  whole file into memory unnecessarily.
- `pnpm db:generate` after any schema change; `pnpm typecheck` across api/web.

## Definition of done

No payment-proof/payment image is reachable without an ownership check;
`PaymentProof`'s fate is decided and the schema/code reflect that decision
consistently (no half-wired dead model left behind).
