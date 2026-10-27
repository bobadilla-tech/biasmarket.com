# Assisted order, seller flow (A3 + B1/B2/B3) and the implementation-plan skill

Status: ready (v7; six review rounds, last round had no blocking findings; see review-log.md)

Work unit: a seller creates an order for a buyer who only gave a WhatsApp
number and sends a private link in under a minute. Epic #253 under index #252.
Issues #259 (A3), #263 (B1), #264 (B2), #265 (B3), leftovers of #258 (A2), plus
the repo skill `.claude/skills/implementation-plan/`.

Snapshot of 2026-10-27; `origin/main` = `cc538b78` (PR #322 merged the follow-up
branch; run `git fetch && git log origin/main -3` before branching each PR and
re-verify any line cite you rely on). Verify claims against
current code before relying on them. Siblings in this folder: `review-log.md`,
`handoff-prompt.md`, `review-handoff-prompt.md`.

## 1. Outcome and what already exists

The pasted issue checklist is stale. Merged PR #313 already delivered:

- A1 data model: `Order.source`, `createdByUserId`, `accessTokenHash`,
  `accessTokenRevokedAt`, `linkFirstOpenedAt`, `claimedAt`, `phoneVerified`,
  `customerPhoneNormalized` (+ backfill), `OrderEvent`. `OrderEventType` already
  has `CREATED`, `LINK_REGENERATED`, `PHONE_CORRECTED` (schema ~385-404): no
  event enum migration.
- A5 events: `OrderEventsService.record(tx, {orderId, storeId, type, actor,
  payload})` with a payload allow-list (`order-events.service.ts:69-119`).
- C1 public read: `GET /public/orders/:token`, `POST /public/orders/:token/events`.
- A2 pieces: `validatePhone/maskPhone/normalizePhone`
  (`packages/utils/src/phone-country`), `createOrderAccessToken`,
  `hashOrderAccessToken`, `assertVendorAssistedOrder`
  (`packages/utils/src/assisted-order`), `GET /stores/:id/customers/lookup`,
  `CustomersService.upsertStoreContact`
  (`modules/orders/application/customers.service.ts:289`, non-transactional, see 4.2).

Also in main since PR #322 (`a3bf8db4`): proof-review order-row lock and
PENDING_REVIEW guard, INVITE_SHOWN dedupe lock, 00-prefix phone repair migration.
The cited `order.controller.ts` lock (line 669) and `order-events.service.ts`
(allow-list 40, `record` 90, `BUYER_VISIBLE` 24) were re-checked on `cc538b78`.

Missing, covered here: create endpoint (A3), regenerate and correct-phone
endpoints (B3 API), `ASSISTED_ORDER_LINK` WhatsApp type, the three seller
screens, a tx-aware Customer upsert without `BuyerAccount`, phone display
formatter, link builder.

Non-goals: C2 buyer page (#268; links 404 until it ships), #260/#266 payment
rules, Google claim, metrics, mobile app, `trust proxy` change, idempotency key,
order-ref consolidation, orval version pin chore.

## 2. Current behavior (facts, file:line on main)

- `create-order.usecase.ts` (570 lines): store 84; delivery config 87-94;
  courier validation 96-132; pickup rule 134-160; `$transaction` at 171: pickup
  lock 181-238, courier lock 243-262, **checkout-only Customer/BuyerAccount
  upsert 264-281 (before stock)**, items/stock `UPDATE ... RETURNING` 291-388
  (`syncStockAlerts` 351; `messageItems` mutated inside the tx 162/381),
  shipping 393-403 (`Number()` before `.plus`, keep), `requiredAmount` 410-437
  (PARTIAL only if `paymentType==='PARTIAL'`, config exists, enabled, not CASH,
  `depositPercent<100`), `expiresAt = now + store.holdWindowHours` (default 48)
  439-441, `order.create` 443-484 (sets `customerPhoneNormalized` at 450),
  checkout-only proof 492-516, WhatsApp message/email 528-566. No
  `OrderEvent CREATED` is recorded today.
- Spec `create-order.usecase.spec.ts` hand-constructs `CreateOrderUseCase`,
  mocks Prisma with `$transaction: cb => cb(prisma)` and pins SQL args
  (253-262) and call order.
- `CustomerAccountService.findOrCreateCustomer` (104-217): email required,
  creates/links global `BuyerAccount` and `CustomerStoreLink`. Not usable.
- `CustomersService.upsertStoreContact` (289-302): uses `this.prisma`,
  `assertOwnership`, always overwrites `name` with a non-empty alias. Not usable
  inside a transaction and would clobber a registered buyer's name.
- `order.controller.ts`: `@Controller('stores/:storeId/orders') @UseGuards(AuthGuard)`,
  `assertOwnership` per handler, per-route
  `@UseGuards(ThrottlerGuard) @Throttle({default:{ttl:60_000,limit:20}})`,
  order-row lock `SELECT id FROM "Order" WHERE id=$ AND "storeId"=$ FOR UPDATE`
  at ~669, `tx.auditLog.create({actorId,storeId,action,entityType,entityId,metadata})`.
- `OrderStatus` is only ACTIVE or CANCELLED (schema ~496); expiry sweep sets
  CANCELLED (`expire-orders.usecase.ts:69`); an order past `expiresAt` is still
  ACTIVE until swept. `public-order.service.ts` has a `payable` notion to mirror.
- `accessTokenRevokedAt` is never written anywhere today.
- `public-order.service.ts:76-90` first open: `updateMany({where:{id,
  linkFirstOpenedAt:null}})`, no hash filter.
- Throttling: `main.ts` never sets `trust proxy` (comment in
  `monitoring-webhook-secret.guard.ts:13-19`), so behind Caddy every
  `ThrottlerGuard` IP bucket is effectively global.
- Web: "Nuevo pedido" stub at `orders-page-client.tsx:188-195`
  (`alert(t("newOrderSoon"))`). No `/orders/new` route. No web consumer of
  `/public/orders/:token`; no buyer route exists. `checkout-form.tsx` 1397 lines;
  `pointsRequiringDate` (176), `unconfiguredManualMethods` (193), `deliveryCost`
  (334), `partialAvailable` (~348), `pickupDateBlocking` (453) are inline
  `useMemo`/IIFEs; payload built inline ~470-510; reusable already:
  `useDeliveryOptions(slug)`, `features/checkout/lib/pickup-availability.ts`,
  `isPaymentMethodConfigured`, `components/ui/phone-input`. No phone display
  formatter. `WhatsAppMessageType = NEW_ORDER | PAYMENT_REMINDER` in utils (29),
  Prisma enum (~591), API service array, controller + DTO enums, `metadata.ts`,
  `openapi.json`, `settings.api.ts:175-183`, `use-save-whatsapp-template.ts:9,27`,
  `whatsapp-messages-section.tsx:76-80,194-202`, comment at
  `contact-seller-button.tsx:9`. `getOrderNumber` slice -4 (5 sites) vs
  `shortOrderRef` slice -6 (`whatsapp/index.ts:126`).
- CI (`ci.yml:3-12`): `pull_request: branches: [main]` only; stacked PRs get no CI.
  API e2e runs on PRs touching `apps/api`, `packages/db|queue|types|utils`.
  `check-openapi-drift.sh` is a strict diff of `openapi.json` only. Orval output
  (`packages/types/generated/**`) was committed with 8.23.0, lockfile resolves
  8.43.0: regenerating rewrites 33 unrelated files; `generated/**` is not
  checked by CI.
- Fresh worktree: needs
  `DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public pnpm turbo run build --filter='./packages/*'`
  before api/web typecheck or vitest work.

## 3. Probes already run (throwaway, outside the repo)

1. Race probe on a throwaway Postgres: a buyer holding the OLD token whose
   first-open update lands after the seller rotated the token stamps
   `linkFirstOpenedAt` on the NEW token (never two valid tokens, but a false
   LINK_OPENED and correct-phone permanently blocked). Fix in 4.3.
2. WhatsApp probe: `customerName: ""` renders `¡Hola ! 💜`; a missing key leaves
   `{{customerName}}` literal; accents/emoji/`&`/`?#` encode correctly in `wa.me`.
3. Baseline verification commands (section 7) pass on main after the package build.
4. Deadlock probe (Postgres 16, throwaway container, scratchpad SQL
   `a.sql`, `b_v1.sql`, `b_v2.sql`): checkout order (Customer, stock, Order) vs the
   v1 assisted order (stock, Customer upsert, Order) -> `40P01 deadlock detected`;
   with Customer first in both -> both commit. A plain non-key `UPDATE` of a
   Customer row does not block the Order FK insert; `SELECT ... FOR UPDATE` on a
   Customer would. PR2 repeats this as a real-DB e2e test.

## 4. Design

Lock order rule for every order-creating transaction:
pickup point -> courier -> Customer row -> product variant stock -> Order insert.
Seller mutations on an existing order lock Order -> Customer (correct-phone); safe
because nothing takes Customer -> existing Order. Never `SELECT ... FOR UPDATE` a
Customer row (it blocks the Order FK insert).

### 4.1 Shared creation functions (PR1, no behavior change)

New `apps/api/src/modules/orders/application/order-creation.core.ts`: plain
exported functions, no new injectable, so `CreateOrderUseCase`'s constructor and
the spec's hand-built instance are unchanged (justification: avoids module wiring
and keeps the spec edits at zero).

- `validateDeliveryPreTx(prisma, store, dto)`: lines 87-160 (outside the tx).
- `lockAndValidate(tx, store, delivery, pre)`: pickup lock/closed/openDays/date
  (181-238) and courier lock (243-262); returns `{pickupPoint, pickupDate,
  courierConfig}` (today these are outer mutable variables at 161-162).
- `reserveItems(tx, notifications, store, input)`: `input` is a narrow type
  (`items`, delivery fields, `paymentMethod`, `paymentType`, `deliveryConfig`,
  `courierModalityType`, plus the locked values above), NOT `CreateOrderDto`, because
  the assisted DTO has no email/name. Items, stock, currency, shipping,
  `requiredAmount` (the PARTIAL `paymentMethodConfig` re-read stays inside),
  `expiresAt` (291-441); returns `{orderData, finalAmount, requiredAmount,
  messageItems, pickupPointLabel}`. `messageItems` is local and returned (no tx retries).

`CreateOrderUseCase.execute` keeps its exact call order:
pre -> `$transaction`( `lockAndValidate` -> checkout Customer upsert (264-281, only when
`dto.customerEmail` is set, unchanged position) -> `reserveItems` -> `order.create({...orderData, buyer fields})` -> proof )
-> WhatsApp message -> email. Error message text and DB call order identical (including the `Number()` in the shipping sum).
Acceptance: `create-order.usecase.spec.ts`, the other orders specs and
`apps/api/test/orders.e2e-spec.ts` pass with zero edits.

### 4.2 Create endpoint (PR2)

`POST /stores/:storeId/orders/assisted`: `AuthGuard` + `assertOwnership`.
Throttle: a user-id keyed guard (`class SellerThrottlerGuard extends ThrottlerGuard` in `apps/api/src/common/guards/seller-throttler.guard.ts`
overriding `getTracker` to `session.user.id`, falling back to IP), 20/min; verify
`request.session = {session, user}` is set by the global better-auth `AuthGuard` (runs before
controller guards), so `getTracker` returns `req.session?.user?.id ?? req.ip` (key includes the handler, so
buckets are per endpoint); `OrdersModule` already has `ThrottlerModule.forRoot` and a route-level
`@Throttle` overrides its default. Test: two users on one IP get separate buckets. Changing `trust proxy`
is out of scope (follow-up issue).

`CreateAssistedOrderDto` (every field decorated; global whitelist +
`forbidNonWhitelisted`): `customerPhone` (required, custom validator wrapping
`validatePhone`, same Spanish message as the lookup route; NOT `MinLength(6)`),
`customerName?` (`@MaxLength(60)`, trimmed, control characters rejected), delivery
fields reusing `ShippingAddressDto`, `items[]` reusing `CreateOrderItemDto`,
`paymentMethod?`, `paymentType?` (D-05 default: per method, as checkout). Not
accepted: `customerEmail`, `source`, `createdByUserId`, `expiresAt`, `storeId`,
proof. Do not use `PartialType/OmitType` unless from `@nestjs/swagger`; regenerate
`apps/api/src/metadata.ts`.

`CreateAssistedOrderUseCase`:
1. `validatePhone` -> normalized E.164; empty/invalid -> 400.
2. Generate `createOrderAccessToken()` BEFORE opening the transaction.
3. `previousOrders`: count-only helper (store-scoped, includes legacy rows with
   null `customerPhoneNormalized`), no second `assertOwnership`; advisory.
4. One `$transaction`: `lockAndValidate` -> `upsertAssistedCustomer(tx, storeId,
   phone, alias)` -> `reserveItems` -> reject `finalAmount <= 0` with 400 (the throw rolls
   the whole transaction back, so the reserved stock is released) ->
   `assertVendorAssistedOrder` (an `AssistedOrderInvariantError` is a plain `Error`; wrap it into a
`BadRequestException` here and in 4.3, never let it reach the filter as a 500) -> `order.create` (data = `{...orderData from reserveItems, customerName: alias || null,
   customerPhone, ...}`; `source: VENDOR_ASSISTED`,
   `createdByUserId`, `customerPhone` = normalized, `customerPhoneNormalized`,
   `customerId`, `accessTokenHash`, `accessTokenRevokedAt: null`, `expiresAt` from
   `holdWindowHours` (D-10 default)) -> `OrderEventsService.record(CREATED, actor
   SELLER)` (`CREATED` is in `BUYER_VISIBLE`, so the buyer timeline shows it; the payload
   allow-list has no phone/token/alias keys) -> AuditLog `order.assisted_created` with metadata
   `{source, itemCount, deliveryMethodType, paymentMethod}` only.
5. `upsertAssistedCustomer(tx, storeId, phone, alias)`: a Prisma `upsert` cannot express
   "name only if null" and a plain create races (P2002 on `storeId_phone` aborts the tx -> 500,
   triggered by a double click). Implement as
   `INSERT INTO "Customer" (...) VALUES (...) ON CONFLICT ("storeId", phone) DO NOTHING`
   via `tx.$executeRaw`, then `tx.customer.findUnique` by `storeId_phone`, then a conditional
   `tx.customer.updateMany({where:{id, name:null}, data:{name}})` only when the alias is
   non-empty. The raw insert needs an explicit id because Prisma generates `cuid()` client-side:
   `INSERT INTO "Customer" ("id","storeId","phone","name") VALUES (${randomUUID()}, ...)
   ON CONFLICT ("storeId","phone") DO NOTHING` (other columns are nullable or have DB defaults).
   `DO NOTHING` never errors, which matters: after any failed statement Postgres aborts the
   transaction (25P02) and Prisma uses no savepoints, so never wrap a statement inside the
   transaction in try/catch. If the follow-up `findUnique` returns null (a concurrent delete between the conflict and the
   read), retry the INSERT once; a second null throws 409 `Conflict` (retry later). Thrown errors
   and messages never include the phone (`AllExceptionsFilter` logs `stringifyError`; a unit test
   spies on the logger). Create tests also cover correct-phone waiting on an uncommitted concurrent
   insert of the same phone (no cycle). Set an explicit `$transaction` timeout
   (`{timeout: 15_000}`) for many-item orders. Never touch email, `emailVerified`, `passwordHash`, `BuyerAccount`,
   `CustomerStoreLink`. A plain non-key `update` takes no lock that blocks the Order FK
   insert (probed). New function; `upsertStoreContact` stays as is. Tests: concurrent creates
   for the same new phone both succeed; existing name preserved; registered buyer untouched.
6. Response: order DTO + `accessUrl` + `previousOrders`; set headers with `@Res({passthrough:true})`
   so serialization/interceptors still apply; headers
   `Cache-Control: no-store` and `Referrer-Policy: no-referrer`; mark `accessUrl`
   as secret in the DTO description. `accessUrl = buildOrderAccessUrl(token, slug)`
   in `apps/api/src/modules/orders/application/order-access-url.ts` (reads `WEB_URL` like the other
   modules; one helper; D-12 default
   `${WEB_URL}/es/store/{slug}/pedido/{token}`; token never in a query string).
   No email, no buyer notification.

### 4.3 Link endpoints and first-open guard (PR3)

First commit of the PR: `public-order.service.ts` first-open `updateMany` adds
`accessTokenHash: hashOrderAccessToken(token)` (the presented token's hash) and
`accessTokenRevokedAt: null` to `where`; count 0 -> no stamp and no LINK_OPENED
event. The stale reader still gets 200 with the old snapshot (accepted).

`POST /stores/:storeId/orders/:orderId/access-link`,
`PATCH /stores/:storeId/orders/:orderId/buyer-phone`: `AuthGuard`,
`assertOwnership`, `SellerThrottlerGuard`; then in one transaction:
`SELECT id FROM "Order" WHERE id=$ AND "storeId"=$ FOR UPDATE` (no row -> 404, same
body for nonexistent and foreign); RE-READ the row after the lock and decide from
it (never from a pre-read); all writes use `where: {id, storeId}`.
Guards (both endpoints), each -> 409 unless noted: `source = VENDOR_ASSISTED`
(else 404); not (`status = CANCELLED` or `paymentStatus = CANCELLED` or
(`paymentStatus` in the hold set `RESERVED_HOLD_STATUSES` and `expiresAt < now`)); move that
constant (currently a private copy in both `cancel-order.usecase.ts:13` and
`expire-orders.usecase.ts:13`) to one exported location in the orders domain and import it, rather than
add a third copy (no behavior change). The expiry
check applies only to hold statuses because the sweep only cancels those and nothing clears
`expiresAt` on VERIFIED (`expire-orders.usecase.ts:32`). Regenerating on a VERIFIED/paid order is allowed (the buyer
still needs the page). Correct-phone additionally requires `linkFirstOpenedAt IS
NULL AND claimedAt IS NULL` (409), `validatePhone` (400), and
`assertVendorAssistedOrder` with the new phone; `AssistedOrderInvariantError` is
mapped to 400, never 500.
Regenerate writes: new `accessTokenHash`, `accessTokenRevokedAt: null`, event
`LINK_REGENERATED`, AuditLog `order.link_regenerated`. Correct-phone writes:
`upsertAssistedCustomer` for the new phone (an existing registered Customer is linked,
not mutated); the same phone as the current one -> 400 no-op, `customerPhone`, `customerPhoneNormalized`, `customerId`, new token,
event `PHONE_CORRECTED`, AuditLog `order.phone_corrected`; `Order.customerName` is
left unchanged. The old (wrong-number) Customer row is NOT deleted: a probe showed that a guarded
DELETE can silently null a concurrent create's `Order.customerId` (FK is `ON DELETE SET NULL`; the
`NOT EXISTS` uses the statement snapshot) or make that create fail with 23503 -> 500. The phantom
contact (possibly a real third party's number, shown with 0 orders in the seller's Customers list)
is an accepted risk; follow-up issue: hide zero-order customers that have no auth data in
`findAllForStore`. AuditLog and event payloads
never contain a phone, alias or token. Responses `{order, accessUrl}` with
`no-store`/`no-referrer`. Seller order DTO
(`apps/api/src/modules/orders/dto/order-response.dto.ts` and the `PUBLIC_ORDER_FIELDS`/select in
`order.controller.ts`; regenerate openapi + orval; web consumers: `OrderResponseDto` users in
`features/orders`) adds `linkFirstOpenedAt`, `claimedAt`
and a creator display name (`User.name` joined by `createdByUserId`; extend the `OrderResponseDto` class) (never raw `createdByUserId` of other staff).

### 4.4 WhatsApp `ASSISTED_ORDER_LINK` (PR4)

- Migration (own file, contains only
  `ALTER TYPE "WhatsAppMessageType" ADD VALUE 'ASSISTED_ORDER_LINK';`; nothing in
  the same migration uses the value). Passes `check-destructive-migrations.sh`
  (precedent: `20260729215419_add_partial_order_payments`,
  `20260809231500_add_buyer_payment_proof`). Blue/green safe: there is no list
  endpoint, `findOne`/`PUT :type` go through `parseType` (400 on unknown values),
  checkout reads only `NEW_ORDER`; old color never touches the new value.
- utils: extend union, `WHATSAPP_REQUIRED_TOKENS` (`link`),
  `WHATSAPP_MESSAGE_TOKENS` (`link, customerName, storeName, orderRef, totalAmount,
  currency`), variables builder, `buildWhatsAppAssistedOrderLinkMessage(input,
  template?)`. The default message is built in TS with a conditional greeting
  (`¡Hola ${alias}! ...` vs `¡Hola! ...`); no regex cleanup, no new token; custom
  templates render as written. Callers pass `customerName: ""` when absent.
  Tests in `whatsapp/index.test.ts`: with/without alias, accents/emoji/`&`/`?#`
  encoding, required `{{link}}`.
- API: `whatsapp-templates.service.ts`, controller, response DTO enum,
  `metadata.ts`, specs, `apps/api/test/whatsapp-templates.e2e-spec.ts`,
  `openapi.json`, orval output for the touched files.
- Web (all under `apps/web/features/store-settings/`): `api/settings.api.ts:173-186` (two -> three
  templates, widen the `saveWhatsAppTemplate` union), `queries/use-whatsapp-templates.ts`
  (`WhatsAppTemplatesByStore` gets `assistedOrderLink`), `app/.../settings-page-client.tsx:74-81`
  (prop mapping), `mutations/use-save-whatsapp-template.ts:9,27` (replace the
  `type === "NEW_ORDER" ? ... : ...` ternary with
  `const KEY = {NEW_ORDER:"newOrder", PAYMENT_REMINDER:"paymentReminder", ASSISTED_ORDER_LINK:"assistedOrderLink"} as const`),
  `components/whatsapp-messages-section.tsx` (third editor; replace the nested two-way preview
  ternary with a `Record<type, ...>` lookup; sample input includes `link` because it is a required
  token); `payments-page-client.tsx:155` keeps reading `.paymentReminder`. i18n es+en, stale
  comment in `contact-seller-button.tsx:9`. Add a utils test that `WHATSAPP_MESSAGE_TOKENS[type]`
  is a superset of `WHATSAPP_REQUIRED_TOKENS[type]` for every type.
- Completion signal: `grep -rn PAYMENT_REMINDER apps packages --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=coverage --exclude-dir=.next`
  shows no file that lacks a matching `ASSISTED_ORDER_LINK` treatment (the Prisma schema and the
  first WhatsApp migration legitimately do not).

### 4.5 Web

- Import rules (cycle guard): `features/checkout` imports `features/customer-auth`, which imports the
  `@/features/orders` barrel; `features/orders` will import `features/assisted-orders`.
  Therefore `features/assisted-orders` imports checkout and orders ONLY by deep path
  (`@/features/checkout/lib/...`, `@/features/checkout/queries/use-delivery-options`,
  `@/features/orders/lib/...`), never through the `@/features/checkout` or `@/features/orders`
  barrels (precedent: `@/features/orders/lib/order-format`).
- PR5 (4.5-a) checkout rules (no new UI): add `computeDeliveryCost`, `isPartialAvailable`,
  `pickupDateBlocking`, `pointsRequiringDate`, `unconfiguredManualMethods`,
  `buildShippingAddressPayload` next to `features/checkout/lib/pickup-availability.ts`;
  write unit tests for each BEFORE moving the code; `CheckoutForm` calls them;
  export through `features/checkout/index.ts`. Existing
  `checkout-form.test.tsx` (800 lines) must pass unchanged. This is a mechanical
  refactor plus new tests, not a guaranteed no-op.
- PR6 (4.5-b) form (B1): `formatPhone()` in `packages/utils/src/phone-country` (tests);
  `buildAssistedOrderSchema` in `packages/validation/src/assisted-order/assisted-order.schema.ts`
  exported from the package index, mirroring `src/checkout/checkout.schema.ts` (real phone
  validation via `validatePhone`; not the checkout schema's `min(1)`; rebuild the package
  before web sees it); `features/assisted-orders/
  {schemas,queries,mutations,components}` (calls via `apiClient.*`, no `api/` folder);
  route `.../[slug]/orders/new/{page.tsx,new-order-page-client.tsx}` (read
  `node_modules/next/dist/docs/` first; copy the sibling page's
  `params: Promise<...>` pattern). Behavior: phone first with `PhoneInput` (+51
  default), formatted review line, lookup hint and alias prefill (wired through
  `aria-describedby`), alias optional, variant + quantity controls (44px targets),
  live total with shipping, delivery via `useDeliveryOptions` (it calls the PUBLIC delivery/pickup/payment endpoints; a PR6 test confirms it
  works for a store the seller owns whether or not it is published) + PR5 rules, payment
  method/type, warning when no methods are configured, total 0 blocked (and 400
  server-side), submit disabled while pending, readable server errors, mobile layout
  (16px inputs, sticky submit, safe-area). i18n es+en for every new key; add the missing parity test
  `apps/web/__tests__/i18n-parity.test.ts` (reads each `packages/i18n/es/*.json`, requires the en
  file, flattens leaf paths, `expect(esKeys).toEqual(enKeys)`; passes today, 0 diffs). Do NOT wire
  the "Nuevo pedido" button yet.
- PR7 (4.5-c) created screen (B2) and button wiring: replace the `alert` stub with
  navigation, delete `newOrderSoon` (es+en). `ConfirmNumberAndOpenWhatsApp` lives in
  `features/assisted-orders/components`, exported via the barrel for
  `features/orders`. Message built from
  `whatsappTemplates.findOne(storeId, "ASSISTED_ORDER_LINK")` (null -> default),
  `buildWhatsAppUrl` (component test asserts the opened URL), confirm dialog "Se enviará a +51 987 654 321. ¿Es correcto?",
  "Corregir número" opens the order detail sheet (PR8 delivers the action; until then
  the sheet is the target and the action is absent), copy with `role="status"`
  confirmation (test: success notice and clipboard-failure fallback) and selectable fallback text, "link shown only here" notice (D-11).
  `accessUrl` used verbatim, rendered as text, in an `href` only if its origin equals
  the app origin; never `dangerouslySetInnerHTML`, never a redirect target; held in
  component state with mutation `gcTime: 0`, never in localStorage/URL/logs.
  `orderRef` in the message uses the existing `shortOrderRef` (no consolidation).
- PR8 (4.5-d) detail actions (B3): `order-detail-sheet.tsx` shows "Pedido asistido" badge,
  creator name, buyer number; actions: send/copy (new link, warns the old one stops),
  regenerate (confirm), correct number (disabled with `aria-describedby` reason when
  opened/claimed); mutations `useRegenerateAccessLink`, `useCorrectBuyerPhone`
  following `use-cancel-order.ts`, reusing the confirm component. Link to customer
  detail only; the "other orders" list is deferred. `Refs #265` (revoked-link page
  belongs to #268).

## 5. PR stack

PR bodies in Spanish (`## Resumen`, `## Verificación`, `Closes/Refs #N`), conventional
titles with the issue number, commit trailer
`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and body footer
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Implementation
happens in scratch worktrees; the user's checkout is never modified. Section 4.5 sub-sections are
labeled 4.5-a (rules refactor), 4.5-b (form), 4.5-c (created screen), 4.5-d (detail actions); each
4.5 sub-section is tagged with its PR number and label.

| PR | Branch | Base | Scope | Refs |
|---|---|---|---|---|
| 0 | `chore/implementation-plan-skill` | main | skill file only | none |
| 1 | `feat/assisted-order-core-extraction` | main | 4.1 | Refs #259 |
| 2 | `feat/assisted-order-create-endpoint` | PR1 | 4.2 (+ `buildOrderAccessUrl`, throttler guard, openapi/orval) | Refs #259, #258 |
| 3 | `feat/assisted-order-link-endpoints` | PR2 | 4.3 | Refs #265 |
| 4 | `feat/assisted-order-whatsapp-template` | PR3 | 4.4 | Refs #264 |
| 5 | `refactor/checkout-delivery-rules` | PR4 | 4.5-a (web only) | none |
| 6 | `feat/assisted-order-new-order-form` | PR5 | 4.5-b (types come from PR2's generated client, inherited through the chain) | Refs #263 |
| 7 | `feat/assisted-order-created-screen` | PR6 | 4.5-c + button wiring (release gate) | Refs #263, #264 |
| 8 | `feat/assisted-order-detail-actions` | PR7 | 4.5-d | Refs #265 |

Every PR from PR2 on is based on the previous PR (one linear chain). `Closes #N` only closes on a
merge into `main`, so keywords are `Refs` everywhere in the stack; the user closes #259, #263 and
#264 after verifying (#264's AC "Corregir número lleva a B3" is only satisfied once PR8 lands;
#263's "button in the list" lands in PR7; #265's revoked-link page belongs to #268; the
other-orders list is deferred; post a comment on #265 saying so).

CI limitation: GitHub CI runs only for PRs targeting `main` (PR0 and PR1). Every other PR
gets no CI until the user has merged its base PR and the PR is retargeted (`git rebase --onto
main <old-base>`, `git push --force-with-lease` (the push is what triggers CI; changing the base
alone does not), `gh pr edit N --base main`). The implementer never merges; the user merges. Therefore each PR body lists the local
verification run, and the implementer runs `scripts/ci/check-openapi-drift.sh` and
`scripts/ci/check-destructive-migrations.sh` (needs `BASE_SHA`/`HEAD_SHA`) locally.
After each retarget wait for green CI and record the first CI run in the PR body before
retargeting the next one. Do not merge anything. Release gate: PR7 (button wiring) must not reach production
before C2 (#268) ships the buyer page, otherwise sellers send links that 404;
state this in the PR7 body. Open mobile stack #232-#237 (#234 touches `review-payment.usecase.ts`,
`schema.prisma`, `openapi.json`, `packages/types`): conflicts in `openapi.json` and
`packages/types/generated` are resolved by regenerating; `schema.prisma` is resolved
by hand, then `pnpm db:generate`.

PR0 is based on `main` and independent of the stack. PR0 verification: the SKILL.md frontmatter has `name` and `description`; `.claude/` is
not ignored (`git check-ignore` returns 1); the skill appears in the Skill listing of a
new session; the file follows the `pr-review` skill's structure. Only
`.claude/skills/implementation-plan/SKILL.md` is committed; `.artifacts/` stays
untracked unless the user asks.

### 5.1 Per-PR verification and must-not-change

| PR | Verify | Must not change |
|---|---|---|
| 0 | frontmatter + `git check-ignore` + new-session listing | any non-skill file |
| 1 | api typecheck; `vitest run src/modules/orders`; `orders.e2e-spec.ts`; zero spec edits | checkout behavior, DTOs, openapi, schema |
| 2 | api typecheck/tests; e2e (create, concurrency, public read); openapi drift; types+web typecheck | checkout paths, `CustomerAccountService`, `upsertStoreContact`, schema |
| 3 | api tests; e2e (rotation, races, isolation); openapi drift | PR2 contracts, checkout, schema |
| 4 | utils + api + web settings tests; migration gate; migrate deploy on seeded DB | existing template types and defaults |
| 5 | new unit tests + unchanged `checkout-form.test.tsx`; web typecheck | checkout behavior and copy, API |
| 6 | web tests (form), i18n parity, axe, manual phone-width check | `CheckoutForm` (only imports its extracted rules), API |
| 7 | web tests (screen, button, WhatsApp URL), i18n parity | API, the form's contract |
| 8 | web tests (sheet actions), i18n parity | API, other sheet sections |

### 5.2 Execution procedure (git and gh)

Per PR n, from the user's checkout root (never modify that checkout):

1. `git fetch origin`; `git worktree add <scratch>/pr<n> -b <branch> <base>` where `<base>` is
   `origin/main` for PR0/PR1 and the previous PR's branch otherwise. Record each PR's tip SHA
   in a notes file (needed as `<old-base>` after a squash merge).
2. PR0 only: `.claude/skills/implementation-plan/SKILL.md` is untracked in the user's checkout,
   so copy it into the PR0 worktree (read-only copy), commit only that file. Verify the listing
   from the worktree session or after merge, and say which in the PR body.
3. Install, `db:generate`, package build (section 7), implement, run the PR's checks (5.1).
4. Commit with the trailer; `git push -u origin <branch>`; write the body to a file with
   `## Resumen` and `## Verificación` (fenced, trimmed output of each command run) and run
   `gh pr create --base <previous-branch-or-main> --head <branch> --title ... --body-file <f>`.
5. When PR(n) changes after review, or is squash-merged: for PR(n+1), PR(n+2), ...
   `git rebase --onto <new tip of PR(n) or origin/main> <recorded old tip of PR(n)>`,
   `git push --force-with-lease`, `gh pr edit --base <new base>`.
6. Retargeting is driven by the user: the user merges PR(n-1) and tells the session; the
   implementer rebases, pushes, runs `gh pr edit --base main`, waits for CI and appends the
   CI link to the body (`gh pr edit --body-file`). Acceptance 7 below is therefore checked by
   the user at merge time.
7. Before PR2 is opened the implementer asks the user to confirm Q4 (D-12 URL path).

### 5.3 Issue bookkeeping (implementer posts with `gh issue comment`; the user closes)

- #259: closed by the user after PR2 merges to main. #258: the A2 leftovers map below; the user
  closes after PR2. #263: after PR7 (the list button) merges. #264: after PR7 and PR8 (the
  "Corregir número" AC is satisfied at PR8). #265: stays open until #268 ships the revoked-link
  page; comment on #265 when PR8 is opened listing the two deferrals (revoked-link page owned by
  #268; "other orders of the same number" list deferred). Comment on #268 (C2) that it must render a
  clear page for a revoked/regenerated token and that PR7 must not reach production before it.
- PR6's body states that the "Nuevo pedido" button is intentionally wired in PR7.

### 5.4 #258 acceptance map (A2 leftovers)

| #258 criterion | Where |
|---|---|
| normalize `987654321`, `987 654 321`, `+51 987 654 321`, `51987654321` | already in main (`phone-country`); implementer confirms a test covers all four, adds if missing |
| rejection: wrong length, letters, non-9 Peruvian mobile | already in main (`validatePhone`); same confirmation |
| documented non-+51 decision | confirm the comment in `phone-country/index.ts`; add if missing |
| upsert Customer without `BuyerAccount` | PR2 (`upsertAssistedCustomer`) + test |
| previous-order count normalizes legacy phones | PR2 test (three phone formats); helper reused from `customers.service.ts` |
| lookup requires AuthGuard + `assertOwnership`, store isolation | already in main (`customers.controller.ts:38`); PR2 adds an isolation test if absent |

## 6. Steps and completion signal

Per PR: create the branch in a scratch worktree from the stated base; do the package
build; implement with tests first where stated; run the PR's verification; regenerate
openapi/orval if DTOs changed; commit; push; open the PR with the local verification
output in the body. Done when the PR's acceptance bullets hold and the output shows the
commands passing.

## 7. Verification (planned; baseline timings from the ops probe, not re-run)

Setup per worktree: `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm db:generate`,
`DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public pnpm turbo run build --filter='./packages/*'`.
Checks: `pnpm --filter api typecheck`, `pnpm --filter web typecheck`,
`pnpm --filter @biasmarket/utils typecheck`, `pnpm --filter @biasmarket/utils test`,
`pnpm --filter @biasmarket/types typecheck`,
`pnpm --filter api exec vitest run src/modules/orders src/modules/whatsapp-templates`,
`pnpm --filter web exec vitest run features/orders features/checkout features/assisted-orders features/store-settings`,
`pnpm lint` on touched packages.
OpenAPI/orval (when DTOs change): `set -a; . scripts/ci/e2e.env.example; set +a;
pnpm --filter api generate:openapi && pnpm --filter @biasmarket/types generate`;
`apps/api/openapi.json` is the full regenerated output (CI diffs it byte for byte after
Prettier); in `packages/types/generated/**` keep only files for the touched tags and
revert the rest (`git checkout -- <paths>`), delete a stray `generated/index.ts`, then
re-run types and web typecheck.
E2E (PR1 `orders.e2e-spec.ts`, PR2, PR3, PR4): own throwaway Postgres on port 55432
(`docker run`, user/db `ci`), `DATABASE_URL=postgresql://ci:ci@localhost:55432/ci` overriding
`scripts/ci/e2e.env.example`, Redis and MinIO as that file requires on non-default ports,
`pnpm --filter @biasmarket/db exec prisma migrate deploy`, then
`pnpm --filter api test:e2e <file>`; remove containers afterwards. New e2e specs sign up
at most a few users per file (better-auth rate limit; `fileParallelism: false`).

## 8. Test matrix

- PR1: all existing orders specs and e2e unchanged and green.
- PR2: success (order, `accessUrl`, token length >= 43 base64url chars, only hash stored);
  empty/invalid phone; qty <= 0; total 0 -> 400; product/variant of another store; stock
  insufficient (no order, stock restored); non-owner 403; foreign/nonexistent store same
  behavior; extra fields (`source`, `createdByUserId`, `customerEmail`, `expiresAt`,
  `storeId`) -> 400; alias too long/control characters; `Customer` upserted, no
  `BuyerAccount`/`CustomerStoreLink`, existing email/emailVerified/name untouched;
  AuditLog metadata and OrderEvent payload contain no digit run of 8+, no token, no alias;
  `CREATED` event; `expiresAt` = `holdWindowHours`; PARTIAL vs FULL; no email sent;
  response headers; created token works on `GET /public/orders/:token`; concurrency:
  checkout-with-email and assisted create for the same store+phone+product in parallel
  finish without 40P01; `previousOrders` counts `+51987654321`, `987654321`,
  `51987654321` legacy rows and never another store's; lookup isolation.
- PR2 extras: `@Throttle`/guard metadata asserted on the route; token byte length >= 32 (43
  base64url chars); "no digit run of 8+" is asserted on the JSON-serialized AuditLog metadata
  and OrderEvent payload; concurrent creates for the same new phone both succeed; the
  checkout-with-email vs assisted-create concurrency test (40P01 probe above) runs against a
  real DB; two users on one IP get separate throttle buckets; wrapped
  `AssistedOrderInvariantError` gives 400; `finalAmount <= 0` -> 400 and stock restored.
- PR3 extras: regenerate returns 409 for CANCELLED status, `paymentStatus` CANCELLED, a hold-status
  order with `expiresAt` in the past (and at exactly now), and 200 for a VERIFIED order with a past
  `expiresAt`; correct-phone with the same phone -> 400; correct-phone onto an existing registered
  Customer links without mutating it; the wrong-number Customer row is left in place (documented), `Order.customerId` is
  non-null after a concurrent create/correct-phone race on the same phone, a deleted-row retry in
  `upsertAssistedCustomer` is unit tested; public response for a VENDOR_ASSISTED order has no alias, creator or email
  fields; stale first-open still receives 200 but stamps nothing.
- PR3 (continued): regenerate kills the old token (generic 404) and the new works; correct-phone
  refused after open or claim, for marketplace, cancelled, expired-but-unswept orders;
  foreign order id and nonexistent id return the same 404 body; two parallel
  regenerates leave exactly one valid token (assert final state, `Promise.all`);
  stale-token first-open racing a rotation leaves `linkFirstOpenedAt` null and no
  LINK_OPENED event; correct-phone vs first-open race (either order is consistent);
  invariant error -> 400; no numbers/tokens in AuditLog/event.
- PR4: template CRUD accepts the new type, rejects unknown; token substitution; clean
  greeting with/without alias; URL encoding; migration applies on a seeded DB
  (`prisma migrate deploy`) and the old release's insert/read still works.
- PR5: new unit tests per function, checkout test file unchanged and green.
- PR6-8: component tests with `renderWithProviders`: invalid phone error, formatted
  review line, lookup hint and alias prefill, alias optional label, total 0 blocked,
  submit disabled while pending, server error shown, confirm-dialog text, clipboard
  failure fallback, regenerate confirm, correct-number disabled reason, es+en key parity
  for new keys; mobile viewport via `setViewport()`; axe check on the form; manual check on a phone-width
  browser is also required (listed in the PR body) because jsdom cannot prove "funciona bien en
  celular"; the axe-core stack trace printed by the web run is noise, not a failure.
- Reviewer mutation check (pass = the suite fails when the guard is removed): first-open
  hash filter, 409 open/claim guard, `storeId` in update `where`, name-only-if-null.

## 9. Risks and rollback

- Checkout regression (PR1, PR5): zero-edit spec rule; revert is a plain revert.
- Lock-order deadlock: removed by design + concurrency test.
- Orphan links before C2: release gate on PR7; PR8 `Refs #265`.
- PII: the seller sees the buyer's full phone by design; never in AuditLog/OrderEvent/
  logs; `accessUrl` only in create/regenerate/correct responses with `no-store`;
  Caddy access logs of `/public/orders/:token` are not covered by the API scrubber
  (follow-up check in `infra/`).
- Throttle: seller routes keyed per user; the existing IP-keyed public limits are
  effectively global (pre-existing, follow-up issue for `trust proxy`).
- Double submit creates two orders and two soft holds (accepted; button disabled).
- PR2/PR3 rollback: code revert leaves VENDOR_ASSISTED orders and live tokens in the
  DB; old code reads them (public route is the only token consumer and stays) and the
  columns are additive, so this is tolerated. PR4 migration is additive and
  irreversible; harmless.
- Assisted orders expire and release stock like checkout. Between `expiresAt` and the next sweep
  the buyer page still shows payment details while seller regenerate returns 409 (accepted lag).
- The full delivery address is visible to anyone holding the link, as in checkout today.
- Wrong-number typo leaves a permanent Customer row (accepted; follow-up issue above).

## 10. Acceptance criteria

1. `POST /stores/:id/orders/assisted` creates an order with `source=VENDOR_ASSISTED`,
   returns `accessUrl` once, stores only the token hash, and the token works on
   `GET /public/orders/:token`.
2. No `BuyerAccount`/`CustomerStoreLink` is created or changed, no email is sent.
3. All pre-existing checkout specs pass unedited after PR1 and PR5.
4. Regenerate/correct-phone behave per 4.3, including races.
5. The seller can open the buyer chat or copy the message after confirming the number;
   an empty alias gives a clean greeting.
6. No store can read or write another store's order, customer, or contact.
7. `check-openapi-drift.sh`, typecheck, lint and the listed tests pass locally for
   each PR; PR0 and PR1 show no failing GitHub checks (CI is path-filtered, PR0 may run none), and
   every later PR passes CI after retarget (checked by the user at merge time).

### 10.1 Per-PR acceptance (what "done" means in section 6)

- PR1: no spec edits; core functions exported; checkout unchanged.
- PR2: criteria 1, 2, 6 plus the PR2 test matrix.
- PR3: criterion 4 plus the PR3 matrix.
- PR4: the type is accepted by the API and editable in settings; default message renders a clean
  greeting; migration gate rc 0; `grep PAYMENT_REMINDER` signal clean.
- PR5: unit tests for each extracted rule; checkout test file unchanged.
- PR6: #263 ACs except the list button: phone first with +51 default and error, formatted review
  line, lookup hint + alias prefill, alias optional, variants + quantity + live total with
  shipping, delivery fields, payment method/type and no-methods warning, total 0 blocked,
  submit disabled while pending, readable server errors, es+en keys, mobile.
- PR7: #264 ACs: wa.me URL assertion, number confirmation, copy notice + fallback, "link shown
  only here" notice, clean greeting, third template editable in settings; "Nuevo pedido" button
  navigates to the form.
- PR8: #265 ACs: badge/creator/buyer number, always-available send/copy with the new-link
  warning, regenerate with confirm, correct-number disabled with reason once opened/claimed.
  Section 8 lists a component test for each (the PR6-8 bullet is the minimum, extended by
  these).

### 10.2 Deferrals (explicit)

#265 revoked-link page (to #268); #265 "other orders of the same number" list; #264 "Corregir
número" is fully satisfied only at PR8; order-ref length consolidation; idempotency key;
`trust proxy`; orval version pin.

## 11. Open questions (default used if unanswered)

- Q1 Buyer page missing: hold PR7 release until #268 [default: hold; no flag].
- Q2 D-05 deposit rule [per payment method, as checkout].
- Q3 D-10 expiry [store `holdWindowHours`].
- Q4 D-12 URL path [`${WEB_URL}/es/store/{slug}/pedido/{token}`, single helper; the wiki Decisiones
  page was not available to this plan, so the implementer asks the user to confirm before opening PR2].
- Q5 Order reference length (4 vs 6) [do not consolidate now].
- Q6 Idempotency key [out of scope].
- Q7 Stack base [`main`; the follow-up branch already merged as #322].
