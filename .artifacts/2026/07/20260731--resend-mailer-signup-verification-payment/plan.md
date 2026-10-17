# Resend mailer, signup email verification, payment status emails

## Context

Bias Market had zero email infra — no Resend, no mailer module, a documented gap
noted in earlier plans (`2026-07-22-contact-page-cal-com-admin-inquiries.md`,
`2026-07-22-session-recap-and-gaps.md`). User supplied a real Resend API key and
asked to wire it up. Two passes:

1. Infra only — a working `MailerService` plus a safe dev-mode default so
   `pnpm dev` never fires real email.
2. Wire it into "core workflows" — user's example was account creation; asked to
   research others. `docs/core/roadmap.md` converges on exactly two MVP email
   use cases ("signup, payment status") — everything else (order confirmation,
   fulfillment-status emails, low-stock digest, contact-form emails) is
   explicitly flagged post-MVP across `docs/core/architecture.md`,
   `docs/core/i18n.md`, and prior plan docs. Scoped to those two, confirmed with
   the user via AskUserQuestion before building — including the choice of **real
   email verification** (blocks sign-in until the link is clicked) over a no-op
   welcome email, since that's a bigger change (needs a new `apps/web` route).

**Security note**: the real `RESEND_API_KEY` was pasted in plaintext chat —
flagged to the user to rotate it in the Resend dashboard afterward.

## 1. Mailer infra (`apps/api/src/mailer/`)

- `mailer.core.ts` (plain class, no decorators) + `mailer.service.ts`
  (`@Injectable()` shim) — split because this repo's ops scripts
  (`apps/api/scripts/*.ts`) run via bare `node scripts/x.ts` with Node's native
  TS stripping, which rejects class decorators outright.
- `requiredEnv()` pattern copied from `storage.service.ts` — no `@nestjs/config`
  anywhere in this repo.
- `MAIL_DRIVER` env var (`'file' | 'resend'`), **not** `NODE_ENV` sniffing —
  `NODE_ENV` is never set for bare `pnpm dev`. Fails closed to `'file'`.
- Dev mode = letter_opener equivalent: writes outgoing email as `.html` to
  gitignored `apps/api/.mailer-dev/` instead of sending — zero new infra (no
  SMTP server, no Mailpit/MailHog).
- `apps/api/scripts/send-test-email.ts` + `pnpm --filter api run mail:test` —
  smoke-test script, matching the existing `create-admin.ts`/`backfill-*.ts`
  convention (a script, not a permanent HTTP endpoint).
- `MailerModule` is `@Global()`, same shape as `StorageModule`/`PrismaModule` —
  injectable anywhere with no explicit import.
- Env plumbing: `infra/docker/.env.example` + `scripts/init-env.ts` (forces
  `MAIL_DRIVER=resend` in prod, flags `RESEND_API_KEY`/`RESEND_FROM_EMAIL` as
  needing manual entry on the server — can't be auto-generated like
  `S3_ACCESS_KEY`). `biasmarket.com` was already verified in Resend, so
  `RESEND_FROM_EMAIL` defaults to a real `no-reply@biasmarket.com`, not the
  sandbox sender.
- Verified live: dev-mode file drop, and a real send through Resend to the
  user's own inbox (message id confirmed).

## 2. Signup → real email verification (`apps/api/src/auth/`)

- `createAuth(prisma, mailer)` — `MailerService` threaded in via
  `auth.module.ts`'s `BetterAuthModule.forRootAsync` `inject` array.
- `emailAndPassword.requireEmailVerification: true` +
  `emailVerification.sendVerificationEmail` — bilingual (ES/EN stacked, no
  i18n-package templating since backend localization is explicitly out of scope
  for MVP per `docs/core/i18n.md`) inline HTML.
- Confirmed `requireEmailVerification` implicitly enables send-on-signup
  (better-auth: `sendOnSignUp ?? requireEmailVerification`, read from
  `node_modules/better-auth`'s `sign-up.mjs`) — no extra flag needed.
- Confirmed seeded/admin accounts unaffected: `scripts/seed/helpers.ts` and
  `scripts/create-admin.ts` already set `emailVerified: true` directly.
- better-auth's sign-up response when verification is required is
  `{ token: null, user }` (no session/cookie) — read directly from
  `sign-up.mjs`'s `shouldSkipAutoSignIn` branch.

## 3. Frontend signup flow (`apps/web`)

- `app/[locale]/(onboarding)/onboarding/page.tsx`: passes an **absolute**
  `callbackURL` (`${window.location.origin}/${locale}/verify-email`) — a
  relative one would resolve against the API's own origin, not the web app.
  Branches on `data.token === null` → shows an inline "check your email" message
  in place of the form instead of redirecting to `/onboarding/create-store`.
- New `app/[locale]/(onboarding)/verify-email/page.tsx`: async server component,
  awaits `searchParams` (Next 16 — checked
  `node_modules/next/dist/docs/.../page.md` per `apps/web/AGENTS.md`'s warning
  that this Next version differs from training data). No `error` param → success
  card + link to `/login`. `error` param present (better-auth redirects with
  `?error=<CODE>` on failure, e.g. `TOKEN_EXPIRED`) → failure card + link back
  to `/onboarding`.
- No route-protection changes needed — `apps/web/proxy.ts` is next-intl's locale
  middleware only, no auth-gating middleware exists in this app.
- New i18n keys in the existing `onboarding` namespace
  (`packages/i18n/{en,es}/onboarding.json`): `signup.checkEmailTitle/Body`,
  `verifyEmail.{successTitle,successBody,errorTitle,errorBody,backToLogin,signUpAgain}`.

## 4. Payment status email (`review-payment.usecase.ts`)

- `MailerService` injected alongside the existing `PrismaService`/
  `OrderRepository`/`NotificationsService`.
- After the `$transaction` resolves (not inside it — don't hold a DB transaction
  open for a network call), sends a bilingual approved/rejected email to
  `row.customerEmail` if set (it's nullable — checkout already treats it as
  optional, falling back to WhatsApp).
- Wrapped in try/catch, logged on failure, **never rethrown** — a Resend hiccup
  must not fail the payment-review action itself.
- Deliberately **not** wired into `OrderController.addPayment` (which sets
  `paymentStatus` directly, bypassing this use case) — kept to exactly the
  approve/reject action the user selected, not every `paymentStatus` writer.

## Verification

- `pnpm --filter api typecheck` / `pnpm --filter web typecheck`: clean.
- Live smoke test against the running dev stack (`MAIL_DRIVER=file`):
  - Signed up a fresh user via `curl POST /api/auth/sign-up/email` →
    `{"token":null,...}`, verification email written to `.mailer-dev/`.
  - `curl POST /api/auth/sign-in/email` for that user →
    `403
    EMAIL_NOT_VERIFIED`.
  - Followed the token link from the written email → `302` redirect,
    `emailVerified: true` afterward, sign-in then succeeds.
  - Seeded fixtures (`pnpm run seed:base`, run with `DATABASE_URL` exported
    manually since the seed scripts don't load `dotenv/config`), signed in as
    the seeded seller, `PATCH .../orders/:id/review` with
    `{"decision":
    "approve"}` on the seeded `PAYMENT_SUBMITTED` order →
    `200`, correct bilingual approved email written to `.mailer-dev/` with the
    real store name.
- Frontend UI (check-email state, verify-email page rendering) was **not**
  click-tested in an actual browser — no browser-driving tool available this
  session, only typechecked and logic-verified against the confirmed API
  response shape.

## Follow-ups (not in scope this session)

- Order-confirmation-on-checkout, fulfillment-status emails, low-stock digest,
  contact-form emails — all explicitly post-MVP per the docs, left alone.
- `OrderController.addPayment`'s manual-deposit `paymentStatus` writes don't
  send email — separate call site from `ReviewPaymentUseCase`, out of scope.
- ~~No "resend verification email" UI/endpoint~~ — closed in
  `2026-07-31-review-fixes-and-prod-reset.md` via
  `emailVerification.sendOnSignIn: true` (resends automatically on a failed
  sign-in attempt, no dedicated UI needed).
