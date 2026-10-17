# Plan: Epic #254, the buyer sees and pays an assisted order without an account

Status: ready WITH CAVEATS (v6). Five review rounds were run; the "two
consecutive clean rounds" bar was NOT met: round 5 still found one important
item (a wrong premise about busboy error mapping, fixed and verified against the
installed Nest) plus wording fixes, all applied. Findings have shrunk from 8
blocking (round 1) to 0 blocking (rounds 4 and 5), and the remaining uncertainty
is listed in review-log.md "Residual uncertainty". The final readiness review
(round 5) found no blocking gaps.

Date: 2026-10-28. Planned against `origin/main` @ `1aef25f6` (merge of #364).
Re-check `git log origin/main` before starting.

Written for: the implementation session (a fresh agent), not the user.

Legend: "Fact" = verified in the repo this session. "Assumption" = not verified,
repeated in section 10 with a default. PRs are PR0..PR5 (one shared first PR,
then two chains, section 5). "D-xx" are decisions in the GitHub wiki page
"Pedido asistido - Decisiones y ajustes", which is not in the public wiki clone
(Q1). Finding ids "Lnn" point to review-log.md.

## 1. Context and outcome

Epic #254 outcome: the buyer opens the link, understands what they bought and
how to pay, and the payment ends up registered by either path (buyer uploads the
proof, or the store registers it). The payment status comes only from validated
payments; there is never "paid" without recorded money.

### What already shipped (the issue checkboxes are stale)

| Issue          | Real state on main                                                                                                                                                                                                                                                                                                                         | What is left                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #262 C1 API    | DONE. `GET /public/orders/:token`: hash lookup, identical 404, allow-list DTO, masked phone, first-open stamp + `LINK_OPENED`, 30/min throttle, `no-store`, `no-referrer`, token scrubbed from logs (`common/scrub-request-url.ts`). Tests exist for allow-list keys, invalid-vs-revoked 404, `LINK_OPENED` once, throttle, headers on 404 | Only DTO fields that C3/C4 need (PR2). Close with PR2.                                                                                                       |
| #268 C2 page   | DONE, closed (#364)                                                                                                                                                                                                                                                                                                                        | none                                                                                                                                                         |
| #267 B5        | DONE, closed                                                                                                                                                                                                                                                                                                                               | none                                                                                                                                                         |
| #260 A4        | MOSTLY DONE: columns + migration `20261027230000_add_order_payment_operation_and_void_fields`; `countsTowardPaid` excludes voided; `VoidOrderPaymentUseCase`, `PATCH .../void`, `PAYMENT_VOIDED`, `payment.voided` audit; `OrderPaymentsService.findDuplicateOperationCode`; `addPayment` uses `computePaymentSummary` (D-15 satisfied)    | `findDuplicateOperationCode` has no caller; `operationCode` never written; weak normalizer; no overshoot guard (L4). Close with PR4.                         |
| #269 C3 upload | MISSING (PR0 also hardens the live upload routes with Multer limits): no `POST /public/orders/:token/payments`. Session-based upload exists (`customer-order-payments.controller.ts`)                                                                                                                                                      | PR1 (refactor), PR2 (API), PR3 (web).                                                                                                                        |
| #266 B4 seller | API PARTIAL (stores `paidAt = now`, `recordedBy`; void works). UI MISSING except source badge and approve/reject                                                                                                                                                                                                                           | PR4 (API), PR5 (UI).                                                                                                                                         |
| #270 C4 states | PARTIAL: banners for most states, payments list with origin/amount/date/status/voided, tracking + packed photo, focus refetch                                                                                                                                                                                                              | IN_TRANSIT banner; distinct "expired" copy; cancel/expiry reason + who to write to; `paymentRejectionReason` missing from the public DTO (PR2 API, PR3 web). |

### Facts that shape the design

- Access tokens exist only on assisted orders (`create-order.usecase.ts` never
  sets `accessTokenHash`). `requireOrderForToken`
  (`order-events.service.ts:157`) returns the same
  `NotFoundException('Pedido no encontrado')` for unknown and revoked tokens.
  `loadForClaim` (same file, ~:178) is the pattern for a use-case-specific
  select.
- Expiry (`expire-orders.usecase.ts:28-95`): `Order.expire()` calls `cancel()`,
  so expired orders end with `status = CANCELLED` **and**
  `paymentStatus =
  CANCELLED`, `cancellationReason` stays null, and
  `ORDER_CANCELLED` is recorded with `actor: 'SYSTEM'`. Seller cancel
  (`cancel-order.usecase.ts:105,165`) records the same event with
  `actor: 'SELLER'` and a nullable reason. These are the only two producers of
  `ORDER_CANCELLED` (grep, planner). The actor is the only way to tell "expired"
  from "cancelled by the store" (L-F1).
- `RESERVED_HOLD_STATUSES = PENDING_PAYMENT | PARTIALLY_PAID | PAYMENT_SUBMITTED`
  (`domain/hold-statuses.ts`); `OrderStatus = ACTIVE | CANCELLED`.
- Upload validation: `UploadedFileValidationPipe` detects the type from magic
  bytes and caps at 5 MB **after** Multer buffered the file. Only
  `order.controller.ts:531` (packed photo) passes `limits.fileSize`; the session
  upload (`customer-order-payments.controller.ts:84`), seller `addPayment`
  (`order.controller.ts:591`) and checkout (`checkout.controller.ts:195`) use a
  bare `FileInterceptor('file')` (L7).
- `IMAGE_UPLOAD_MIME_TYPES = jpeg|png`; `PROOF_UPLOAD_MIME_TYPES` adds PDF and
  is used only by checkout. Session upload, seller `addPayment` and the shared
  web schema are JPEG/PNG only.
- The per-proof reject reason is only in `AuditLog.metadata.reason`
  (`order.controller.ts`, `reviewPaymentProof`); `paymentRejectionReason` is
  order-level (`review-payment.usecase.ts:99`).
- `reviewPaymentProof` (`order.controller.ts:828-968`) never checks that an
  approved proof fits the remaining balance, and returns early once the order is
  VERIFIED (no event). Seller `addPayment` checks only
  `computePaymentSummary.pendingAmount`, ignoring pending buyer proofs (L4).
- `apps/mobile` on main does not call the session payments endpoints and does
  not import `buildRegisterPaymentSchema` (grep, planner); only web does (L-F2).
  Old mobile PRs #232-#237 are open but stale. The session contract still stays
  unchanged: web's customer-auth session upload uses it.
- Web multipart is a documented raw `fetch`/`FormData` carve-out
  (`apps/web/AGENTS.md`; `features/customer-auth/api/order-payments.api.ts`).
  `packages/types/orval.config.ts` uses `filters.mode: "include"` with an
  explicit tag list that contains the tag of
  `public-order-events.controller.ts`.
- **No code moves `paymentStatus` to `PAYMENT_SUBMITTED` when a buyer uploads a
  proof** (session controller only inserts the row + event; grep, planner). The
  web banner (`features/public-order/lib/order-state.ts` `getBannerKey`) and
  `shouldShowHowToPay` key off `paymentStatus` alone, and `shouldShowHowToPay`
  is false for `PAYMENT_SUBMITTED`. So "comprobante en revisión" must be derived
  from `payments[]` (a `PENDING_REVIEW`, non-voided proof), not from
  `paymentStatus` (R2-1). The state machine is not changed.
- The session route accepts proofs on a `VERIFIED` order with a residual balance
  (`pendingAmount > 0`); seller `addPayment` does too. The shared service keeps
  that rule (R2-3).
- `apps/api/src/metadata.ts` IS tracked in git (`git ls-files` returns it; it is
  not ignored), so it is regenerated and committed with `openapi.json` and
  `packages/types/generated/**` (a reviewer claimed otherwise; verified false).
- `ApiError` (`packages/types/http.ts:40`) carries only `message` and `status`,
  not the response body. The seller multipart caller is
  `apps/web/features/orders/api/orders.api.ts` (FormData at :50 and :96).
- E2E specs set `trust proxy` and use a per-request `X-Forwarded-For` helper
  (`test/orders.e2e-spec.ts:73-76,209`, `nextCheckoutIp()`); copy it.
- Probe 1 (planner, run):
  `cd apps/api && pnpm exec vitest run src/modules/orders` -> 25 files, 296
  tests passed, 2.3 s. The fast loop for every API PR.
- CI: `.github/workflows/ci.yml` runs `pull_request` only for base `main`;
  `workflow_dispatch` has a `run_e2e` input.

## 2. Current behavior (code map)

- Public controller
  `apps/api/src/modules/orders/infrastructure/public-order-events.controller.ts`
  (155 lines): `GET :token` :49, `GET :token/packed-photo` :62, `POST events`
  :78, `POST receipt` :99, `POST claim-ticket` :124; all `@Public()` +
  `ThrottlerGuard`.
- Public DTO: `application/public-order.service.ts:54-210`, class
  `dto/public-order-response.dto.ts`. Payments projected as
  `{source, amount, createdAt, reviewStatus, voidedAt}` (:202-208); the select
  (:71-80) has no `id`/`imageUrl`.
- Session upload `customer-order-payments.controller.ts:62-244`: order checks
  :102-130, amount vs `pending - reserved(PENDING_REVIEW)` :132-149, upload :153
  (**before** the transaction), `FOR UPDATE` + balance recheck :168-199 (does
  not recheck order status), row :201-213, `PAYMENT_SUBMITTED` event :214,
  `PAYMENT_PROOF_SUBMITTED` notification via `createIfNotOpen` :229. Its spec
  `customer-order-payments.controller.spec.ts` builds a TestingModule with
  `OrderRepository`, `PrismaService`, `StorageService`, `NotificationsService`,
  `OrderEventsService`.
- Session image stream :246-283 (`CORP: cross-origin`).
- Seller `addPayment` `order.controller.ts:589-817`: amount/method/note/optional
  file; transaction wrapped in
  `catch (e) { throw new BadRequestException(...) }` (:802-804), which would
  swallow a 409.
- Seller void `application/void-order-payment.usecase.ts` (only while
  fulfillment is `ORDERING`; refuses CANCELLED/REJECTED/VERIFIED; only payments
  that count).
- Duplicate lookup `application/order-payments.service.ts:6-33` (strip
  whitespace + uppercase; returns an id; raw SQL by store; expression cannot use
  the `[storeId, operationCode]` index, it only narrows by store).
- Web buyer page
  `apps/web/app/[locale]/(storefront)/store/[slug]/pedido/[token]/page.tsx`,
  `apps/web/features/public-order/**` (`lib/order-state.ts:60-71`
  `shouldShowHowToPay` is true for PENDING_PAYMENT, REJECTED, PARTIALLY_PAID
  with balance). i18n: `packages/i18n/{es,en}/storefront.json` -> `publicOrder`
  (104 keys per locale).
- Web seller: `features/orders/components/register-payment-form.tsx`,
  `payment-history-list.tsx`, `payment-proof-lightbox.tsx`; i18n top-level
  `orders` object in `packages/i18n/{es,en}/dashboard.json`.

### Consumers of the code this plan changes (grep, planner and reviewer)

- `PublicOrderResponseDto` / `PublicOrderPaymentResponseDto`: API
  `public-order.service.ts`, `public-order-events.controller.ts`, `metadata.ts`;
  web `features/public-order/**` (`public-order-view.tsx`, `how-to-pay.tsx`,
  `timeline.tsx`, `shipping-details.tsx`, `receipt.ts`, `invite-rules.ts`,
  `use-save-invite.ts`, `receipt-confirmation.tsx` and their tests). Adding
  fields can break test fixtures: PR3 updates every fixture builder.
- `getBannerKey`, `shouldShowHowToPay`, `isCancelled` (`lib/order-state.ts`):
  the same web files and tests.
- Register-payment flow (PR5), importing `RegisterPaymentInput` /
  `buildRegisterPaymentSchema`: `features/orders/index.ts`,
  `register-payment-form.tsx`, `order-detail-sheet.tsx`,
  `use-register-payment.ts` (+ test), `api/orders.api.ts`, and customer-auth
  (type only: `use-submit-payment-proof.ts`, `order-payments.api.ts`,
  `account-order-detail.tsx`). Wiring only through the `onRegisterPayment` prop
  (no import): `orders-page-client.tsx`, `payments-page-client.tsx`,
  `assisted-order-section.test.tsx`; plus `payment-method-labels.ts`.
- `findDuplicateOperationCode`: no callers outside `order-payments.service.ts`
  and its spec (PR4 adds the first one).
- `apps/mobile`: no references to these endpoints or schemas on main.
  `apps/workers`: not affected (no queue, job or schema change).

## 3. Design and non-goals

### Design

1. **Buyer proof upload by token**: new `POST /public/orders/:token/payments`
   plus `GET /public/orders/:token/payments/:paymentId/image`. Both controllers
   (session, token) call one `BuyerPaymentProofService`, extracted first with no
   behavior change (PR1), then hardened (PR2).
2. **Public DTO completeness**: `payments[].id`, `hasProof`, `method`, `paidAt`;
   `paymentRejectionReason`; `closure`; `expiresAt`.
3. **Seller payment rules**: `operationCode`, `paidAt`, duplicate 409 +
   `confirmDuplicate`, capture required unless CASH, `pending - reserved` limit,
   approve-overshoot guard (PR4); matching UI and void button (PR5).

### Non-goals

- No Prisma migration. No unique index on operation code. No normalized-code
  column (follow-up if a store passes ~50k payments, R6).
- No change to the observable contract of the session endpoint, except these
  documented fixes, which reach it through the shared service: Multer limits, a
  500-character `note` check (PR0; PR2 does not re-add it); in-lock state
  recheck, `computePaymentSummary` + `voidedAt` filter, strict amount parsing,
  `expiresAt` check, cap of 5 pending proofs, and `operationCode` validation and
  `note` sanitization (PR2). They reject only inputs that were invalid, racy or
  abusive. Before PR2, grep the session spec and the web customer-auth client
  (`features/customer-auth/api/order-payments.api.ts`) for the amount formats
  they send (for example `"100."` or `"1,5"`) and make the regex agree with real
  clients; report any mismatch instead of loosening the server silently.
- No PDF (Q2: a visible deviation from #269's "JPEG/PNG/PDF", surfaced to the
  user), no signed URLs, no new bucket, no token-keyed or hourly throttles, no
  Caddy/Sentry/CORS hardening (user deferred hardening on 2026-10-28), no DDD
  layering.
- No buyer-visible `operationCode`, `recordedBy`, `voidReason`, notes, image URL
  of seller captures.
- No duplicate flag on buyer proofs (follow-up), no method-configured server
  rule (parity with the session route), no 30-day `paidAt` lower bound.
- No migration for a per-proof rejection reason: the buyer sees only the
  order-level `paymentRejectionReason` (follow-up ticket).
- No retrofit of `stats.service.ts` (a Prisma `where`, cannot call the
  predicate); an equivalence test pins it.

## 4. Files and components

### 4.0 PR0: shared upload limits and text helpers (Refs #269, Refs #266)

Base: `main`. Both chains depend on it (R3-1), so it is first and small.

- `apps/api/src/common/upload-limits.ts` (**new**; imports
  `MAX_UPLOAD_SIZE_BYTES` from `common/uploaded-file-validation.pipe.ts`):
  `PAYMENT_PROOF_UPLOAD_LIMITS = { fileSize: MAX_UPLOAD_SIZE_BYTES + 1, files: 1,
  fields: 8, fieldSize: 4096, parts: 10 }`
  (`fieldSize` is bytes: 4096 holds a 500-character note of 4-byte characters
  (2000 bytes) with ample headroom; today neither route caps `note` at all, so
  an older client could send more; `fields: 8`/`parts: 10` leave headroom over
  the six text fields the seller route will carry after PR4:
  `amount, method, note, operationCode,
  paidAt, confirmDuplicate`).
- Apply it (`FileInterceptor('file', { limits: PAYMENT_PROOF_UPLOAD_LIMITS })`)
  to the **existing** session route (`customer-order-payments.controller.ts:84`)
  and seller `addPayment` (`order.controller.ts:591`). This is the main behavior
  change in PR0 (a request that previously buffered an arbitrarily large file is
  now cut off by Multer: 413 for the file, 400 for other limits). PR0 also adds
  a controlled `note` check to both handlers (more than 500 code points,
  `Array.from(note).length > 500`, the same unit as `sanitizeDisplayText` -> 400
  "La nota no puede superar 500 caracteres"; the web `note` is an uncapped
  `z.string()`, so mention in the PR description that this message reaches users
  raw) so the failure is a clean Spanish message and not a Multer error. The
  token route (PR2) uses the same constant. Checkout gets a follow-up ticket.
  Tests: a 6 MB upload gets 413 and too many fields / an oversized field get 400
  on both routes (assert the real mapping Nest gives; only `LIMIT_FILE_SIZE`
  maps to 413 by default); a normal request still passes.
- Multipart error mapping: the installed `@nestjs/platform-express` 11.2.7
  `transformException` (`multer/multer/multer.utils.js`, verified by the
  planner) already maps Multer limit errors (413 for `LIMIT_FILE_SIZE`, 400 for
  the rest) and the busboy errors (boundary not found, malformed part header,
  unexpected end of form/file -> 400). No new interceptor. PR0 first writes the
  tests (truncated body, malformed part header, wrong field name, 5 MB + 1 byte
  -> the pipe's 400 not 413, 6 MB -> 413) against current behavior and adds
  handling (a route-level exception filter, or an interceptor listed _before_
  `FileInterceptor` with `catchError`; an inner interceptor never sees Multer's
  error) only for a case that actually returns 500.
- PR0 tests that exercise Multer limits need an HTTP layer: use a Nest testing
  module with `app.init()` and supertest, as
  `public-order-events.controller.spec.ts` does (a direct `controller.submit()`
  call never runs the interceptor); the MinIO e2e pattern is not required.
- `apps/api/src/common/text-sanitize.ts` (**new**) with specs, one test per
  character class:
  - `normalizeOperationCode(s)` = NFKC, strip every non-`[A-Za-z0-9]`,
    uppercase. **Empty result is invalid**: write paths answer 400 ("Código de
    operación inválido") and the duplicate lookup is skipped (an empty code
    would match every symbol-only stored code).
  - `hasForbiddenChars(s)` = `/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u`, used **only** for
    `operationCode` (raw input, before normalization).
  - `sanitizeDisplayText(s, max = 500)` for seller free text shown to buyers
    (`cancellationReason`, `paymentRejectionReason`, review `reason` in the
    audit log) and buyer `note`: first `s.slice(0, max * 4)` (bounds the work on
    oversized legacy values), NFC (not NFKC, so "½", "²", "…" survive), replace
    runs of `[\s\p{Zl}\p{Zp}]` with a single space (newlines and tabs become
    spaces), then strip `\p{Cc}` plus only the dangerous format characters: bidi
    U+202A-202E, U+2066-2069, U+200E/U+200F, U+061C, plus U+200B, U+2060,
    U+FEFF, U+00AD and the tag block U+E0000-E007F. U+200D (ZWJ) is kept so
    emoji sequences survive. Truncate by code points
    (`Array.from(s).slice(0, max)`), strip a trailing U+200D left by the cut,
    trim, `null` when empty. Documented loss: subdivision-flag emoji (they use
    tag characters).
  - `normalizeText(s)` = NFC + trim (display text only).
  - `normalizeOperationCodeForStorage(s)` = NFKC + trim: the **only** function
    used when persisting an `operationCode` (PR2 and PR4), so a fullwidth
    "ＡＢＣ１" is stored as ASCII "ABC1" and matches the ASCII-only SQL
    comparison. Test: a row stored from a fullwidth input is found by an ASCII
    lookup and vice versa.

Done when: both route specs have the limit tests, `text-sanitize.spec.ts` covers
the cases above (including "Sin stock\nContacta" -> "Sin stock Contacta", a ZWJ
family emoji kept, a bidi override stripped, "ÁÉ" and "---" as invalid codes),
and the hosted CI run for PR0 is green.

### 4.1 PR1: refactor, extract `BuyerPaymentProofService` (Refs #269)

Zero behavior change. Add `application/buyer-payment-proof.service.ts` (+ spec)
holding everything between "order resolved" and "row created" that
`customer-order-payments.controller.ts` does today (state checks,
reserved-balance check, upload, `FOR UPDATE` transaction, `PAYMENT_SUBMITTED`
event, `PAYMENT_PROOF_SUBMITTED` notification). The service takes
`{ orderId, storeId, file, amount, method, note, operationCode? }` plus a typed
`BuyerProofOrder` =
`{ id, storeId, status, paymentStatus, fulfillmentStatus,
requiredAmount, currency, pendingAmount, payments: { amount, source,
reviewStatus, voidedAt }[] }`.
In PR1 `pendingAmount` is passed through exactly as `findOrderForBuyer` returns
it today and the pre-check keeps its current `reviewStatus === 'PENDING_REVIEW'`
filter (no `voidedAt` check, no expiry rule, no `computePaymentSummary` switch):
those are PR2's documented fixes. The session controller maps
`findOrderForBuyer`'s result to it and PR2's guard maps `loadForProof`'s result
to it; the service never trusts the passed balance inside the lock (it
re-reads). The session controller keeps authorization (`findOrderForBuyer`) and
delegates. `customer-order-payments.controller.spec.ts`: only the providers list
changes; it keeps the **real** `BuyerPaymentProofService` as a provider
(stubbing it would break the `events.record` and notification assertions); every
assertion and expected message is untouched. Register the service in
`orders.module.ts`.

Done when: the existing session controller spec passes with unchanged
assertions, the e2e `test/buyer-proof-submit-race.e2e-spec.ts` passes untouched,
and `git diff` shows no change in any DTO/OpenAPI/generated file.

### 4.2 PR2: token API, hardening, DTO fields (Refs #269, Closes #262)

Base: PR1. Add:

- `PublicOrderTokenGuard` (new, in `infrastructure/`): after `ThrottlerGuard`
  and before the interceptor, resolves the token via
  `OrderEventsService.loadForProof(token)` (new select modeled on
  `loadForClaim`:
  `id, storeId, status, paymentStatus, fulfillmentStatus,
  requiredAmount, currency, expiresAt, accessTokenRevokedAt` +
  payments for the balance) and attaches it to the request. Unknown/revoked ->
  the identical `NotFoundException('Pedido no encontrado')` before any multipart
  is parsed (L10, L11). Balance comes from `computePaymentSummary`, never a
  stored field. For `POST` requests only (the image `GET` has no body), it then
  checks that the `content-type` header starts with `multipart/form-data` and
  throws `415` (after the 404, so unknown tokens never see a different answer;
  no in-repo `req.is` pattern exists, use the header check; unit-test a missing
  and a malformed header and an e2e that the image `GET` returns 200). The
  loaded order is exposed through a `@PublicOrder()` param decorator backed by a
  Symbol-keyed property on the request (a single exported
  `Symbol.for('biasmarket.publicOrder')` constant) (the repo has no Express type
  augmentation; do not add one), never passed to Sentry context and is used for
  pre-checks only: the service recomputes everything inside the lock because the
  guard's copy is stale by then (R2-9). The guard does the same single hash
  lookup as `GET :token` (no new timing signal).
- Routes in the **existing** `public-order-events.controller.ts` (shares the
  Orval tag, L24):
  - `POST :token/payments`: `@Public()`,
    `@UseGuards(ThrottlerGuard,
    PublicOrderTokenGuard)`,
    `@Throttle({ default: { ttl: 60_000, limit: 10 } })`,
    `@UseInterceptors(FileInterceptor('file', { limits: PAYMENT_PROOF_UPLOAD_LIMITS }))`,
    `@ApiConsumes('multipart/form-data')`, `@ApiBody`,
    `@ApiParam({ name: 'token' })`, `UploadedFileValidationPipe` with
    `IMAGE_UPLOAD_MIME_TYPES`. Requires a `multipart/form-data` content type.
    `Cache-Control: no-store`, `Referrer-Policy: no-referrer`. No
    `CustomerSessionGuard`.
  - `GET :token/payments/:paymentId/image`: guard + 30/min throttle. One
    compound query
    `findFirst({ where: { id: paymentId, orderId: <token order>, source:
    'BUYER_SUBMITTED', imageUrl: { not: null } } })`
    (voided/rejected proofs stay viewable: it is the buyer's own upload). Every
    miss returns the same `NotFoundException('Comprobante no encontrado')`.
    Streams through `StorageService.getPaymentImageStream`; content type forced
    from an allow-list (`image/jpeg|image/png`, otherwise 404), headers
    `Cross-Origin-Resource-Policy: cross-origin`,
    `X-Content-Type-Options:
    nosniff`,
    `Content-Disposition: inline; filename="comprobante.<ext>"`,
    `Content-Security-Policy: default-src 'none'; sandbox`,
    `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`.
- `PAYMENT_PROOF_UPLOAD_LIMITS` and `common/text-sanitize.ts` come from PR0. the
  token route reuses PR0's multipart tests (malformed part header, truncated
  body, wrong field name -> 400). `LIMIT_FILE_SIZE` stays 413.
- `dto/submit-public-payment.dto.ts` for OpenAPI.

Service hardening (applies to both routes, documented as fixes, L3, L14, L15,
L19, L33):

1. Pre-checks before any upload: state, expiry, amount, cap. Balance and
   reserved proofs now come from `computePaymentSummary` and a
   `voidedAt == null` filter (PR1 kept the legacy computation). State rule (same
   as the session route today): reject CANCELLED, REJECTED, shipped
   (IN_TRANSIT/READY/COMPLETED), and VERIFIED only when nothing is pending
   (`pendingAmount <= 0`); a VERIFIED order with a residual balance keeps
   accepting proofs.
2. Amount: must be a `string` matching `/^\d{1,9}(\.\d{1,2})?$/`, cents >= 1;
   the Decimal is built from the string. The event payload keeps `amount` as a
   **number** (as today) so seller and buyer events and the notification text
   stay consistent. Non-string `method`/`note`/`operationCode` -> 400. `note`
   validate the raw length first (`Array.from(note).length > 500` -> 400, never
   truncate silently), then store `sanitizeDisplayText(note)` (NFC; newlines
   become spaces: a visible change for sellers, call it out in the PR) and never
   reject for characters; `operationCode`: `hasForbiddenChars` -> 400, then
   `normalizeOperationCodeForStorage`, max 64, blank -> null,
   `normalizeOperationCode` empty -> 400.
3. Expiry: reject when `status = ACTIVE`, `paymentStatus` is in
   `RESERVED_HOLD_STATUSES` and `expiresAt < now` ("El pedido venció").
4. Cap: at most 5 `PENDING_REVIEW` buyer proofs per order, counted under the
   lock.
5. Inside the locked transaction: re-read `status`, `paymentStatus`,
   `fulfillmentStatus`, `requiredAmount`, `expiresAt` and re-run the
   state/expiry checks, then the balance + cap check, then create the row
   (`BUYER_SUBMITTED`, `PENDING_REVIEW`, `paidAt null`, `operationCode`), the
   event, the notification.
6. If the transaction throws after the upload, best-effort `deleteImage` of the
   uploaded object (log without the URL).
7. Event payload keys exactly `paymentId, amount, method`; actor constant
   `BUYER`; audit/log never contain `operationCode`, `note`,
   `file.originalname`, IP or user agent.

Divergences from the session route (documented in the service spec): token route
throttle 10/min (session 20/min). Everything else is identical because both go
through the service.

Public DTO (`public-order.service.ts`, `public-order-response.dto.ts`; regen
OpenAPI/Orval):

- `payments[]`: add `id`, `hasProof` (strictly boolean; true only for
  `BUYER_SUBMITTED` with an `imageUrl`; never the URL), `method`, `paidAt` (ISO
  or null). Select adds `id`, `method`, `paidAt`, `imageUrl` (server side only).
  Every new field is declared with `@ApiProperty` on the DTO classes
  (`PublicOrderPaymentResponseDto`, `dto/public-order-response.dto.ts:41`;
  `closure` as its own nested class with a nullable enum; nullable
  `method`/`paidAt`/`expiresAt`), otherwise Orval drops them and the web build
  breaks.
- `paymentRejectionReason: string | null` only when `paymentStatus = REJECTED`,
  via `sanitizeDisplayText` (output side; a write-side cap is a follow-up).
- `closure: null | { kind: 'CANCELLED' | 'EXPIRED'; reason: string | null }`
  when `status` or `paymentStatus` is CANCELLED: `EXPIRED` iff the **last**
  `ORDER_CANCELLED` event (`listForBuyer` is ascending: take `.at(-1)` of that
  type) has `actor = SYSTEM` (add `actor` to its select or a
  `findLatestCancellation(orderId)`; update the mocks in
  `public-order.service.spec.ts` and extend its allow-list test at ~:164);
  otherwise `CANCELLED`; `reason` = `sanitizeDisplayText(cancellationReason)`.
  No event (legacy) -> `CANCELLED`.
- `expiresAt: string | null`, non-null only when `status = ACTIVE` and
  `paymentStatus` is in `RESERVED_HOLD_STATUSES`.

#262 verification items PR2 must cite: a grep showing no unauthenticated
endpoint looks orders up by phone or alias
(`grep -rn "customerPhone\|customerName"
apps/api/src/modules --include='*.controller.ts'`,
then read the hits); the existing throttle and timing-parity tests green; a test
that `/public/orders/T/payments` and `.../payments/<id>/image` (upper-case
prefix too) are scrubbed by `scrubRequestUrl` and `scrubSentryEvent`; the Sentry
init (`apps/api/src/common/error-tracking.ts`, which does not set
`sendDefaultPii`, default false) does not enable PII or request-body capture,
and the PR cites that file; `Cross-Origin-Resource-Policy: cross-origin` on the
image response (helmet defaults to `same-origin`) has a test. Do not add custom
request headers (for example `X-Requested-With`) in the browser upload: it would
force a CORS preflight that `allowedHeaders` rejects.

Docs: short section in `docs/core/security-payments.md` for the token upload
route (limits, caps, headers, guard order).

### 4.3 PR3: buyer web, upload and states (Closes #269, Closes #270)

Base: PR2. Under `apps/web/features/public-order/`:

- `schemas/submit-proof.schema.ts` (zod; amount regex as the server; file
  JPEG/PNG <= 5 MB via `@biasmarket/validation` helpers; optional operation code
  <= 64).
- `api/submit-proof.ts`: **documented raw `fetch`/`FormData` carve-out** (add it
  to the call-site list in `apps/web/AGENTS.md`). Uses `publicApiBase()` from
  `lib/shipping-links.ts` (`NEXT_PUBLIC_API_URL ?? INTERNAL_API_URL ?? ""`; an
  empty string means a same-origin relative URL; the test asserts exactly this),
  `credentials: "omit"`, and throws `ApiError` from `@biasmarket/types` so
  `classifyPublicOrderError` keeps classifying 404/429 (L5).
- `mutations/use-submit-public-proof.ts` (name avoids the customer-auth hook);
  invalidates `publicOrderKeys.detail(token)` like `use-confirm-receipt.ts`.
- `lib/order-state.ts` (R2-1, R2-3):
  - `getBannerKey` input type grows to
    `Pick<PublicOrderResponseDto, "status" |
    "paymentStatus" | "fulfillmentStatus" | "pendingAmount" | "payments" |
    "closure">`
    (update every caller and test fixture). Branch order: cancelled
    (`closure.kind = EXPIRED` -> `expired`, else `cancelled`), `completed`,
    `ready`, `inTransit` (fulfillment IN_TRANSIT, new), then the payment-based
    keys (`rejected`, `paymentSubmitted` when `hasPendingProof` for
    PENDING_PAYMENT/PARTIALLY_PAID, `partiallyPaid`, `verified`, default
    `pendingPayment`).
  - `hasPendingProof(order)` = some `payments[]` entry with
    `reviewStatus =
    PENDING_REVIEW` and `voidedAt` null, on an order that is
    not `isCancelled`. "Closed" (for the "Sin revisar (pedido cerrado)" label) =
    `isCancelled` or `paymentStatus = REJECTED`. `getBannerKey` returns
    `paymentSubmitted` for PENDING_PAYMENT and PARTIALLY_PAID when
    `hasPendingProof` (the API never sets `paymentStatus = PAYMENT_SUBMITTED` on
    upload). There is no `order-state.test.ts` today (banner behavior is only
    covered through `public-order-page.test.tsx`): create
    `lib/order-state.test.ts` for `getBannerKey`, `hasPendingProof`,
    `canSubmitProof`, and extend the page test.
  - `reservedPendingAmount(order)` = sum of pending proofs, in cents.
  - `canSubmitProof(order)` = `status = ACTIVE`, `paymentStatus` in
    PENDING_PAYMENT | PARTIALLY_PAID | PAYMENT_SUBMITTED |
    VERIFIED-with-balance, fulfillment ORDERING (the exact complement of the
    server's IN_TRANSIT/READY/COMPLETED reject list, since `FulfillmentStatus`
    has four values: leave a comment so the two stay in sync), `expiresAt` not
    past, and `pending - reservedPending
    > 0`(cents), and fewer than 5 pending proofs (server cap): with 5 pending the
    section shows "Espera la revisión de tu tienda" instead of the form.`REJECTED`
    > -> no form, instructions stay, contact-the-store button (L6).
  - A VERIFIED order with a residual balance and a pending proof keeps the
    `verified` banner (the `paymentSubmitted` banner only replaces
    PENDING_PAYMENT and PARTIALLY_PAID); the upload section carries its own "en
    revisión" line for the pending proof, so banner and form do not contradict.
  - A 400 "El pedido venció" from the server triggers a refetch (the browser
    clock may be skewed against `expiresAt`).
  - `shouldShowHowToPay` is unchanged for the instructions block, but the upload
    section is mounted by its own `ProofUploadSection` in
    `public-order-view.tsx` using `canSubmitProof` (not inside
    `how-to-pay.tsx`), so the form stays reachable while a proof is pending and
    a balance remains.
- `components/proof-upload-form.tsx` (+ test): amount prefilled, method select
  from `order.paymentMethods`, optional operation code, file picker with
  preview, inline errors, 413/400/404/429 mapping, success state, "Ya pagué"
  WhatsApp button stays as fallback. Mounted by `ProofUploadSection` (above). Do
  not send any custom request header.
- Own-proof viewer: `<img>` against the token image route
  (`lib/shipping-links.ts` gets `paymentProofSrc(token, paymentId)`), shown when
  `payment.hasProof`.
- States (C4): banners `inTransit`, `expired`; cancelled/expired/rejected show
  the sanitized reason as React text (never HTML) plus `ContactSellerButton`;
  pending proofs of closed orders labelled "Sin revisar (pedido cerrado)";
  voided payments keep the strike-through and a line "El saldo se actualizó";
  payments list shows `method` and `paidAt ?? createdAt`; `expiresAt` shown as
  "Tienes hasta ..." while payable.
- i18n: `publicOrder.upload.*`, `banner.inTransit`, `banner.expired`,
  `closure.*` in `packages/i18n/{es,en}/storefront.json` under `publicOrder`
  (the page uses `useTranslations("storefront.publicOrder")`). Parity gate:
  `pnpm --filter web exec vitest run __tests__/i18n-parity.test.ts`
  (`@biasmarket/i18n` has only `typecheck`).
- Tests also cover "the seller's change shows after a reload / window refocus"
  (#270): a refetch test with `refetchOnWindowFocus`.
- Size: if the PR exceeds ~600 changed lines of non-test code, split it as PR3a
  (upload form, proof viewer, `order-state` changes) and PR3b (C4 states and
  copy), PR3b based on PR3a; `Closes` lines move to the PR that completes each
  issue.

### 4.4 PR4: seller payment API (Closes #260, Refs #266)

Base: PR0 (independent of chain A after PR0; no hosted CI until PR0 merges and
this PR is retargeted to `main`, L27).

- `order-payments.service.ts`: single `normalizeOperationCode` from
  `common/text-sanitize.ts` (PR0; NFKC, strip every character that is not
  `[A-Za-z0-9]`, uppercase) and the SQL equivalent with an **explicit ASCII
  class** (not `[[:alnum:]]`, which follows the database locale):
  `upper(regexp_replace("operationCode", '[^A-Za-z0-9]', '', 'g'))`.
  Precondition stated in the code: every write path stores
  `normalizeOperationCodeForStorage(code)`, so new rows compare correctly;
  legacy rows written before this PR may hold un-normalized text and can be
  missed (acceptable, documented).
  `findDuplicateOperationCode(storeId, code, { currentOrderId })` returns
  `{ orderId } | null`. `storeId` always comes from the authenticated store path
  after `assertOwnership`, never from the body; the query joins `"Order"` and
  filters `"Order"."storeId"` (not only the denormalized
  `OrderPayment.storeId`). It excludes voided payments, `REJECTED` proofs and
  `PENDING_REVIEW` rows whose `"orderId" = currentOrderId`. Add
  `assertSellerPaymentInput` (pure): amount, `paidAt`, `operationCode` (control
  characters, 64), `method`, capture required unless CASH. Rewrite its spec; add
  a real-DB spec or e2e for normalization (spaces, case, dashes, fullwidth, an
  accented-letter case such as `CAFÉ-1`, other store with the same code -> no
  conflict and no leak, voided, rejected, same order).
- `order.controller.ts` `addPayment` (do not grow the controller; call the
  helpers): new fields `operationCode?`, `paidAt?`, `confirmDuplicate?`. Order
  of operations: input validation, duplicate lookup (409
  `{ code: 'DUPLICATE_OPERATION_CODE', orderId }`, nothing else, nothing
  written, nothing uploaded) unless `confirmDuplicate === 'true'`, upload,
  transaction. The 409 and other `HttpException`s are rethrown as-is (the
  catch-all `BadRequestException` only wraps non-Http errors) (L17). `paidAt`:
  ISO datetime with offset/`Z` only, 400 on invalid, not later than
  `now + 5 min`, default now. Capture required unless `method = CASH` (400).
  Limit = `pending - reservedPending` in cents, early and inside the lock;
  inside the lock re-read `paymentStatus` and `fulfillmentStatus` too (L4). The
  interceptor limits already come from PR0; add an e2e that sends all six text
  fields plus the file. Error message when a pending buyer proof is the cause:
  "Rechaza o valida el comprobante pendiente antes de registrar este pago" (a
  junk full-amount proof from a leaked link can block the seller's own
  `addPayment` until reviewed; this is the seller-side mirror of R3).
  `normalizeOperationCode` empty -> 400.
- `reviewPaymentProof`: the review DTO's `reason` gets `@MaxLength(500)` and is
  stored in the audit metadata through `sanitizeDisplayText` (one string feeds
  the audit log and the buyer response). On approve, inside the existing locked
  block (it already filters `id AND storeId`), reject (400) when the order's
  `paymentStatus` is CANCELLED or REJECTED (rejecting as reviewed stays allowed;
  today approving on a dead order marks the proof APPROVED and it then counts
  toward paid) or when `proof.amount > required - credited` ("excede el saldo
  pendiente"), compared in cents with `credited` from `computePaymentSummary`.
  Place the guard before the `updateMany` claim, or prove with a test that the
  400 rolls the transaction back and the proof stays `PENDING_REVIEW`; one test
  per rejected status; a test that approve/reject audit rows never contain
  `operationCode`, `note` or `imageUrl`. `addPayment` loads the order with
  `storeId` too. Add a plain approve test (the #266 "validar comprobante del
  comprador" case) next to the overshoot test, and state in the PR that the
  seller proof image route is unchanged (#266 "imagen por endpoint
  autenticado").
- `stats.service.ts`: unit test pinning the Prisma `where` against
  `countsTowardPaid` over a matrix (voided, pending, rejected, seller, approved,
  non-revenue order status). No code change.
- Verify and cite in the PR (do not rebuild): "approve without payment" and
  "advance fulfillment without payment" regression tests exist for assisted
  orders (`review-payment.usecase.spec.ts`, `order.entity.spec.ts`); if either
  is missing add it. Confirm that an assisted order is born `PENDING_PAYMENT`
  with `requiredAmount` per D-05 (#260), and the `isPaymentMethodConfigured`
  warning path for assisted orders exists in the create response; if not, record
  it as a gap instead of widening scope.
- OpenAPI + Orval regenerated.

### 4.5 PR5: seller payment UI (Closes #266)

Base: PR4.

- `packages/validation`: new `buildSellerPaymentSchema(maxAmount)` in
  `src/payments/` exported from `src/index.ts` (imports use the package's
  existing extension convention) with a test file next to
  `register-payment.schema.test.ts`; adds operation code (<= 64, no control
  characters), `paidAt`, and `file` required unless method is CASH.
  `buildRegisterPaymentSchema` and the `RegisterPaymentInput` type are untouched
  (the type is imported by customer-auth's `use-submit-payment-proof.ts`,
  `order-payments.api.ts` and `account-order-detail.tsx`; the function only by
  `register-payment-form.tsx`).
- `register-payment-form.tsx`: amount prefilled with `pending - reservedPending`
  (cents), operation code, date input (default today) converted by the new
  `apps/web/lib/lima-date.ts` (new, only a `limaNoonIso(dateString)` helper) to
  an ISO string at noon Lima, so a date-only pick never drifts to the previous
  day by UTC conversion (no import from `features/public-order`; the existing
  `apps/web/features/public-order/lib/format-lima-datetime.ts` stays where it
  is), capture required unless CASH, duplicate dialog on a 409. `ApiError`
  carries no body, so `features/orders/api/orders.api.ts` (FormData call sites
  at :50/:96) reads the response JSON on 409 and throws a typed
  `DuplicateOperationCodeError { orderId }`; the dialog links to the existing
  seller order detail route for that `orderId` (which enforces ownership) and
  keeps the `File` so the confirm retry (`confirmDuplicate=true`) does not
  re-pick, hint when a `PENDING_REVIEW` buyer proof exists ("Valídalo en vez de
  crear otro pago") and submit disabled when the proof covers the balance.
- `payment-history-list.tsx`: "Anular pago" button visible only when
  `fulfillmentStatus = ORDERING`, `paymentStatus` is not CANCELLED, REJECTED or
  VERIFIED, and the payment counts toward paid (`source = SELLER_RECORDED` or
  `reviewStatus = APPROVED`, `voidedAt` null). Reason dialog (1-500). Voided
  rows struck through with reason, code and date shown. Known limitation
  recorded in the PR: a payment that settled an order (VERIFIED) cannot be
  voided (D-06, Q1).
- No loose "mark as paid" control: verify the order detail UI has none (L36).
- i18n: new keys under `orders` in `packages/i18n/{es,en}/dashboard.json`.
- Tests: form, duplicate flow, hint, void visibility matrix, reason required,
  voided row, 375 px classes, i18n parity.

## 5. PR stack

One shared first PR, then two chains. PR0 is based on `main` and is the only PR
with hosted CI at first; PR1 and PR4 (both based on PR0) get hosted CI only
after PR0 merges and they are retargeted to `main` (`pull_request` runs only for
base `main`); every other PR is stacked, so use the local gate plus
`gh workflow run ci.yml --ref <branch> -f run_e2e=true`, and retarget each PR
with `gh pr edit <n> --base main` as the one below it merges. PR0 is small and
should merge first.

| #   | Branch                              | Base | Scope | Refs / Closes            |
| --- | ----------------------------------- | ---- | ----- | ------------------------ |
| PR0 | `chore/proof-upload-limits-helpers` | main | 4.0   | Refs #269, Refs #266     |
| PR1 | `refactor/buyer-proof-service`      | PR0  | 4.1   | Refs #269                |
| PR2 | `feat/public-proof-upload-api`      | PR1  | 4.2   | Refs #269, Closes #262   |
| PR3 | `feat/public-proof-upload-web`      | PR2  | 4.3   | Closes #269, Closes #270 |
| PR4 | `feat/seller-payment-api`           | PR0  | 4.4   | Closes #260, Refs #266   |
| PR5 | `feat/seller-payment-ui`            | PR4  | 4.5   | Closes #266              |

Chain A (PR1-PR3) and chain B (PR4-PR5) are independent after PR0; both
regenerate `apps/api/openapi.json`, `apps/api/src/metadata.ts` (tracked) and
`packages/types/generated/**`. Whichever merges second rebases and
**regenerates**, never hand-merges generated files:

Run this only when `git rebase origin/main` stops on a conflict in generated
files (if it finishes cleanly, still run the `generate` + drift commands once
and amend). If it stops on other files, resolve those first: the build needs
them.

```bash
git fetch origin && git rebase origin/main        # stops on conflicts
git checkout origin/main -- apps/api/openapi.json apps/api/src/metadata.ts packages/types/generated   # drop both sides' generated edits
pnpm --filter api build && pnpm --filter api generate:openapi && pnpm --filter @biasmarket/types generate
bash scripts/ci/check-openapi-drift.sh && git add -A apps/api/openapi.json apps/api/src/metadata.ts packages/types/generated && git rebase --continue
```

`generate:openapi` runs `pnpm build` and needs the app's env variables (for
example `S3_*`, `RESEND_*`) from your local, untracked `apps/api/.env` (there is
no `.env.example` in `apps/api`; alternatively
`source scripts/ci/load-e2e-env.sh` first, whose template is
`scripts/ci/e2e.env.example`). The implementer works A first, then B, unless the
user asks for parallel worktrees (Q7). Deploy order per release: API, then web
(a new web against an old API would 404 the upload; an old web against the new
API only hits PR4's "capture required" 400). No tooling PR: both skills are
already on main (#323). The reviewer (not the implementer) closes issues and
epic #254 after verifying section 9 on the merged build.

## 6. Sequenced steps and completion signals

0. Confirm tree/branch, `git log origin/main`, open PRs touching
   `apps/api/src/modules/orders` or `features/public-order` -> first message.
   Report in that first message: tree clean/dirty, branch, `origin/main` SHA,
   open PRs touching the listed paths, and whether Docker is available for the
   e2e gate. 1a. PR0 -> signal: limit tests on both routes,
   `text-sanitize.spec.ts`, hosted CI green.
1. PR1 -> signal: session controller spec assertions untouched and green, the
   race e2e untouched and green, generated files unchanged.
2. PR2 -> signal: guard/route/service specs, e2e (unknown token with a bad file
   returns 404; two stores; spy shows no upload on failed validation),
   regenerated files committed, `check-openapi-drift.sh` green.
3. PR3 -> signal: component tests per state (no horizontal-overflow classes at
   the page container), i18n parity command, typecheck, and a 375x812 screenshot
   of the upload form and of the in-review state attached to the PR.
4. PR4 -> signal: duplicate/overshoot/`paidAt` tests, normalization against a
   real DB, regenerated files committed.
5. PR5 -> signal: component tests, schema tests, 375x812 screenshot of the form
   and the duplicate dialog attached to the PR.
6. Manual end-to-end in a local stack (section 7): the PR3 description contains
   the buyer half of the checklist (upload, "en revisión", seller approve,
   "pagado"); the PR5 description contains the seller half (duplicate code,
   void, buyer-page balance) with pass/fail and date for each step.

## 7. Test strategy and verification

Local gate per PR (planned, label what was run):

```bash
pnpm turbo run lint typecheck test --filter=api --filter=web --filter=@biasmarket/types --filter=@biasmarket/validation --filter=@biasmarket/i18n   # api/web lint use lint-changed-files.mjs: it lints only changed files, so run it before committing or use `pnpm fix`
cd apps/api && pnpm exec vitest run src/modules/orders        # fast loop (~2.3 s measured)
pnpm --filter api generate:openapi && pnpm --filter @biasmarket/types generate   # API-surface PRs; then `git status` must show only intended files (openapi.json, metadata.ts, generated/**)
pnpm --filter api build && bash scripts/ci/check-openapi-drift.sh   # same drift check CI runs; it imports apps/api/dist, so build first
pnpm --filter web exec vitest run __tests__/i18n-parity.test.ts   # i18n parity (web-owned)
bash scripts/ci/e2e.sh                                          # Docker: Postgres, Redis, MinIO, migrations, workers, API e2e (logs in .ci/e2e-*.log)
gh workflow run ci.yml --ref <branch> -f run_e2e=true           # stacked branches (no pull_request CI)
```

Fast e2e loop: `source scripts/ci/load-e2e-env.sh`, start the datastores and
MinIO (`scripts/ci/e2e-datastores.sh`, `minio-e2e.sh`), `prisma migrate deploy`,
start `apps/workers/dist/main.js` with `MAIL_DRIVER=file`,
`E2E_DISABLE_EXPIRATION_SCHEDULERS=true` and `INTERNAL_API_URL`, then
`pnpm --filter api test:e2e -- test/<file>`. Use
`test/buyer-proof-submit-race.e2e-spec.ts` as the template (real MinIO,
concurrent multipart, `deleteImage` cleanup). Each PR description states "e2e
ran: yes/no (how)".

Cases (all with fixed clocks, `vi.useFakeTimers`, where time matters):

- PR1: unchanged specs (see 4.1) + service spec for the extracted logic.
- PR2 success: JPEG, PNG; row `BUYER_SUBMITTED/PENDING_REVIEW`, `paidAt null`,
  `operationCode` stored normalized-trimmed, event + notification, order
  `paymentStatus` unchanged. Failure: unknown/revoked/rotated token (identical
  404 body, and 404 even with a bad file), magic bytes vs extension, 6 MB file
  (Multer limit, nothing buffered beyond it), too many fields, missing file,
  `"1e2"`, `"0x10"`, `"0.001"`, array `amount`, NUL in `operationCode`, amount
  over balance (also counting pending proofs), cancelled / rejected / settled /
  shipped / expired-but-unswept orders, 6th pending proof, non-multipart body.
  State flips between pre-check and lock (cancel/expire committed in between) ->
  400, no row, uploaded object deleted. Concurrency: parallel submissions
  exceeding the balance -> one wins; 6 parallel 1-cent proofs -> exactly 5 rows
  (the 6th gets 400; its uploaded object is deleted); token route and session
  route in parallel on one order (shared lock). Isolation: store B payment id
  with store A token -> 404; seller-recorded payment image -> 404; same body for
  every miss. Image headers pinned. Throttle test: build the app with
  `trust proxy` set as in `test/orders.e2e-spec.ts:73-76` and use a unique
  `X-Forwarded-For` per test (the `nextCheckoutIp()` helper pattern) so
  sequential e2e specs do not collide. Also: non-multipart body -> 415 after the
  404 check, malformed/truncated multipart and unexpected field name -> 400 (not
  500), `Cross-Origin-Resource-Policy` header on the image, event amount stays a
  number. DTO: allow-list test extended (no `imageUrl`, `operationCode`,
  `recordedBy`, `voidReason`); `closure` matrix (seller cancel with/without
  reason, expiry, legacy without event); `expiresAt` null unless `ACTIVE` + hold
  status; `paymentRejectionReason` only when REJECTED and sanitized
  (bidi/control stripped, 500 max). Event payload keys exactly
  `paymentId, amount, method`. Scrub: `/public/orders/T/payments` and
  `/.../image` (also upper-case prefix) scrub to `:token`. Regression: update
  the session spec fixtures (mocked order fields, `tx` read for the in-lock
  re-read) without changing any assertion's intent; add `loadForProof` to the
  `OrderEventsService` mock in `public-order-events.controller.spec.ts`; the
  race e2e unchanged and green.
- PR3: file type/size errors, prefilled amount in cents, method list =
  configured methods, submit disabled while pending, success refetch -> banner
  "en revisión" derived from `payments[]` (`paymentStatus` stays
  PENDING_PAYMENT/PARTIALLY_PAID), form still visible while a balance remains
  after reserved proofs, form for a VERIFIED order with a residual balance, no
  form for non-payable/REJECTED, own-proof `<img>` src is the token route, 404
  -> invalid state, 429 -> message, request uses `credentials: "omit"` and the
  browser API base, state copy per state (IN_TRANSIT, READY, COMPLETED,
  CANCELLED, EXPIRED, REJECTED with reason, voided + new balance), reason
  rendered as text (a string containing `<img onerror>` produces no `img`
  element), pending proof on a closed order labelled.
- PR4: duplicate (spaces, case, dashes, fullwidth, other store -> no conflict,
  voided -> none, rejected -> none, same order pending proof -> none,
  `confirmDuplicate` -> 201), 409 body keys exactly `['code','orderId']`,
  nothing uploaded on 409, `paidAt` (date-only rejected, invalid, future, skew),
  CASH without file 201 / card without file 400, seller payment cannot settle
  past a pending proof, approve overshoot guard, VERIFIED order untouched,
  `HttpException` not wrapped, stats `where` equivalence matrix,
  `PAYMENT_SUBMITTED` payload excludes the code.
- PR5: schema tests, form, 409 mapped to `DuplicateOperationCodeError` by
  `orders.api.ts`, 409 dialog keeps the file, pending-proof hint, void
  visibility matrix (each status), reason required, voided rendering, i18n
  parity.
- Manual, buyer half (PR3 description): local API + web + MinIO + Postgres;
  assisted order; open the link at 375 px; upload a proof; see "en revisión";
  approve as seller; see "pagado". Manual, seller half (PR5 description):
  register a seller payment with a duplicate code (409 dialog, confirm); void a
  payment; check the buyer page balance.

## 8. Risks and edge cases

- R1 Blue/green: no migration. Deploy API before web. PR4's capture rule gives
  old dashboards a 400 during the window (sellers cannot register non-cash
  payments without a capture; the same happens on a web-first rollback), so
  schedule PR4 and PR5 in one release. Rollback order: web first, then API.
- R2 Orphan files: pre-checks before upload and best-effort delete on
  transaction failure; sweep job is a follow-up.
- R3 Leaked link: bounded by per-IP throttle, Multer limits, 5 MB, balance
  reservation, and the cap of 5 pending proofs (the reservation alone does not
  bound the count: a 100.00 balance admits 10,000 one-cent proofs). Known
  trade-offs: five tiny proofs block the real buyer, and one junk full-amount
  proof blocks the seller's own `addPayment`, until the seller rejects or
  validates it (the error message says so).
- R4 Seller free text on a public link: sanitized and rendered as text.
- R5 Duplicate TOCTOU between two sellers is accepted (advisory by design). A
  pending buyer proof with a chosen code can seed a false duplicate warning on
  another order of the same store (griefing only; `confirmDuplicate` overrides
  it).
- R6 Duplicate lookup scans one store's rows; fine for the pilot; follow-up
  column/index later.
- R7 PII: payload/audit pinned by tests (4.2 item 7).
- R8 Mobile: not affected on main; keep `buildRegisterPaymentSchema` unchanged.
- R9 Expiry sweep computes `paidAmount` outside its transaction (pre-existing);
  follow-up ticket, not touched here.
- R10 Rollback: each PR reverts alone; revert order web first, then API;
  buyer-submitted rows created before a revert stay valid for the seller.
- R11 Pre-existing gaps recorded as follow-up tickets (the reviewer opens them):
  checkout Multer limits; per-proof rejection reason column and events after
  VERIFIED; sweep for orphans; VERIFIED-order void (D-06); token-keyed throttle;
  duplicate flag on buyer proofs; pending proofs auto-closed on cancel/expiry;
  approving a proof on a `PAYMENT_SUBMITTED` order falls through to the existing
  early return (no status update, no event); the expiry sweep recomputing
  `paidAmount` inside its own lock (unrelated to the in-lock `expiresAt` recheck
  of the buyer upload).

## 9. Acceptance criteria (objective)

1. `POST /public/orders/:token/payments` with a valid token and JPEG/PNG creates
   one `OrderPayment` (`BUYER_SUBMITTED`, `PENDING_REVIEW`), one
   `PAYMENT_SUBMITTED` event and one open `PAYMENT_PROOF_SUBMITTED`
   notification; the order's `paymentStatus` is unchanged (the buyer page
   derives "en revisión" from the pending proof).
2. Unknown, revoked or rotated tokens return the same 404 body as
   `GET /public/orders/:token`, even with an invalid file. Cancelled, rejected,
   settled, shipped or expired orders return 400, write nothing, leave no object
   in the bucket.
3. Concurrent submissions never exceed the balance or the 5-proof cap (e2e).
4. `GET .../payments/:id/image` returns an image only for a buyer-submitted
   payment of that token's order; every other id returns the same 404.
5. The public DTO keeps the allow-list and adds only the fields in 4.2; no
   `operationCode`, `recordedBy`, `voidReason`, `imageUrl`.
6. Checked by the PR3 component tests plus the 375x812 screenshots: the buyer
   page shows the upload form for payable states (including a VERIFIED order
   with a residual balance), no form otherwise (REJECTED, cancelled, expired,
   shipped, no balance left after pending proofs), and after a submit the banner
   switches to "comprobante en revisión" without a manual reload.
7. Every C4 state has distinct es/en copy including IN_TRANSIT and EXPIRED; the
   rejection/cancel reason and a contact-the-store button appear where relevant;
   voided payments are struck through and the balance is updated.
8. Seller `addPayment`: duplicate -> 409 `{code, orderId}` with nothing written
   or uploaded; `confirmDuplicate` -> 201; non-cash without file -> 400; cash
   without file -> 201; `operationCode`, `paidAt`, `recordedBy` persisted; a
   seller payment cannot exceed `pending - reservedPending`; approving a proof
   cannot exceed the remaining balance.
9. A voided payment never counts anywhere: `paidAmount`/`pendingAmount`,
   customers and stats agree (existing + new equivalence matrix).
10. The seller UI registers with code and date, shows the duplicate dialog,
    hints at the pending proof, and voids with a reason following the visibility
    rule.
11. Per PR: lint, typecheck, unit tests pass; generated files are clean after
    `generate:openapi` + `generate` (`git status`) and `check-openapi-drift.sh`
    passes; API PRs report whether `scripts/ci/e2e.sh` ran.
12. The session endpoint's specs and e2e: after PR1 they pass with assertions
    unchanged (provider wiring excepted); after PR2 each existing assertion
    keeps its intent and passes, with only the fixtures updated (the mocked
    order gains `id`, `storeId`, `status`, `expiresAt`, and the `tx` mock gains
    the in-lock order read), and `test/buyer-proof-submit-race.e2e-spec.ts`
    passes untouched. Verified by: `pnpm exec vitest run src/modules/orders` and
    `bash scripts/ci/e2e.sh`.

## 10. Open questions (each has a safe default)

- Q1 D-06/D-07/D-10/D-13 text is not readable from the wiki clone. Default: the
  implemented behavior (void rules in `void-order-payment.usecase.ts`, D-13
  streaming) is authoritative; the implementer rereads the wiki page if
  reachable and reports contradictions instead of changing void rules.
- Q2 PDF proofs (#269 says JPEG/PNG/PDF). Default: JPEG/PNG only, like the
  session upload, seller capture and shared validator; the buyer viewer and
  seller lightbox are `<img>`. To enable later: use `PROOF_UPLOAD_MIME_TYPES` on
  the token route, return a non-image content type allow-list on the image
  route, render PDFs as a download link in both viewers. The user is told in the
  final reply.
- Q3 Order without an `ORDER_CANCELLED` event -> `closure.kind = CANCELLED`
  (neutral copy when `reason` is null).
- Q4 Duplicate scope: excludes voided, REJECTED proofs and pending proofs of the
  same order.
- Q5 (cut) Duplicate flag on buyer proofs -> follow-up.
- Q6 DTO sanitizes seller reasons on output (strip control/bidi, truncate 500);
  write-side cap is a follow-up.
- Q7 Build chains A and B in parallel worktrees? Default: sequential, A then B.
- Q8 (cut) `paidAt` lower bound.
