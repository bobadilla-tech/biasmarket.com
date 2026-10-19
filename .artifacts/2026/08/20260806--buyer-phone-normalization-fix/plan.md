# Buyer phone normalization fix

## Context

Reported bug: buyer login failed with correct credentials, and forgot-password
sent nothing. Root cause: checkout wrote `Customer.phone` via `PhoneInput` (dial
code glued to national number: `"+51987654321"`), but the login and
forgot-password forms used a bare `<input>` with no country-code selector. A
buyer naturally types `"987654321"` or `"51987654321"` there, not
`"+51987654321"`. Every `storeId_phone` lookup (`Customer` is keyed on an
exact-match Prisma unique constraint) never normalized either side, so the row
was simply never found — login always fell through to the generic "Teléfono o
contraseña inválidos" error (deliberately the same message for "not found" and
"wrong password", to avoid account enumeration), and forgot-password's
enumeration-protection no-op silently swallowed the real case of an existing
account under a differently-formatted phone string.

This was issue 2 of the same four-issue batch plan as the order-approval guard
(`2026-08-06-order-status-buyer-login-pickup-checkout-fixes-plan.md`).

## Approach

- **`normalizePhone()`** added to `packages/utils/src/phone-country`, built on
  the module's existing `parsePhoneValue()`/`PHONE_COUNTRIES` dial-code
  detection rather than reimplementing it: prepend `+` if the input doesn't
  already start with one, then run it through `parsePhoneValue`. A `+`-prefixed
  dial code already resolves correctly there; prepending `+` to a bare
  `"51987654321"` makes it resolve the same way, and a bare national number with
  no recognizable dial-code prefix (`"987654321"`) falls through to
  `DEFAULT_PHONE_COUNTRY` exactly like `parsePhoneValue` already does for an
  unmatched `+`-prefixed value.
- **Backend-only enforcement, applied at all four exact-match sites** (per the
  investigation's own recommendation — never rely solely on frontend
  formatting): `CustomerAccountService.findOrCreateCustomer` (the checkout write
  path), `CustomerAuthService.login`, `.forgotPassword`, and `.updateProfile`'s
  duplicate-phone check + the `pendingPhone` it stages.
  `CustomerAccountService.confirmAccount`'s `pendingPhone -> phone` write
  (reached when the buyer confirms a staged phone change) also normalizes again
  as defense-in-depth, so a legacy unnormalized `pendingPhone` value self-heals
  on confirm rather than needing its own backfill pass.
- **Frontend**: swapped the bare `<input>` for the existing `PhoneInput`
  component on `customer-login-form.tsx`, `forgot-password-form.tsx`, and
  `edit-contact-form.tsx` — the third call site found during review (not in the
  original report): a buyer who edits their phone from account settings after
  this fix ships could otherwise reintroduce the exact bug being fixed, since
  that form also used a bare `<input>`. Each swap follows `checkout-form.tsx`'s
  existing `Controller`-wrapped pattern (`PhoneInput` needs a controlled
  `value`/`onChange`, not `register()`).
- **No prod backfill needed**: the prod database has no real data yet, so rather
  than write a migration script for existing rows, the plan was to reset the
  database from the current (post-fix) schema/migrations and reseed — no
  `Customer.phone` values ever existed in the old, un-normalized shape. A
  backfill script was drafted at one point during this work but deleted once
  that became clear; if this ever matters again (e.g. a future
  normalization-affecting change after real customer data exists), write a fresh
  one rather than resurrecting this — the shape of a "safe" backfill depends on
  what's actually inconsistent at the time.

## What else came up

- Same pre-existing e2e-only issue this session's other order-fix PR found in
  `orders.e2e-spec.ts` (a top-level `stock` field on product creation
  auto-creates a "Default" `ProductVariant`, so checkout needs an explicit
  `variantId`) also blocked `customer-account-auth.e2e-spec.ts`'s one test from
  running at all — fixed there too, unrelated to phone normalization itself but
  necessary to verify anything in that file.

## Tests

- `normalizePhone()` unit coverage for all four input shapes named in the
  original investigation: `"+51987654321"`, bare national number
  (`"987654321"`), bare dial-code-prefixed number (`"51987654321"`), and
  spaced/punctuated input (`"+51 (987) 654-321"`), plus a non-default country's
  dial code without a leading `+`.
- New differently-formatted-but-equivalent-phone cases in
  `customer-auth.service.spec.ts` (login, forgotPassword, updateProfile) and
  `customer-account.service.spec.ts` (`findOrCreateCustomer`, `confirmAccount`'s
  legacy-`pendingPhone` self-heal).
- Extended the existing full-lifecycle e2e test in
  `customer-account-auth.e2e-spec.ts` with a login + forgotPassword pass using
  the phone typed without its dial code, after the original canonical-format
  pass already ran through register/login/updateMe/ changePassword/logout.
- Rewrote the three frontend component tests that hardcoded the old bare
  `<input>` interaction (`customer-login-form.test.tsx`,
  `forgot-password-form.test.tsx`) and added a new phone-editing case to
  `edit-contact-form.test.tsx` (none of its existing tests actually typed into
  the phone field before this change).
