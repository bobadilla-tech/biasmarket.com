# Draft review comments

## Posted review summary

- #581: `COMMENT`, no inline findings; verified tuteo copy and green required
  CI.
- #582: `COMMENT`, no inline findings; verified guard coverage and green
  required CI.
- #583: `COMMENT`, no inline findings; verified overlay/resolver behavior in the
  cumulative stack and green required CI.
- #593: `COMMENT`, no inline findings; verified ownership/auth validation in
  code and green required CI.
- #598: `COMMENTED`, one inline privacy finding on account deletion (GitHub
  rejected `REQUEST_CHANGES` because the authenticated author owns the PR).
- #585: `COMMENTED`, two inline findings below (GitHub rejected
  `REQUEST_CHANGES` because the authenticated author owns the PR). Both were
  reproduced as CI-breaking defects.

## Stack-level comment on #598

> This review covers #581, #582, #583, #593, #598, and #585. The planned Caddy,
> provider/country-picker, badge, and WhatsApp PRs are not open in this set.

## #581: fix(i18n): standardize Spanish copy on tuteo

**Review body (COMMENT):**

> Reviewed this copy-only slice against `main`. The Unicode voseo scan, locale
> parity check, and required CI are clean. I found no issues in this PR.

## #582: test(i18n): add locale copy guards

**Review body (COMMENT):**

> The new Unicode-aware fixtures, key-path parity check, coverage wiring, and
> workspace-script guard passed review. `test:cov` passes locally and required
> CI is green. I found no issues in this PR.

## #583: feat(i18n): add voseo register and country resolver

**Review body (COMMENT):**

> The overlay, register precedence, country parsing, dial-code additions, and
> mobile resolution build cleanly. The Android export succeeds, and required CI
> is green. I found no issues in this PR's planned utility scope.

## #593: feat(i18n): add seller register preferences and store settings

**Review body (COMMENT):**

> Store preference writes are owner-checked, seller country/register fields are
> validated on signup and self-update, and new-store country seeding and SDK
> changes are consistent. Required CI is green. The provider that applies these
> preferences is planned for 4b.

## #585: feat(products): add international shipping flag

**Review body (COMMENTED):**

> The additive default and explicit unchecked form value preserve the intended
> shipping behavior. I found two required checks broken by the new response
> field: the API E2E schema assertions reject it on nested order products, and
> the mobile typecheck has a response fixture without it. Please address both
> before review can pass.

### 585-1 · should fix · `packages/db/prisma/schema.prisma:159`

> Adding this field to the Prisma `Product` row also makes it appear in nested
> order responses: `toOrderProductDto` spreads the included product row, while
> `OrderProductResponseDto` and the generated OpenAPI schema do not declare this
> property. The hosted API E2E run fails four customer/order/stats
> response-schema assertions on `product.shipsInternationally`. Please either
> add it to the nested response contract and regenerate the API SDK, or
> explicitly omit it from that mapper.

### 585-2 · should fix · `apps/api/src/modules/products/dto/product-search-response.dto.ts:31`

> This makes `SearchProductResponseDto.shipsInternationally` required, but the
> mobile catalog fixture at
> `apps/mobile/src/features/catalog/catalog-ui.component.tsx:40` does not supply
> it. The hosted Mobile typecheck and a local typecheck at this head both fail
> with TS2741. Please update that fixture so it matches the required response
> shape.

## #598: feat(i18n): store buyer country and scrub telemetry

**Review body (COMMENTED):**

> The buyer-owned profile update, seller-payload isolation test, and shared
> cookie/header scrub coverage are in place. The new account field also needs to
> be cleared when a buyer deletes their account.

### 598-1 · should fix · `apps/api/src/modules/customer-auth/customer-auth.service.ts:508`

> `DELETE /api/account/me` anonymizes the BuyerAccount row, but
> `deleteGlobalAccount` does not clear `countryCode`. Please set
> `countryCode: null` in the deletion update and cover it in the
> account-deletion test.

## Remediation pushed

- #598: commit `cad0dcfe090f49ed096e8b6884b8c873b28baaa9` clears country during
  account deletion and adds E2E coverage.
- #585: commit `0ffe4ace62666ac60ed8e6ec393fa8f21d6f3d35` keeps the order DTO
  shape stable and adds the missing mobile fixture field.

## Resolution

All three inline finding threads were resolved after the fixes were pushed and
verified. All six reviewed PRs are marked ready for review with exact-head
required `CI Success` green.
