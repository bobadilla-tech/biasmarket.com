# Plan: Epic #255 — post-purchase tracking and optional Google account

Status: ready, with one caveat: the two-consecutive-clean-rounds exit bar was
NOT met (round 3 found no blocking issue but several important ones, all
applied; no round 4 was run). See review-log.md. Date: 2026-10-28 · Base:
`origin/main` @ `b6c97f50` · Written for: the implementation agent Epic: #255
(parent #252). Issues left: #272 G1, #273 G3, #274 G2, #271 D1, #275 D2, #276
D3.

## 1. Context and outcome

Outcome: the buyer follows an assisted order until it arrives and, once the
payment is validated, can save the order to a Google-backed buyer account
without ever losing link access. The seller notifies each step by WhatsApp in
one click, with no new link or token. Invites show only at the agreed moments
and are measured.

### What already shipped (the issue checkboxes are STALE)

Verified by `gh pr list`, `git log origin/main` and grep on a clean worktree at
`origin/main` (probe P0):

| Item                                        | State                                                                                                                                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #257 A1, #261 A5, #264 B2, #267 B5, #268 C2 | closed, merged                                                                                                                                                                                                                                    |
| #260 A4                                     | **issue still OPEN but merged** in PR #347 (voids, `countsTowardPaid`). Close it.                                                                                                                                                                 |
| #262 C1                                     | **issue still OPEN but merged** (`GET /public/orders/:token`, `public-order.service.ts`). Close it.                                                                                                                                               |
| #270 C4                                     | **issue still OPEN, mostly merged** by #358 (`features/public-order/`). Leftover: tracking number and packed photo are in the DTO but `public-order-view.tsx` does not render them (B5 criterion "visible to the buyer"). Folded into PR 4 below. |
| PR #364 "C2 — public order page"            | **OPEN duplicate** of #358 (different folder `features/public-orders`). Collision risk on `public-order-response.dto.ts`, `openapi.json`, i18n. Recommend closing; do not rebase onto it.                                                         |
| Local branch `feat/public-order-page`       | its PR #358 is merged; local HEAD is behind `origin/main`. Branch fresh from `origin/main`.                                                                                                                                                       |

Already present and reusable (facts):

- `OrderEvent` model, all event types in the enum, `OrderEventsService`
  (`record(tx, …)`, `listForBuyer`, `requireOrderForToken`, `recordInvite` with
  advisory-lock dedupe of `INVITE_SHOWN`),
  `apps/api/src/modules/orders/application/order-events.service.ts`.
- `POST /public/orders/:token/events` for `INVITE_SHOWN|CLICKED|DISMISSED`
  (`public-order-events.controller.ts`), generated SDK `recordInvite`.
- `GET /public/orders/:token/packed-photo`, tracking fields in the public DTO.
- Buyer Google OAuth: `buyer-google-oauth.ts` (checks
  iss/aud/exp/`email_verified`; returns `{email, name}`, **no `sub`**),
  `buyer-google.controller.ts` (`GET account/google`,
  `GET stores/:slug/account/google`, `GET account/google/callback`, signed
  state + nonce cookie), `CustomerAuthService.loginWithGoogle`
  (`customer-auth.service.ts:201`).
- `BuyerAccount.phone` is already optional; `Order.buyerAccountId`, `claimedAt`
  exist; `GET /account/orders` already lists by `buyerAccountId`.
- `GOOGLE_CLIENT_ID/SECRET` exist and are optional (`env.validation.ts` does not
  require them; `.env.example` files already list them). No new env var needed.

### What does not exist (the real remaining work)

- Nothing writes `claimedAt` or `buyerAccountId` on an order; no claim endpoint;
  `CLAIMED` is never emitted; `BuyerAccount.googleSub` does not exist;
  `customer-auth.controller.ts:175` hardcodes `claimedAt: null` (a placeholder).
- `RECEIPT_CONFIRMED` and `BUYER_NOTIFIED` are never emitted; no
  `buyerConfirmedReceivedAt`; no receipt endpoint or button.
- **`PAYMENT_VOIDED` is never emitted** (`void-order-payment.usecase.ts` writes
  an `AuditLog` row only; confirmed by grep, probe P0). Without a fix, a
  timeline built from `OrderEvent` silently omits voids, while G2 requires
  showing "anulaciones". Not mentioned in any issue.
- Public DTO has no timeline, no `claimed` flag, no receipt field.
  `listForBuyer` has zero callers.
- `WhatsAppMessageType` has no per-status notice types; settings UI hard-codes
  three editors.
- Web: no tracking/photo rendering, no dated timeline, no `America/Lima`
  formatter, no invite UI/config/localStorage, no claim button, no
  in-app-browser detection, no origin label or timeline in buyer account pages
  (`features/buyer-purchases/components/my-purchases.tsx`,
  `features/customer-auth/components/account-order-*.tsx`).

## 2. Probes (throwaway; code in the session scratchpad, not committed)

| #  | What ran                                                                                                                                 | Result                                                                                                                                  | Plan impact                                                                                                                                                                                                                                                                                       |
| -- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 | Worktree at `origin/main`; greps for `claimedAt`, `'CLAIMED'`, `'RECEIPT_CONFIRMED'`, `'BUYER_NOTIFIED'`, `googleSub`, `PAYMENT_VOIDED`  | Only reads/placeholders for claim; no emitters for the three events; void use case has no `events.record`                               | Scope above; adds the `PAYMENT_VOIDED` emit task to PR 3                                                                                                                                                                                                                                          |
| P1 | Throwaway Postgres 17 (port 55432): 3 × `ALTER TYPE … ADD VALUE` in one transaction, then a use of a fresh value in the same transaction | Multiple ADD VALUE in one transaction succeeds; using a value added in the same transaction fails (`unsafe use of new value`)           | One migration file with the four new `WhatsAppMessageType` values and nothing else; no backfill in that migration                                                                                                                                                                                 |
| P2 | Same Postgres: 20 concurrent `UPDATE … WHERE claimedAt IS NULL`                                                                          | Exactly 1 winner                                                                                                                        | Claim and receipt use a conditional `updateMany` (count 1 wins), not read-then-write                                                                                                                                                                                                              |
| P3 | Read `loginWithGoogle`                                                                                                                   | Matches **any** `BuyerAccount` with that email (case-insensitive), regardless of stored `emailVerified`, then sets `emailVerified=true` | Violates D1 "link only to a _verified_ email" and is a pre-hijack path (attacker registers a phone account with the victim's unverified email + password; victim signs in with Google and lands in the attacker's account). Fix in PR 1 (own PR) for both the claim path and the plain login path |

Probe scripts: `…/scratchpad/probes/{run.sh,p1.sql,p2.sql}`. The scratch
worktree is `…/scratchpad/wt` (removed at the end of the session).

## 3. Decisions (defaults; none changes scope, each safe to ship)

1. **D-04 Google linking.** `BuyerAccount.googleSub String? @unique`. Lookup
   order: (a) account with that `googleSub`; (b) exactly one account with that
   email (case-insensitive) AND `emailVerified = true` → set `googleSub` (never
   overwrite an existing one); (c) more than one verified → `ambiguous`
   (existing behavior); (d) otherwise create (email, `emailVerified=true`, no
   phone, `googleSub`). Unverified same-email accounts are ignored: never
   linked, never flipped to verified. A later-verified duplicate can never
   hijack: (a) always wins, and (c) only counts verified accounts. The
   resolve/create step is ONE helper (`resolveGoogleAccount`) used by both
   `loginWithGoogle` and `claimWithGoogle`, and it runs OUTSIDE any claim
   transaction: a P2002 (two concurrent first logins) aborts a Postgres
   transaction (25P02), so the helper catches P2002 on its own statement and
   re-reads the winner (or uses `upsert` keyed on `googleSub`). Applies to plain
   Google login too (security fix; behavior change: a buyer whose old account
   has an unverified email gets a new account). Ships as its own first PR.
   Accounts without `googleSub` keep working through (b), so the old blue/green
   color still behaves.
2. **D-07 "Empacado".** No packed fulfillment status exists
   (`ORDERING|IN_TRANSIT|READY|COMPLETED`), so no packed notice. Four notices:
   payment validated, in transit, ready for pickup, delivered.
3. **Claim hand-off: cookie, never a URL.** The raw order token and any
   capability must not travel in the OAuth `state`/URL (Google logs, Referer,
   access logs; `state` is signed, not encrypted). Flow:
   `POST /public/orders/:token/claim-ticket` body `{ moment? }` (enum of the
   four invite moments; used for the `CLAIMED` payload) is token-authorized,
   throttled 10/min, `no-store`, and protected by `@UseGuards(OriginGuard)`
   imported from `customer-auth/origin.guard.js` (no `@AllowNoOrigin`; the
   orders module currently does not reference it, and the guard has no
   dependencies; add a spec asserting it is attached). It validates the order is
   claimable with its OWN Prisma select
   (`id, storeId, source, status, paymentStatus, claimedAt,
   buyerAccountId, accessTokenHash, accessTokenRevokedAt`;
   do not stretch `requireOrderForToken`) and sets an httpOnly cookie `bm_claim`
   (path `/api/account/google`, 10 min, `secure` in prod, `sameSite: lax`)
   holding an HMAC-signed `{orderId, linkFp, moment?, exp}` with a distinct
   context prefix (`"claim-ticket:"`) on `CUSTOMER_ACCOUNT_TOKEN_SECRET`, so it
   can never be accepted as a session token. `linkFp` = first 16 hex chars of
   the order's current `accessTokenHash`. Returns 204. The web then navigates
   (top-level, `NEXT_PUBLIC_API_URL` host, the SAME host as the POST) to
   `GET /api/account/google?claim=1`. `startFlow` verifies the cookie
   immediately when `claim=1`: missing/invalid → redirect with `invalid`, and
   `state.claim` is set only if it verified (no late failure after the Google
   round-trip). The callback requires BOTH `state.claim` and the cookie, clears
   it, and re-validates inside the claim transaction. The start link alone
   carries nothing, so it cannot be used for login-CSRF. The POST is a
   browser-side mutation only (never a Server Action/RSC: on the server the API
   client uses `INTERNAL_API_URL` and the cookie would never reach the browser);
   the SDK `customFetch` already defaults to `credentials: "include"`
   (`packages/types/http.ts:93`); add a test that the hook sends credentials. If
   session issue fails after commit the cookie is already cleared; the buyer
   presses the button again (idempotent). The callback clears BOTH the nonce
   cookie and `bm_claim` at the very top (before the `!verified` return, missing
   `code` and exchange-failure branches) using the same `path`/`secure` options
   as when they were set. The ticket POST applies the same JSON content-type
   check as `POST events`; `moment` is optional and an empty body must pass
   `forbidNonWhitelisted`. Check order is fixed so unknown and revoked tokens
   give the identical 404 before any 409/422/503 branch. The start link carries
   `?claim=1&locale=` so error redirects use the right locale. Deployment
   assumption (now explicit): web and API must be SAME-SITE (prod:
   `biasmarket.com` and `api.biasmarket.com`); add a manual check on iOS Safari.
4. **After claim, redirect to Mi cuenta**
   (`my-purchases/orders/:orderId?claimed=1`). No return path to the token page
   is stored anywhere (the API never stores the raw token; `sessionStorage` is
   script-readable and lost in the in-app → system-browser hop). The token link
   keeps working for anyone holding it.
5. **Timeline gating is server-side, keyed on `claimedAt`** (issue #274 wording:
   unclaimed = essentials, claimed = full line). It is an incentive, not an
   access control: anyone with the link sees the full line of a claimed order.
   Public DTO adds `claimed`, `lastUpdateAt`, `timeline` (empty unless claimed),
   `hasValidatedPayment`, `receiptConfirmedAt`.
6. **Claim requires a validated payment on the server** (reverses the first
   draft's Q3; closes the "forwarded link claimed first" hole): order is
   `VENDOR_ASSISTED`, `status != CANCELLED`, `paymentStatus != CANCELLED`,
   `hasValidatedPayment`, link fingerprint matches, not claimed by another
   account. Same account re-claiming is an idempotent success (and still issues
   the session). Deferred (follow-up ticket, not built): seller "release claim"
   endpoint and a seller notification on claim. Seller `regenerate` stays
   allowed on a claimed order (the buyer keeps access via Mi cuenta);
   `correctPhone` is already blocked once claimed
   (`manage-assisted-order-link.usecase.ts:61`).
7. **Receipt is idempotent and strictly gated.** Allowed only when
   `paymentStatus === 'VERIFIED'`, `status != CANCELLED`,
   `fulfillmentStatus ∈
   {IN_TRANSIT, READY, COMPLETED}`. Second confirmation
   returns 200 with the same `receiptConfirmedAt`, writes no event and sends no
   notification. The seller notification is sent after commit and its errors are
   swallowed.
8. **Invite rules in one config file**
   (`features/public-order/lib/invite-config.ts`): `dismissDays = 7`, active
   moments, priority
   `entrega > pago_validado > banner > adelanto_linea_de_tiempo`, at most one
   per page. `hasValidatedPayment` is computed on the API through
   `countsTowardPaid`.
9. **Invite `moment`** is added to `RecordInviteEventDto` (enum of the four
   moments) and, with `notice`, to `ALLOWED_PAYLOAD_KEYS`. No phone/token/email
   in any payload. Tests assert the STORED payload.
10. **Buyer-notice log endpoint** is seller-authenticated, owner-checked,
    throttled, `notice` capped by an enum. The wa.me URL is built on the client;
    the number never reaches the event.
11. **Google identity wins over an existing buyer session.** The callback
    replaces the session cookie with one for the Google identity (already the
    current behavior; now stated and tested).

Non-goals: automated WhatsApp, SMS/phone verification, linking by phone,
disputes, "Empacado", backfilling `claimedAt`, dedupe of
`INVITE_CLICKED/DISMISSED` (earlier deferred T3), PKCE/OIDC nonce (follow-up),
Caddy/Sentry hardening, seller release-claim and claim notification (follow-up),
changing the order state machine.

## 4. Design by slice (PR stack, dependency order)

Each branch is based on the previous; the first on a fresh `origin/main`. Hosted
CI runs only for PRs whose base is `main` (`ci.yml`:
`pull_request: branches: [main]`). Therefore: run the local checklist below on
every PR; for PRs 2 and 5a (race-sensitive) local API e2e is mandatory:
`( set -a; . scripts/ci/e2e.env.example; set +a; bash scripts/ci/e2e.sh )`
(Docker must be running; `e2e.sh` itself starts MinIO/Postgres/Redis with fixed
container names, builds api+workers and runs the OpenAPI drift check; do NOT run
`e2e-datastores.sh` separately, it only defines functions; logs in
`.ci/e2e-*.log`; paste the result in the PR body). On each migration PR run
`BASE_SHA=$(git merge-base HEAD <parent-branch>) HEAD_SHA=$(git rev-parse HEAD) bash scripts/ci/check-destructive-migrations.sh`
(the base is the parent branch, not `main`, or the parent's migrations are
included). After a parent is squash-merged:
`git rebase --onto origin/main <old-parent-branch> <child>` then
`gh pr edit <n> --base main`. Merge bottom-up, one PR at a time.

Migration timestamps: check the newest dir in `packages/db/prisma/migrations` at
branch time (two existing dirs share `20261027230000`); use a later one.

### PR 1 — `fix/buyer-google-verified-link` (D-04; prerequisite of D1)

- Migration `<ts>_add_buyer_account_google_sub`: `ADD COLUMN "googleSub" TEXT` +
  `CREATE UNIQUE INDEX "BuyerAccount_googleSub_key"` (additive; takes a short
  SHARE lock on a small table; note it in the PR; `migrate.sh` has a 5 s
  `lock_timeout`).
- `buyer-google-oauth.ts`: extract `sub` from the verified claims (`:154-164`
  parses claims but does not return it); reject when absent; update the identity
  type and `buyer-google-oauth.spec.ts`.
- `CustomerAuthService.loginWithGoogle` per decision 1. Rewrite
  `customer-auth.service.spec.ts:321-409` cases that assumed "match any email,
  flip verified".
- Tests: unverified same-email account NOT linked and NOT flipped (**must be
  recorded red against the old code**), verified single link sets `googleSub`,
  two verified → ambiguous, `googleSub` match wins over email, never overwrites
  an existing `googleSub`, concurrent first logins (P2002 handled; e2e or
  call-shape), email_verified false rejected, missing `sub` rejected,
  `sub`/`aud` compared as strings.
- Manual step in the PR checklist: apply the migration to a populated throwaway
  Postgres (probe style) and confirm the unique index builds.

### PR 2 — `feat/receipt-confirmation` (G3 #273)

- Migrations (two files, each additive):
  `<ts>_add_order_buyer_confirmed_received_at`
  (`ALTER TABLE "Order" ADD COLUMN "buyerConfirmedReceivedAt" TIMESTAMP(3)`) and
  `<ts2>_add_notification_type_receipt_confirmed`
  (`ALTER TYPE "NotificationType" ADD VALUE 'RECEIPT_CONFIRMED'`, nothing else;
  precedent `20260809231500_add_buyer_payment_proof`). `NotificationType`
  currently has `LOW_STOCK|OUT_OF_STOCK|PAYMENT_PROOF_SUBMITTED`
  (`schema.prisma:762`).
- `OrderEventsService.confirmReceipt(token)`: extend the `requireOrderForToken`
  select with `fulfillmentStatus` (and use `paymentStatus`, `status`); gate per
  decision 7 with a generic 409; in `$transaction`:
  `updateMany({where:{id, buyerConfirmedReceivedAt:null}, data:{buyerConfirmedReceivedAt: now}})`;
  count 1 → `record(tx, RECEIPT_CONFIRMED, BUYER)`; after commit create the
  seller notification (`NotificationsService.createIfNotOpen(params, client)`
  with `entityType: 'ORDER'`, `entityId: order.id`; title/body must not contain
  the buyer phone) swallowing errors; count 0 → return the stored date.
- `POST /public/orders/:token/receipt` in `public-order-events.controller.ts`:
  `@Public`, `ThrottlerGuard`, `@Throttle` 20/min, `no-store`, `no-referrer`,
  JSON content-type check like `POST events`. Returns `{ receiptConfirmedAt }`.
- DTOs: public `receiptConfirmedAt`; seller `buyerConfirmedReceivedAt`
  (`order-response.dto.ts`, mapper near `order.controller.ts:353`).
- Web: `use-confirm-receipt` mutation; "Ya lo recibí" only in allowed states and
  when not yet confirmed; placed ABOVE any invite block so it is not pushed
  below the fold on mobile; thank-you state; "Hay un problema" =
  `ContactSellerButton`; seller detail shows the date apart from "Entregado";
  notification renderer (`notification-row.tsx:60` does
  `t(\`types.${item.type}\`)`)
  and es/en keys`types.RECEIPT_CONFIRMED`in`packages/i18n/{es,en}/dashboard.json`(a missing key would show the raw key), tolerant to unknown types. API
  consumers that hard-code the union and must change or typecheck/drift fails:`notifications/notifications.controller.ts:27`,`notifications/dto/notification-response.dto.ts:13,15`(+ regenerate OpenAPI/SDK).
  The mobile app (`apps/mobile`) was checked: no use of notifications, WhatsApp
  types, public orders, Google login or`account/orders`; still run`pnpm
  turbo run typecheck
  --filter=mobile`as a completion signal on PRs that
  touch`packages/types|utils|i18n`
  (2, 3, 4).
- Tests: valid token, unknown/revoked identical 404, state `ORDERING`, payment
  not VERIFIED, cancelled (both flags), double confirm (one event, one
  notification), notification failure does not fail the receipt, concurrent
  double confirm (**e2e**, pattern `buyer-proof-submit-race.e2e-spec.ts:200`),
  real throttle (e2e pattern `customer-auth-rate-limit.e2e-spec.ts`), button
  visibility per state.

### PR 3 — `feat/buyer-notice-templates` (G1 #272)

- Migration `<ts>_add_buyer_notice_whatsapp_types`: one file, four
  `ALTER TYPE "WhatsAppMessageType" ADD VALUE` (`ASSISTED_PAYMENT_VALIDATED`,
  `ASSISTED_IN_TRANSIT`, `ASSISTED_READY`, `ASSISTED_DELIVERED`); same header as
  `20261027130000_…`; no statement uses them (probe P1).
- `packages/utils/src/whatsapp/index.ts`: union (line ~39),
  `WHATSAPP_REQUIRED_TOKENS` (~52), `WHATSAPP_MESSAGE_TOKENS` (~63), defaults
  and builders modelled on `buildWhatsAppAssistedOrderLinkMessage` (~302), tests
  in `index.test.ts`. `{{trackingNumber}}` only in in-transit; the "save your
  order" sentence only in validated and delivered and only when unclaimed.
  Alias-less greeting is well formed. Messages contain no link.
- API: `whatsapp-templates.service.ts:12-16` allow-list, controller `@ApiParam`
  enum (`:12,18`), `dto/whatsapp-template-response.dto.ts:15,17`.
  `POST /stores/:storeId/orders/:orderId/buyer-notices` `{ notice }` (enum):
  `assertOwnership`, load with `{id, storeId}`, `VENDOR_ASSISTED`, throttled;
  logs `BUYER_NOTIFIED` (SELLER, payload `{notice}`); never touches
  `accessToken*`. 204.
- `ALLOWED_PAYLOAD_KEYS` gains `notice` in THIS PR (otherwise the sanitizer
  silently drops it and the stored-payload test passes vacuously).
- Web: ONE `useBuyerNotice` hook + one dismissible "Avisar al comprador" prompt
  component, mounted where each mutation is called and triggered from
  `onSuccess(_, vars)`: `orders-page-client.tsx`, `payments-page-client.tsx`,
  `use-optimistic-status-change.ts`, the detail sheet, and
  `use-review-payment-proof.ts` (also validates payments). The mutation
  variables carry only `orderId`/`status`, so read the order (phone, alias,
  tracking number set during IN_TRANSIT, `claimedAt`) from the REFETCHED query,
  not the stale cache; only `VENDOR_ASSISTED` orders get the prompt. Reuse
  `confirm-number-and-open-whatsapp.tsx` + "Copiar mensaje"; four more
  `MessageTemplateEditor` blocks (`whatsapp-messages-section.tsx` ~60-69 and
  ~222-238), `use-whatsapp-templates.ts`/`settings.api.ts`, es/en keys under
  `dashboard.settings.whatsappMessages`.
- Rollback note (PR body): once rows with the new `WhatsAppMessageType` values
  exist, an OLD Prisma client errors when reading them; rolling back the code
  requires first deleting those `WhatsAppMessageTemplate` rows (and, for PR 2,
  the `Notification` rows of type `RECEIPT_CONFIRMED`). Prefer shipping each
  migration PR and enabling its writers only after it has been live for one
  deploy if the user wants zero rollback risk (default: accept).
- Manual checklist item: prompt and dialog usable at 360 px width (#272
  "funciona en celular").
- Tests: template per status, no alias, tracking token only in transit, no link
  in message, token columns untouched (assert no `accessToken*` write),
  owner-only, cross-store 404, stored event payload has only `notice`, utils
  builders, editors render.

### PR 4 — `feat/order-timeline` (G2 #274 + C4 leftover)

- API: `void-order-payment.usecase.ts` records `PAYMENT_VOIDED` inside the
  existing transaction (`:35`). `PublicOrderService` adds `claimed`,
  `lastUpdateAt`, `timeline` (only when `claimedAt` is set, else `[]`),
  `hasValidatedPayment` (via `countsTowardPaid`). The mapper PICKS fields per
  event type (never spreads `payload`), strips `paymentId`, maps `resolution` to
  a buyer-safe enum. Old voids have no event (no backfill).
- Regenerate OpenAPI + SDK.
- Web: `lib/format-lima-datetime.ts` (`Intl.DateTimeFormat`, explicit
  `timeZone: "America/Lima"`; format on the client or from a stable locale to
  avoid hydration warnings; Lima has no DST), dated `Timeline`; unclaimed shows
  "última actualización" and, when `hasValidatedPayment` and not cancelled, an
  inert dimmed teaser (becomes the `adelanto_linea_de_tiempo` invite in PR 6);
  render tracking number/link and the packed photo through the existing
  authenticated stream `GET :token/packed-photo` (follow the seller pattern in
  `order-shipping-section.tsx`). Read new DTO fields as optional (`?? []`).
- The public DTO already carries `payments[]` (source, amount, createdAt,
  `voidedAt`), so payments on the link page need no new field (#274 satisfied;
  add a test that a voided payment renders "Anulado"). `claimedAt` is written
  only by PR 5a, so the claimed-timeline path is exercised by unit tests until
  then (state this in the PR). Add a test that `GET /public/orders/:token` still
  returns `Cache-Control: no-store` after the DTO change.
- Test: the unclaimed teaser is hidden whenever the invite rules (PR 6) return
  no moment (`hasValidatedPayment` false, cancelled, dismissed rules do not
  apply to the teaser but "nothing to invite" does).
- Tests: unclaimed → empty timeline + `lastUpdateAt`; claimed → ordered events;
  internal events absent (`LINK_REGENERATED`, `PHONE_CORRECTED`, `INVITE_*`,
  `BUYER_NOTIFIED`); void emits an event and renders "Anulado"; exact key-set
  test on the public DTO and each timeline item (no `paymentId`); Lima format
  with fixed instants (not `process.env.TZ`); cancelled and expired.

### PR 5a — `feat/claim-order-google` (D1 #271, API + button)

- API: `claim-ticket.ts` (sign/verify with context prefix, `linkFp`);
  `POST /public/orders/:token/claim-ticket` (decision 3; 404 unknown/revoked
  identical, 409 already claimed, 422 not claimable (no validated payment /
  cancelled), 503 Google unconfigured via `isBuyerGoogleConfigured()`); `claim`
  flag in `createBuyerGoogleState` set only after `startFlow` verifies the
  cookie; callback branch next to `successRedirect`/`loginRedirect` with codes
  `already_claimed|not_claimable|invalid|failed|unavailable`, redirect built
  with the web base URL and locale prefix exactly like the existing redirects,
  to `my-purchases/orders/:orderId?claimed=1` (the page itself arrives in 5b;
  until then the target 404s, so merge 5a and 5b together).
  `CustomerAuthService.claimWithGoogle(identity, ticket)`: (1)
  `resolveGoogleAccount` OUTSIDE the transaction (decision 1); (2) ONE
  `$transaction` for the order: re-read,
  `updateMany({where:{id, source:'VENDOR_ASSISTED', status:{not:'CANCELLED'}, paymentStatus:{not:'CANCELLED'}, claimedAt:null, buyerAccountId:null, accessTokenRevokedAt:null, accessTokenHash:{startsWith: linkFp}}, data:{buyerAccountId, claimedAt: now}})`
  (the `hasValidatedPayment` check is done in the transaction before the
  update); count 0 → same account already owner ⇒ idempotent success else
  `already_claimed`; `customerStoreLink.upsert` ON `tx`;
  `events.record(tx, CLAIMED, BUYER, {moment})`; (3) issue the session after
  commit (also on the idempotent path). Never touch `BuyerAccount.phone` or
  `Order.phoneVerified`. Remove the hardcoded `claimedAt: null`
  (`customer-auth.controller.ts:175`). `ALLOWED_PAYLOAD_KEYS` gains `moment`
  here (PR 6 relies on it).
- Web (client components only; the page shell stays fetch-free):
  `ClaimOrderButton` (explainer: email and name stored, why; scope
  `openid email profile` asserted), browser-side mutation for the POST, then
  `window.location.assign` to the API host; await/`keepalive` for any
  `INVITE_CLICKED` before leaving; `lib/in-app-browser.ts` run in an
  effect/click handler using `navigator.userAgent` (never `headers()` in the
  shell; UAs: Instagram, FBAN/FBAV, Twitter, TikTok/Bytedance, Line, Snapchat,
  MicroMessenger; tests with real UA strings) → instructions to open in the
  phone browser + "Copiar enlace" (the user's own URL, no claim params, no Web
  Share); button hidden when claimed or on 503; on success
  `invalidate(publicOrderKeys.detail(token))`; callback error banners (es/en,
  fallback for unknown codes); public page shows "Pedido guardado" when claimed.
  Small privacy task: the web Sentry init (`apps/web/instrumentation-client.ts`)
  has no `beforeSend`/`beforeBreadcrumb`; reuse the API's `scrubSentryEvent`
  token regex on breadcrumb `data.url`, `event.request.url` and
  `event.transaction` (a few lines; the new client error paths would otherwise
  attach `/public/orders/<token>` URLs). Manual checklist item: 360 px width.
- Tests: success (new account, `googleSub`, one `CLAIMED` with `{moment}`),
  existing account by `googleSub`, verified-email link, unverified NOT linked,
  `googleSub` account + later-verified duplicate, `email_verified=false`
  rejected, no validated payment → 422, cancelled (both flags), revoked, already
  claimed by another, idempotent re-claim by the same account (+session),
  invalid/expired/forged cookie, cookie from a session token context rejected,
  `startFlow` with `claim=1` and no cookie → `invalid`, `OriginGuard` attached
  to the ticket route, **ticket issued before `regenerate` is rejected**,
  marketplace order rejected, Google identity replaces another existing session,
  phone not copied, token link works after claim, `CLAIMED` stored payload has
  no email/phone/token, logs do not echo `code`/cookie, plain (non-claim) Google
  login and "Continuar con Google" to enter Mi cuenta still work. **Race
  (e2e)**: `app.get(CustomerAuthService)` and call `claimWithGoogle` twice with
  `Promise.all` and two stub identities against one VENDOR_ASSISTED order with a
  validated payment: exactly one wins. Budget the fixtures (an `accessTokenHash`
  order, `OrderPayment` rows, cleanup of `OrderEvent`/`BuyerAccount`). Also an
  ordering test claim vs `correctPhone`. Google is stubbed at the service level;
  never drive the real network exchange.

### PR 5b — `feat/claimed-orders-account` (D2 #275)

- API: `GET /account/orders` adds `source`, `claimedAt`; new
  `GET /account/orders/:orderId`: `where {id, buyerAccountId}` in the query
  (same 404 for foreign/missing), explicit selects (no proof image URLs,
  rejection notes, reviewer ids), `timeline` via the PR 4 mapper, payments with
  origin/amount/voids. Per-store detail returns the real `claimedAt`.
- Web: route `(marketing)/my-purchases/orders/[orderId]` with `generateMetadata`
  `robots: noindex` (copy `my-purchases/page.tsx`) using the PR 4 `Timeline`;
  origin label "Creado por la tienda" in `my-purchases.tsx` and
  `account-order-card.tsx`; per-store `store/[slug]/account/orders` gets the
  label and timeline; landing banner for `?claimed=1`. The seller "Reclamado"
  label does NOT exist (`assisted-order-section.tsx:85` only chooses the
  disabled-correction message): implement a "Reclamado" badge from
  `order.claimedAt` in the seller detail (es/en strings), showing no buyer data.
  The Mi cuenta order route is a CLIENT component using the SDK with
  `credentials: include` like `my-purchases` (the buyer session cookie is
  host-only on the API host, so a server component using `INTERNAL_API_URL`
  would 404).
- Tests: claimed order listed with label and timeline, other buyer's order 404,
  cross-store 404, key-set test on the account detail DTO, token link still
  works, seller "Reclamado" badge renders from `claimedAt` and shows no buyer
  data, the route fetches in the browser with credentials (test or checklist
  item).

### PR 6 — `feat/save-order-invites` (D3 #276)

- API: `RecordInviteEventDto.moment`; `recordInvite` stores `{moment}`, skips
  cancelled (existing) and claimed orders.
- Web: `lib/invite-config.ts`, `lib/invite-rules.ts`
  `pickInviteMoment({order, seenFirstValidated, dismissedAt, now, receiptJustConfirmed})`:
  nothing without `hasValidatedPayment`; never for
  cancelled/expired/rejected/claimed; one block max; **moments**: `entrega` when
  the receipt was just confirmed OR `fulfillmentStatus === 'COMPLETED'` (ignores
  dismissal); `pago_validado` on the first open after validation (a per-order
  `localStorage` flag keyed by store slug
  - `orderNumber`, never the token, set after the block is shown); `banner` on
    later visits (collapsible, "Ahora no" hides it `dismissDays` = 7); priority
    `entrega > pago_validado > banner > adelanto_linea_de_tiempo`. Always an
    inline block, never a modal. `localStorage` read in an effect, wrapped in
    try/catch with an in-memory fallback (document that Safari private mode and
    in-app WebViews may reset it). Events through the SDK `recordInvite`,
    `INVITE_SHOWN` guarded by a ref against StrictMode double effects; receipt
    button stays above the block; PR 4 teaser becomes
    `adelanto_linea_de_tiempo`.
- Tests: rules table (no payment, payment first visit → `pago_validado`, second
  visit → `banner`, dismissed within/after 7 days, `COMPLETED` → `entrega` even
  if dismissed, claimed, cancelled, rejected, priority), storage throwing,
  stored payload keys (no phone/token/email), es/en text presence, config-only
  change of `dismissDays`.

## 5. Files (summary)

API: `schema.prisma` (+5 additive migrations), `order-events.service.ts`,
`public-order.service.ts`, `public-order-response.dto.ts`,
`public-order-events.controller.ts`, `record-invite-event.dto.ts`,
`void-order-payment.usecase.ts`, `order-response.dto.ts`/`order.controller.ts`,
buyer-notices handler (`assisted-orders.controller.ts`), `whatsapp-templates.*`,
`buyer-google-oauth.ts`, `buyer-google.controller.ts`,
`customer-auth.service.ts`, `customer-auth.controller.ts`,
`global-account.controller.ts`, new `claim-ticket.ts`; `apps/api/openapi.json`,
`apps/api/src/metadata.ts`, `packages/types/generated/**`. Utils/i18n:
`packages/utils/src/whatsapp/*`,
`packages/i18n/{es,en}/{storefront,dashboard}.json`. Web:
`features/public-order/**`, `features/assisted-orders/**`,
`features/store-settings/components/whatsapp-messages-section.tsx`,
`features/buyer-purchases/**`,
`features/customer-auth/components/account-order-*.tsx`, order detail sheet,
notification renderer.

## 6. Steps and completion signals

Per PR: (1) branch; (2) schema/migration then `pnpm db:generate`; (3) API code +
unit tests; (4) regenerate contracts:
`( set -a; . scripts/ci/e2e.env.example; set +a; pnpm --filter api generate:openapi ) && pnpm --filter @biasmarket/types generate`
(`generate:openapi` already builds; no DB or Redis connection needed, but env
validation needs the variables set; `load-e2e-env.sh` only works inside GitHub
Actions) then `bash scripts/ci/check-openapi-drift.sh`; commit
`apps/api/src/metadata.ts` if it changes; (5) web code + tests; (6) the
verification commands; (7) open the PR. Signal: every acceptance bullet of the
PR maps to a passing test, and each listed regression test was seen red against
the old code (stash the production change, run, restore; record it in the PR).

## 7. Test strategy

- Unit (vitest, fake `PrismaService` via `useValue`): logic and CALL SHAPE (e.g.
  `updateMany` called with `claimedAt: null`), never atomicity.
- API e2e (`apps/api/test/*.e2e-spec.ts`, real AppModule; needs Postgres, Redis,
  MinIO/S3; run through `scripts/ci/e2e.sh`, see section 4): all race tests,
  tenant isolation, real throttling. Google is never called; claim e2e uses a
  signed cookie and a stubbed identity.
- Web vitest/jsdom with `renderWithProviders`; fixed instants for date tests.
- Cross-cutting: identical 404 for unknown/revoked tokens; exact key-set asserts
  on public/account DTOs and on STORED event payloads; no raw token, full phone
  or email anywhere in events; every seller endpoint with a foreign `storeId`.
- Manual per migration PR: apply the migration to a populated throwaway Postgres
  (not a CI test).

## 8. Risks

- **Pre-hijack via unverified email** (probe P3): fixed in PR 1, regression test
  recorded red on old code.
- **Link-holder claims first**: mitigated by requiring a validated payment and
  the fingerprint binding; residual risk accepted for V1 (release-claim endpoint
  is a follow-up).
- **Blue/green overlap (~30 min, api/web/workers flip together; deploy order is
  not controllable)**: all migrations additive. New enum values
  (`NotificationType.RECEIPT_CONFIRMED`, four `WhatsAppMessageType`) are only
  written when the feature is used; an old-color API that lists those rows could
  fail on an unknown enum until it drains. Accepted and documented; web renders
  unknown notification types safely. The Orval client is a plain `fetch` client
  (no runtime schema), so missing new fields only matter as types: read
  `claimed`, `timeline`, `receiptConfirmedAt`, `hasValidatedPayment` as
  optional.
- **Public DTO leak**: mapper picks keys (no payload spread); exact-key-set
  tests.
- **OAuth**: only a signed cookie carries the claim; `state` gets a boolean.
- **Throttle**: carrier NAT; limits: receipt 20/min, claim-ticket 10/min,
  buyer-notices throttled; `trust proxy` already set (#343).
- **Behavior change** (PR 1): existing Google users with an unverified-email
  account get a new account; called out in the PR.
- **Rollback**: columns/enum values stay, but rows using the new enum values
  make an OLD Prisma client error when read; see the PR 2/3 rollback notes
  (delete those rows first).
- Invite events not deduped for CLICKED/DISMISSED (known); localStorage
  dismissal is best-effort.

## 9. Acceptance criteria (objective)

Each issue's own acceptance bullets map to a plan step and a named test:

| Issue | Bullet (short)                                                                                                                                                                  | Step                          | Test                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------- |
| #272  | "Avisar al comprador" optional/dismissible after status change                                                                                                                  | PR 3 web prompt               | prompt shows per mutation, dismiss works                       |
| #272  | one template per status, per store                                                                                                                                              | PR 3 migration/utils/settings | template per status; editors render                            |
| #272  | wa.me + number confirmation + copy                                                                                                                                              | PR 3 reuse B2 dialog          | dialog opens wa.me, copy button                                |
| #272  | never changes the token                                                                                                                                                         | PR 3 endpoint                 | no `accessToken*` write                                        |
| #272  | invite phrase only validated/delivered and unclaimed                                                                                                                            | PR 3 builders                 | builder cases                                                  |
| #272  | no alias greeting; `BUYER_NOTIFIED` without number; owner-only                                                                                                                  | PR 3                          | alias-less, stored payload, cross-store 404                    |
| #273  | visible only IN_TRANSIT/READY/COMPLETED, token-authorized                                                                                                                       | PR 2                          | state matrix                                                   |
| #273  | stores date, event, seller notification, seen in seller detail                                                                                                                  | PR 2                          | event, notification, seller detail renders date                |
| #273  | does not change fulfillmentStatus; once; not with revoked token                                                                                                                 | PR 2                          | double/concurrent, revoked 404                                 |
| #273  | "Hay un problema" = contact; thank-you + invite                                                                                                                                 | PR 2 + PR 6                   | button test; `entrega` moment test                             |
| #274  | essentials without account; full line when claimed; only `visibleToBuyer`; Lima; `no-store`                                                                                     | PR 4                          | unclaimed/claimed, key sets, fixed-instant format, header test |
| #274  | teaser only when D3 allows                                                                                                                                                      | PR 4 + PR 6                   | teaser hidden when no moment                                   |
| #271  | token required, state bound, verified email, link rules, phone not copied, no re-claim, "Ahora no" keeps access                                                                 | PR 1 + PR 5a                  | the listed PR 1/5a tests                                       |
| #271  | in-app browser help; explanation before Google; minimal scope                                                                                                                   | PR 5a                         | UA tests; explainer renders; scope assertion                   |
| #275  | appears with origin label + timeline + payments; any device via Google; seller sees "Reclamado"                                                                                 | PR 5b                         | listing, detail, key sets, badge                               |
| #276  | no invite without validated payment; never cancelled/expired/rejected/claimed; one per page; dismiss 7 days; moment 3 despite dismissal; events with moment; config file; es/en | PR 6                          | rules table, priority, storage throwing, payload keys          |

Plus:

1. `PAYMENT_VOIDED` exists after a void and shows in a claimed order's timeline.
2. `pnpm typecheck`, `pnpm lint`, `pnpm test` green per PR; local `e2e.sh` green
   for PRs 2 and 5a (output in the PR body); anything not run is labeled "not
   run".
3. `bash scripts/ci/check-openapi-drift.sh` clean after each DTO-changing PR.
4. No raw token, full phone, email, `paymentId` or seller free text in any
   `OrderEvent.payload` read by buyers (key-set tests).
5. A claimed order's token link still returns 200 with the same essentials.
6. No invite for an order without a validated payment.
7. A claim cookie issued before a link `regenerate` cannot claim.
8. An unverified same-email account is never linked by Google login.

## 10. Open questions (all have safe defaults; none blocks)

| #  | Question                                                              | Default                                                        |
| -- | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| Q1 | Verified-email linking also for plain Google login?                   | Yes (PR 1)                                                     |
| Q2 | Skip the "Empacado" notice?                                           | Yes                                                            |
| Q3 | Require a validated payment on the server to claim?                   | **Yes** (changed in review)                                    |
| Q4 | Gate the full timeline by `claimedAt`?                                | Yes (issue wording; incentive only)                            |
| Q5 | Idempotent second receipt confirm?                                    | Yes                                                            |
| Q6 | Redirect after claim to Mi cuenta?                                    | Yes                                                            |
| Q7 | Close duplicate PR #364 and stale issues #260/#262/#270?              | Recommend yes; user action, not for the implementation session |
| Q8 | 7-day dismissal?                                                      | Yes (config)                                                   |
| Q9 | Build the seller "release claim" endpoint and claim notification now? | No, follow-up ticket                                           |

Readiness: see the status line and `review-log.md` (three review rounds plus a
final readiness pass).
