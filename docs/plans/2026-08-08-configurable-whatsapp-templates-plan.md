# Configurable per-store WhatsApp message templates

Written before execution, at the user's explicit request, to allow a review pass
before code is written (deviates from this directory's normal "record after the
work lands" convention — see `docs/plans/README.md`).

## Context

Full read of `packages/utils/src/whatsapp/index.ts` (115 lines) confirms: every
WhatsApp message this codebase sends is a **hardcoded Spanish string template**,
with no per-store configuration surface anywhere:

- `buildWhatsAppOrderMessage` (lines 46-84) — the seller-facing "new order"
  message, built from `WhatsAppOrderInput` (order id, store name, items, total,
  delivery/pickup info, payment method, customer name/phone). Labels
  (`DELIVERY_METHOD_LABELS`, `PAYMENT_METHOD_LABELS`, lines 21-31) are inline
  literals.
- `buildWhatsAppPaymentReminderMessage` (lines 94-107) — separate hardcoded
  template for payment-reminder nudges.
- `buildWhatsAppUrl` (lines 109-115) — just builds the `wa.me` link, stays
  as-is, not a templating concern.
- Call site: `create-order.usecase.ts:357-374` calls `buildWhatsAppOrderMessage`
  with real order data, only `if (store.whatsappNumber)` is set (line 357).
- `Store.locale` exists (`schema.prisma:35`, default `"es"`) but is currently
  unedited/unsurfaced — see
  `2026-08-08-store-socials-and-locale-settings-plan.md`, which makes it a real,
  editable field. **This plan depends on that field being meaningful** (a
  per-store default language to pick the right template variant) but does not
  itself need that sibling plan to land first — if `locale` isn't editable yet,
  this plan can still ship with a single-language default template per store,
  and locale-variant selection becomes a small follow-up once the field is
  wired.
- The user's own framing: "some of this messages have some requirements tho eg
  when a customer buying should always mention products, probably we should use
  some templating to help them do their messages" — i.e. sellers get to
  customize wording, but **required variables must stay required** (a seller
  can't accidentally build a message that omits the order reference or product
  list).

## Decision: template model

New per-store, per-message-type template rows, not a single freeform text blob
per store (a seller needs different required-variable sets for different message
types):

```prisma
model WhatsAppMessageTemplate {
  id        String   @id @default(cuid())
  storeId   String
  type      WhatsAppMessageType
  template  String   // e.g. "Hola {{customerName}}, tu pedido {{orderRef}} en {{storeName}} ..."
  updatedAt DateTime @updatedAt

  store Store @relation(fields: [storeId], references: [id])

  @@unique([storeId, type])
}

enum WhatsAppMessageType {
  NEW_ORDER
  PAYMENT_REMINDER
  // ORDER_INQUIRY intentionally not included in this pass — see "Scope
  // simplification" below.
}
```

**Required-variable enforcement**: define, per `WhatsAppMessageType`, a fixed
list of variable tokens that must appear in the saved template (e.g. `NEW_ORDER`
requires `{{orderRef}}` and `{{items}}` at minimum — matching the user's
explicit "should always mention products" requirement). Validate this
**server-side** on save (reject a template missing a required token, return
which ones are missing) — don't rely on client-side validation alone for
something that breaks a real business message if wrong.

**No store row = fall back to the current hardcoded default.** Don't require a
migration to backfill every existing store with a template row — treat
`WhatsAppMessageTemplate` as an override; `buildWhatsAppOrderMessage`'s current
hardcoded strings become the **default template content** for a store with no
override row. This keeps the change additive and low-risk — every existing store
keeps working identically until a seller opts in by editing their template.

## Scope simplification: ship `NEW_ORDER`/`PAYMENT_REMINDER` only, defer `ORDER_INQUIRY`

Drop `ORDER_INQUIRY` from this pass. It would require a new **public**
(buyer-facing, unauthenticated) read endpoint for a type that has no real
consumer yet — `2026-08-08-buyer-mini-dashboard-plan.md` already ships a working
hardcoded fallback message specifically to avoid depending on this plan, so
there's no blocked feature waiting on `ORDER_INQUIRY`. Add it as a small,
self-contained follow-up once the mini-dashboard's "contact seller" button is
real and a seller actually asks to customize that message — building the public
endpoint speculatively now is exactly the kind of scope creep this batch of
plans should avoid. `WhatsAppMessageType` still only needs
`NEW_ORDER | PAYMENT_REMINDER` for this plan.

## Backend changes

1. Prisma migration: `WhatsAppMessageTemplate` + `WhatsAppMessageType` enum
   (`NEW_ORDER | PAYMENT_REMINDER` — see scope simplification above).
2. New module `apps/api/src/modules/whatsapp-templates/` (or fold into `stores`
   — decide during implementation; this is small enough either way) —
   seller-only CRUD: `GET/PUT stores/:storeId/whatsapp-templates/:type`,
   `AuthGuard` + `assertOwnership`. `PUT` validates required-variable presence
   per type (see above) before saving.
3. **Rework `buildWhatsAppOrderMessage`/`buildWhatsAppPaymentReminderMessage`
   into a template-rendering function**: given a `WhatsAppMessageType`, an
   optional stored `template` string (or `null` → use the existing hardcoded
   string as the default), and the same input data these functions already take,
   substitute `{{token}}` placeholders. Keep the **existing exported function
   names and signatures working as pure fallback-to-default calls** (i.e.
   `buildWhatsAppOrderMessage(input)` with no template = today's exact output) —
   this is a `packages/utils` function used from `create-order.usecase.ts`,
   changing its signature incompatibly would break that call site; add the new
   templated path as an additional parameter or a new exported function, don't
   silently change behavior for existing callers. **Validation and substitution
   must share one tokenizer, not two independently-written regexes.** Write a
   single `extractTokens(template)` (or equivalent) used by both the required-
   variable validator (item 2) and the substitution step — if the two are
   implemented separately with even slightly different token-matching rules
   (e.g. one tolerates `{{ orderRef }}` with spaces, the other doesn't), a
   template can pass validation and still render with a literal, unsubstituted
   `{{orderRef}}` left in the real message sent to a customer, which is exactly
   the failure mode this plan exists to prevent. Also decide explicitly (don't
   leave to implementation-time improvisation): an unrecognized token like
   `{{fooBar}}` in a saved template is left literal in the output, not silently
   stripped — a seller who mistypes a token should see the mistake in their own
   sent message, not have it vanish. And cap `template` length server-side
   (`@MaxLength`, e.g. 1000 chars) — seller-authored prose plus a full itemized
   order could otherwise exceed practical `wa.me`/mobile deep-link URL limits
   and silently fail to open WhatsApp.
4. `create-order.usecase.ts:357-374` — look up the store's `NEW_ORDER` template
   (if any) before calling the message builder, pass it through.
5. **`PAYMENT_REMINDER` has a second call site this plan must not miss**:
   `buildWhatsAppPaymentReminderMessage` is also called **client-side** from
   `apps/web/app/[locale]/(dashboard)/dashboard/[slug]/payments/payments-page-client.tsx:83`
   (browser code, not just the API). A `PAYMENT_REMINDER` template a seller
   saves has no effect at all unless this call site is also updated to fetch the
   seller's stored template (via the endpoint from item 2) and pass it into the
   builder — without this, sellers can edit a template that silently never takes
   effect. Add `payments-page-client.tsx` to "Files likely touched" below.
6. Regenerate OpenAPI + Orval client.
7. **Local-dev note**: `packages/utils` has no watch/dev script and
   `apps/api`/`apps/web` consume its built `dist/*/index.js` output, not `src/`
   directly — editing `packages/utils/src/whatsapp/index.ts` during `pnpm dev`
   won't be picked up until `packages/utils` is rebuilt. Not a design concern,
   just worth knowing so implementation isn't confused by "my change to the
   builder function isn't showing up."

## Frontend changes

1. **New settings tab**: per the user's explicit ask ("a new tab in the sidebar
   with default message, the user can send/the admin can set").
   `apps/web/app/[locale]/(dashboard)/dashboard/[slug]/settings/settings-page-client.tsx`
   currently has no tab/nav abstraction — it's stacked `SectionCard`s in two
   columns (`ProfileSection`, `AppearanceSection`, `PaymentsSection` /
   `DeliverySection`, `DefaultsSection`, `NotificationsSection`, lines 61-73).
   Adding a genuine sidebar-tab pattern here is a bigger UI change than this
   plan should absorb — **recommendation: add a new `WhatsAppMessagesSection` as
   a seventh `SectionCard`** (consistent with the existing "stacked cards"
   pattern, not a new nav paradigm), not a literal new sidebar tab, unless the
   user specifically wants the settings page restructured into real tabs (that's
   a bigger, separate UI decision — flag back if so, don't take it on silently
   here).
2. New
   `apps/web/features/store-settings/components/whatsapp-messages-section.tsx`:
   one editable template textarea per `WhatsAppMessageType`, showing available
   variable tokens (`{{orderRef}}`, `{{storeName}}`, etc.) as inline hints, a
   live preview rendered with placeholder sample data, and surfacing the
   backend's required-variable validation errors inline.
3. i18n: new copy for the section, variable-hint labels, validation messages.

## Non-goals

- Not building a generic templating language (no conditionals/loops) — simple
  `{{token}}` substitution only, matching the scope of what these messages
  actually need (a handful of flat variables, no per-item loop beyond what
  `buildWhatsAppOrderMessage` already hand-builds for the items list — keep the
  items list itself as one pre-rendered `{{items}}` block, not a nested per-item
  template).
- Not building multi-locale template variants in this pass (one template per
  type per store, not per type per store per locale) — `Store.locale` becoming
  editable (sibling plan) informs _which_ language a seller probably wants to
  write in, not multiple stored variants. Revisit if a real multi-language-store
  need shows up.
- Not touching `buildWhatsAppUrl` itself.

## Files likely touched

- `packages/db/prisma/schema.prisma` + migration
- `packages/utils/src/whatsapp/index.ts` (template-rendering rework)
- New `apps/api/src/modules/whatsapp-templates/` (or extend `stores`)
- `apps/api/src/modules/orders/application/create-order.usecase.ts`
- `apps/web/app/[locale]/(dashboard)/dashboard/[slug]/payments/payments-page-client.tsx`
  (the `PAYMENT_REMINDER` client-side call site — easy to miss, see Backend
  changes item 5)
- `apps/web/features/store-settings/` (new section + settings-page-client.tsx)
- `apps/web/app/[locale]/(dashboard)/dashboard/[slug]/settings/settings-page-client.tsx`
- `apps/api/openapi.json` + `packages/types/generated/**`
- **Coordinate with** `2026-08-08-store-socials-and-locale-settings-plan.md`
  (`Store.locale`). `2026-08-08-buyer-mini-dashboard-plan.md`'s hardcoded
  fallback message needs no coordination now that `ORDER_INQUIRY` is deferred —
  see "Scope simplification" above.

## Verification

- Unit tests: template-rendering function (token substitution, missing- token
  validation, default-fallback-when-no-override behavior).
- e2e: create an order for a store with a custom `NEW_ORDER` template, confirm
  the seller-bound WhatsApp URL contains the customized message, not the
  hardcoded default; confirm a store with no override still gets today's exact
  default string (regression check — extend whatever test already covers
  `buildWhatsAppOrderMessage`'s output).
- Manual: attempt to save a `NEW_ORDER` template missing `{{orderRef}}`, confirm
  the save is rejected with a clear error.
- `pnpm --filter api test`, `pnpm typecheck`.

## Definition of done

A seller can edit the wording of their store's WhatsApp order/reminder/ inquiry
messages from Settings, with required-variable validation preventing a message
that drops critical info (order reference, products); stores that never touch
this keep getting today's exact default messages, unchanged.

## Execution notes

Landed on `feat/configurable-whatsapp-templates` (branched from
`feat/payment-method-logos`). Plan was written as a review-first doc before
code, so these notes record what actually shipped against the original proposal.

### Prisma

- `WhatsAppMessageType` enum (`NEW_ORDER`, `PAYMENT_REMINDER`; no
  `ORDER_INQUIRY`, per the scope simplification) + `WhatsAppMessageTemplate`
  model with `@@unique([storeId, type])` and a `storeId` index.
- Migration `20260809202116_add_whatsapp_message_templates`, applied to the
  local dev DB (`prisma migrate status` clean afterwards).

### utils (`packages/utils/src/whatsapp/index.ts`)

- Single tokenizer: `createTokenRegex()` is a **factory** returning a fresh
  global regex; both `extractTokens` and `renderWhatsAppTemplate` call it, so
  the validation/substitution "one tokenizer, two regexes" risk is structurally
  impossible (the factory also avoids `lastIndex` state bleed between the two
  passes).
- `WHATSAPP_REQUIRED_TOKENS`: `NEW_ORDER → [orderRef, items]`,
  `PAYMENT_REMINDER → [orderRef, pendingAmount]`. (This doc says "define a fixed
  list per type" without pinning the reminder's list; the plan's earlier draft
  required `pendingAmount` for the reminder, and that posture was kept — a
  reminder that names the order but not the amount is arguably useless.)
- `WHATSAPP_MESSAGE_TOKENS` added (superset of required) for the settings UI's
  inline variable chips.
- `buildWhatsAppOrderMessage` / `buildWhatsAppPaymentReminderMessage` keep their
  exact old signatures; the optional `template` arg falls back to the previous
  hardcoded output when null/blank. Unknown tokens render literally.
- `buildWhatsAppUrl` untouched.

### API (`apps/api/src/modules/whatsapp-templates/`)

- New flat module: `GET/PUT stores/:storeId/whatsapp-templates/:type`,
  `AuthGuard`, per-request `assertOwnership` (404 unknown store, 403 non-owner —
  same helpers shape as the other CRUD modules).
- `parseType()` validates the `type` param against the enum in the service
  (rejects `ORDER_INQUIRY` with 400 — the plan explicitly defers it).
- Validation on save: `getMissingRequiredTokens` → 400 naming the missing
  `{{tokens}}`; `@MaxLength(1000)` on the DTO (enforced by main.ts's global
  ValidationPipe — note e2e boots `AppModule` without that pipe, so the length
  cap is covered by the DTO/OpenAPI, not the e2e spec).
- `findUnique` on a store with no override returns `null`; Nest's express
  adapter serializes `null` as an empty body (`isNil → response.send()`). The
  Orval `customFetch` keeps `data` undefined for empty bodies, which the web
  layer already treats as "no override" — verified explicitly by an e2e test.

### create-order.usecase.ts + a pre-existing bug this surfaced

- The use case now reads the store's `NEW_ORDER` template and passes it into
  `buildWhatsAppOrderMessage`; null → today's exact default path.
- **Unrelated pre-existing bug fixed along the way**: the stock-reservation
  `$queryRaw` UPDATE referenced camelCase columns **unquoted**
  (`"ProductVariant".productId`, `"Product".storeId`). Postgres folds unquoted
  identifiers to lowercase, so checkout threw `ColumnNotFound` — the existing
  `orders.e2e-spec.ts` checkout tests were already failing on this before this
  branch. Both references are now quoted (`"ProductVariant"."productId"`,
  `"Product"."storeId"`), and the unit-test string assertion was updated to
  match. This was required to get the plan's "custom template flows into
  checkout" e2e verification runnable.

### Web / client-side

- Settings: new `WhatsApp messages` section (`whatsapp-messages-section.tsx`)
  with a textarea per type, clickable variable-token chips (from
  `WHATSAPP_MESSAGE_TOKENS`), a live preview rendered with placeholder sample
  data, and inline required-variable validation. Wired via
  `use-whatsapp-templates.ts` / `use-save-whatsapp-template.ts` through the
  generated client.
- `payments-page-client.tsx:83` (the plan's flagged `PAYMENT_REMINDER` client
  call site) now fetches the store's saved template and passes it into the
  builder — fixing only the server side would have left the dashboard reminder
  permanently hardcoded.

### OpenAPI / generated client

- `pnpm --filter api generate:openapi` +
  `pnpm --filter @biasmarket/types
  generate`, then rebuilt `packages/types`;
  `apiClient.whatsappTemplates` registered in `apps/web/lib/api-client.ts`.

### Tests

- utils: tokenizer / required-token validation / substitution / default-fallback
  cases (exact default-string regression).
- api unit: `whatsapp-templates` service + controller specs (6 + 3 tests).
- api e2e (`whatsapp-templates.e2e-spec.ts`, 8 tests): empty-body no-override,
  400 for missing required tokens (both types) and for the deferred
  `ORDER_INQUIRY`, 403 non-owner, save+GET schema-valid, and the two checkout
  flows — custom template renders in the seller-bound WhatsApp URL, and a store
  with no override still gets today's exact default message.
- Full suites: `pnpm --filter api test` 393/393, root `pnpm typecheck` 11/11.
  e2e suite: 50/54 — the 4 remaining failures are all `ECONNREFUSED :9000`
  (MinIO not running locally) on logo/payment-proof upload tests, pre-existing
  and unrelated.
