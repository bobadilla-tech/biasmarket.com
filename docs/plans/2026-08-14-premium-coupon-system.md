# Plan: premium coupon system

## Context

The platform currently has no user-plan model or billing tiering. The release
requirement is narrower: a coupon can activate a premium plan for a limited
time, and admin users need to manage those coupons and review who redeemed them.
This is intentionally not a full subscriptions system yet; it is a limited-time
entitlement layer that can grow into more plan types later.

## Approach

- Add a small `Coupon` + `CouponRedemption` data model to Prisma.
- Add a user entitlement field for `premiumUntil` (with a `plan` field reserved
  for future expansion).
- Create admin-only coupon creation and audit endpoints plus a user-facing
  redeem endpoint.
- Validate all coupon rules server-side before granting access to premium
  features.
- Keep the admin dashboard aligned with the existing platform-admin pattern
  already used for inquiries, stores, and users.

## Why this fits the repo

- The repo already uses platform-admin role checks and admin-only controller
  conventions via `@Roles(["admin"])` and `AuthGuard`.
- The existing app uses a single SaaS admin area, so coupon management belongs
  in that platform scope rather than a seller-specific feature area.
- The project currently has no tenant-level plan engine, so a minimal premium
  entitlement timestamp is the least risky way to satisfy the requirement
  without premature abstraction.

## Implementation details

- `Coupon` stores the code, duration, validity window, and use limits.
- `CouponRedemption` records each successful redemption and links it back to the
  user and coupon for auditability.
- A redemption sets the user’s `plan` to `premium` and `premiumUntil` to
  `redeemedAt + durationDays`.
- Coupon validation checks existence, active state, time window, duplicate
  redemption, and max-use enforcement.
- The admin API returns coupon redemptions with the user email/name so the admin
  can identify who redeemed each code.

## Follow-up scope

- Add the admin UI page for coupon management and redemption history.
- Add premium gate checks for any future features that should require active
  premium access.
- If the product later adds multiple plans, split the timestamp into a proper
  entitlement table rather than keeping a one-off `premiumUntil` field.
