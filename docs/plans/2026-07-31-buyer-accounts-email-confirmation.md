# Buyer accounts + email confirmation on checkout

## Context

Bias Market had two account types, both via better-auth on the `User` model:
`seller` (default role) and `admin` (better-auth admin plugin). Buyers were
fully anonymous — checkout (`POST /stores/:slug/checkout`) is `@Public()`,
collects name/phone/optional-email inline, creates an `Order`, and redirects to
WhatsApp. `Order.customerId` existed but was never populated.

A `Customer` model already existed (`packages/db/prisma/schema.prisma`) matching
the buyer-auth design sketched in `docs/core/security-payments.md` §7 —
per-store, phone+password, `passwordHash` required — but nothing created or read
it; it was schema-only.

Asked for: a third account type — buyer accounts — so that when someone adds to
cart and checks out, they get an email confirming their account, and can later
check their purchase status. Requirement, confirmed with the requester: checkout
must stay exactly as seamless as today (no new required fields, no blocking the
WhatsApp handoff); the email confirms the **account**, once — not a blocking
per-order gate; the account is created inline at checkout, transparently, no
separate signup step or password prompt.

## What changed

**Data model**: extended `Customer` (`packages/db/prisma/schema.prisma`) — added
`email String?`, `emailVerified Boolean @default(false)`, and made
`passwordHash` nullable (was required; accounts are now sometimes
auto-provisioned at checkout with no password set). No new tables — the
confirmation link is a stateless signed token (see below), not a DB-backed
verification row, so there's no cleanup job to run. Migration:
`packages/db/prisma/migrations/20260731151214_customer_email_verification/`.

**Confirmation token**:
`apps/api/src/modules/orders/application/customer-account-token.ts` — pure
`createCustomerAccountToken`/`verifyCustomerAccountToken` functions. Payload
`${customerId}.${expiresAtEpochMs}`, base64url-encoded, HMAC-SHA256 signed with
the existing `BETTER_AUTH_SECRET` (no new env var), 30-day expiry, timing-safe
signature comparison. Verification is idempotent — re-clicking an
already-consumed link just re-shows order status rather than erroring, so the
same link doubles as a long-lived "check my order" bookmark.

**Account service**: new
`apps/api/src/modules/orders/application/customer-account.service.ts`
(`CustomerAccountService`):

- `findOrCreateCustomer(tx, storeId, phone, email, name)` — looks up by
  `(storeId, phone)` (the existing unique constraint) within the same Prisma
  transaction as order creation (`tx`, not the bare `PrismaService`), so a
  failed checkout rolls back any customer create/update too. New phone →
  creates unverified. Existing phone with a **different** email → returns
  `customer: null` and does **not** touch the existing row at all — an
  unauthenticated checkout request can't repoint or re-verify someone else's
  account just by knowing their phone number (fixed post-launch, see
  `2026-07-31-review-fixes-and-prod-reset.md`); the order falls back to a
  guest order in that case. Existing phone with matching, already-verified
  email → no-op, no re-send (avoids spamming repeat buyers). Matching but
  unverified email → re-sends (same claimed identity, no risk).
- `sendVerificationEmail(customer, store)` — bilingual ES/EN inline HTML
  (matching the existing `buildVerificationEmailHtml` style in
  `auth.config.ts`), link points at
  `${WEB_URL}/store/:slug/account/confirm?token=...`. Wrapped in try/catch +
  `Logger.error`, same fire-and-forget pattern as `review-payment.usecase.ts`'s
  buyer notification — a mail failure never blocks or fails the checkout
  response.
- `confirmAccount(storeSlug, token)` — verifies the token, loads and
  store-scopes the `Customer`, flips `emailVerified` if not already set, returns
  the customer's orders for that store (most recent first).

**Checkout wiring**: `create-order.usecase.ts` gained a `CustomerAccountService`
dependency. Only when `dto.customerEmail` is present: resolves/creates the
`Customer` _before_ the order transaction, passes `customerId` into
`tx.order.create`, then — after the transaction and the WhatsApp URL are built —
awaits `sendVerificationEmail` if the account is new/unverified. When no email
is given, behavior is byte-for-byte unchanged (fully guest order, `customerId`
stays `undefined`).

**New endpoint**:
`apps/api/src/modules/orders/infrastructure/customer-account.controller.ts` —
`@Public() GET /stores/:slug/account/confirm?token=`, thin wrapper over
`CustomerAccountService.confirmAccount`. Registered alongside the existing
`CheckoutController`/`OrderController` in `orders.module.ts`.

**Frontend**: new page
`apps/web/app/[locale]/(storefront)/store/[slug]/account/confirm/page.tsx` —
reads `?token=`, calls the confirm endpoint, renders a loading state, an
"invalid/expired link" state, or the confirmed view (order list with status
badge, total, date). Checkout page (`.../store/[slug]/checkout/page.tsx`) gained
one line on the post-submit screen — `checkEmailNotice` — shown only when
`customerEmail` was provided.

**i18n**: `packages/i18n/{es,en}/storefront.json` — new
`checkoutPage.checkEmailNotice` key, and a new `accountConfirmPage` block
(title/loading/error copy, order-status labels mirroring the wording already
used in `dashboard.json`'s `orders.status.*`, kept separate rather than shared
since it's a distinct buyer-facing namespace). Rebuilt `packages/i18n/dist/`
(`pnpm --filter @biasmarket/i18n build`) since `apps/web/i18n/request.ts`
imports the built package, not the source JSON.

**Pre-existing test fix (unrelated, found while running the suite)**:
`review-payment.usecase.spec.ts` was missing a `MailerService` provider — broken
on `main` already (confirmed via `git stash`), from an earlier commit that added
`MailerService` to `ReviewPaymentUseCase` without updating this spec. One-line
fix (added the provider stub) so `pnpm --filter api test` is green.

## Explicitly out of scope

- No buyer login/password UI, no session system for `Customer`. The signed link
  is the only access mechanism for now — `passwordHash` stays on the model
  (nullable) for a future login feature, but nothing sets or reads it in this
  change.
- No blocking of checkout/order progression on email verification — orders
  proceed to `PENDING_PAYMENT` and the WhatsApp handoff exactly as before.
- No changes to the `PaymentStatus`/`FulfillmentStatus` state machine.

## Verification

- `pnpm --filter api exec vitest run` — 169/169 passing, including new
  `customer-account-token.spec.ts` (4 tests: round-trip, wrong secret,
  malformed, expired) and `customer-account.service.spec.ts` (9 tests:
  find-or-create branches, mailer-failure-never-throws, confirm-account
  happy/error paths), plus 3 new cases added to `create-order.usecase.spec.ts`
  covering the email/no-email branches.
- `pnpm exec tsc --noEmit` clean in `apps/api`;
  `pnpm turbo run typecheck
  --filter=web --filter=@biasmarket/i18n --filter=@biasmarket/db`
  clean.
- `apps/web` vitest suite passing (pre-existing 1 test, unaffected).
- Live end-to-end smoke test: ran `pnpm --filter api dev` +
  `pnpm --filter web dev` against the local seeded DB, `curl`'d
  `POST /stores/demo-tienda-de-camila/checkout` with an email — order came back
  with `customerId` set, a real HTML file appeared under `apps/api/.mailer-dev/`
  (driver `MAIL_DRIVER=file`) with the correct confirm link; hit that link's
  token against `GET /stores/demo-tienda-de-camila/account/confirm` — got back
  the customer + their one order; confirmed in Postgres that
  `Customer.emailVerified` flipped to `true` and `passwordHash` stayed
  empty/null. Confirm page (`/store/.../account/confirm?token=...`) returns 200
  server-side.

## Follow-up

- No buyer login exists yet — if a persistent-session buyer login is wanted
  later, `Customer.passwordHash` is already there (nullable) to build on.
- `MAIL_DRIVER=file`/dev-only smoke test above; not verified against a real
  Resend send in this session (would need `MAIL_DRIVER=resend` + a real inbox to
  fully confirm production delivery).
