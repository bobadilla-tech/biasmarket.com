# Mobile Architecture Audit — Adding iOS/Android to Bias Market

**Date:** 2026-08-31 **Scope:** Full repo audit (`apps/web`, `apps/api`,
`apps/workers`, `packages/*`, `packages/db/prisma/schema.prisma`) focused on
whether and how to add native mobile apps. **Method:** 4 parallel deep-reads
covering the Next.js frontend, the NestJS backend/API inventory, the database
schema + order state machine, and the shared packages + payment-proof flow.
Every claim below is evidence-based with `file:line` citations. No code was
written or modified as part of this audit — see
`docs/plans/2026-08-31-mobile-audit-cleanup-plan.md` and
`docs/plans/2026-08-31-mobile-app-mvp-plan.md` for the follow-up work this audit
generated.

---

## 1. Correcting the brief's assumptions

The audit request assumed a generic ecommerce platform: cart, wishlist, reviews,
card-gateway checkout with Apple Pay/Google Pay. None of that exists in this
codebase. A full read of `packages/db/prisma/schema.prisma` (748 lines, 28
models) confirms:

- **No `Cart`, `CartItem`, `Wishlist`, or `Review` model exists anywhere.**
  Checkout creates an `Order` + `OrderItem[]` directly from the product page
  (`apps/api/src/modules/orders/application/create-order.usecase.ts`) — there is
  no server-side cart resource at all.
- **No payment gateway integration of any kind.** Bias Market is
  manual-payment-first per CLAUDE.md: bank transfer / Yape / Plin / PayPal, with
  a buyer-submitted proof-of-payment image reviewed by the seller. There is no
  Stripe, no PCI scope, no 3DS, no Apple Pay/Google Pay surface to evaluate.
- The "cart" that does exist is a client-side `localStorage` concept
  (`apps/web/lib/cart.ts`), not a backend resource.

This materially simplifies the mobile-payments question (§9) and the
ecommerce-flow question (§6) relative to the brief's framing, and it means
"wishlist/reviews on mobile" is out-of-scope net-new product work, not a porting
gap.

---

## 2. Current architecture

The repo is **already** a Turborepo + pnpm-workspace monorepo with a clean
API/web split — `apps/web` never imports `packages/db` or talks to Postgres
directly, per CLAUDE.md's hard rule, confirmed by the audit (no `@prisma/client`
import anywhere in `apps/web`). This is the single biggest structural advantage
for adding mobile: the backend has no page-render logic baked in and is already
a platform-agnostic HTTP API.

| Path             | Role                                | Key facts                                                                                                                                                                                                |
| ---------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`       | NestJS backend, sole DB owner       | **23 modules** — 7 more than CLAUDE.md's documented list (`coupons`, `couriers`, `monitoring`, `restock`, `addresses`, `whatsapp-templates`, plus a separate `global-account` controller). See §12.      |
| `apps/web`       | Next.js 16.2.11, App Router         | Locale-prefixed routing (`app/[locale]/...`), 42 `page.tsx` files, all Server Components delegating to client `*-page-client.tsx` siblings.                                                              |
| `apps/workers`   | BullMQ consumer + scheduler         | Owns all scheduled jobs (order-expiry sweep, premium-coupon expiry, mailer sends) via Redis-backed BullMQ. `apps/api` only produces jobs and exposes internal HTTP endpoints the workers call back into. |
| `packages/db`    | Prisma v7 schema + generated client | 28 models. `@prisma/adapter-pg` driver adapter is wired in `apps/api/src/prisma/prisma.service.ts:1-33`, **not** in the package itself.                                                                  |
| `packages/types` | Orval-generated OpenAPI SDK         | 30 controller-tag namespaces, fully committed (only `dist/` gitignored, confirmed via `git check-ignore`/`git ls-files`). Single `customFetch` mutator in `http.ts:54-95`.                               |
| `packages/ui`    | Documented as shared components     | **Actually a 5-line unused stub** — see §13.                                                                                                                                                             |
| `packages/i18n`  | ES/EN dictionaries                  | 10 namespaces × 2 locales, statically imported JSON. Used by `apps/web` via next-intl; **declared but unused by `apps/api`** — see §13.                                                                  |
| `packages/utils` | Pure functions                      | Zero runtime deps (`package.json` `dependencies: {}`). Currency constants, slug/HTML-escape, phone normalization, WhatsApp templating, HMAC customer-token issuance.                                     |

---

## 3. Frontend architecture — `apps/web`

**Routing.** App Router confirmed. Route groups: `(marketing)`, `(onboarding)`,
`(dashboard)` (seller + admin), `(storefront)` (`store/[slug]` plus nested
cart/checkout/account), and a top-level `search`. All 42 `page.tsx` files are
Server Components; the convention is `page.tsx` (server, fetch +
`generateMetadata`) delegating to a co-located `*-page-client.tsx`. **Zero
Server Actions exist** — `grep -rl '"use server"'` across `apps/web` returns
nothing. Next.js 16 renamed `middleware.ts` to `proxy.ts`; `apps/web/proxy.ts`
does **locale routing only** via next-intl's `createMiddleware` — no auth check,
no redirect logic.

**Data fetching.** No hand-written fetch wrapper — AGENTS.md states it outright
("the hand-written `apiFetch` wrapper is gone entirely",
`apps/web/AGENTS.md:279`). All typed calls go through the Orval-generated
`apiClient` (`apps/web/lib/api-client.ts:53-83`), and
`packages/types/http.ts:64-67`'s `customFetch` always sends
`credentials: "include"` — **there is no `Authorization`-header path anywhere in
the codebase.** Multipart carve-outs (`registerPayment`, image uploads) stay on
raw `fetch`/`FormData` by design (AGENTS.md:280-282).

**UI layer.** shadcn-style setup on **Base UI, not Radix**
(`apps/web/components.json`: `"style": "base-nova"`; confirmed via
`apps/web/components/ui/button.tsx:1` importing `@base-ui/react/button`, and no
`@radix-ui/*` dependency exists in `apps/web/package.json`). 24 primitives live
in `apps/web/components/ui/`, all irreducibly DOM/Tailwind-bound (CSS custom
properties for per-store theming, `class-variance-authority` variant strings,
`oklch`/`color-mix` CSS functions).

**State & cart.** No global client-state library. The cart is device-local
`localStorage` (`apps/web/lib/cart.ts:1-105`), keyed per store slug,
broadcasting a `CustomEvent` (`biasmarket:cart-updated`) for same-tab reactivity
— it does not survive across devices or browsers.

**SEO.** `generateMetadata` per route, `robots.ts`, dynamic sitemaps, JSON-LD
for `Organization`/`WebSite` (global, `app/[locale]/layout.tsx:32-52`) and
`OnlineStore`+`Product` nodes on the store listing page
(`store/[slug]/page.tsx:93-123`). **Gap:** the individual product detail page
(`store/[slug]/product/[productId]/page.tsx`) has no `Product` JSON-LD of its
own — see cleanup plan.

**Auth on the frontend.** Two independent systems, both checked **client-side
only**: seller/admin via `authClient.useSession()` (better-auth,
`apps/web/hooks/use-session.ts`, `apps/web/hooks/use-require-auth.ts`), buyer
via a query that treats a failed `/me` call as "logged out"
(`apps/web/features/customer-auth/queries/use-customer-profile.ts:8-10`).
**There is no server-side (cookie-reading Server Component) auth gate anywhere
in `apps/web`** — every protected route redirects via a client `useEffect` after
a loading flash. Matches CLAUDE.md's note that tenant/auth resolution has no
middleware layer yet.

---

## 4. Backend / API architecture — `apps/api`

**Global setup** (`apps/api/src/main.ts`): global prefix `api` (excluding
`internal/*` entirely, L45-47, so Caddy can block it in one rule); global
`ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` (L25-27);
`helmet()` on every path except `/api/docs` (L35-39); CORS is a **single
origin** (`WEB_URL` env var, not an array) with `credentials: true` (L49-54).
`AuthGuard` is registered globally by `@thallesp/nestjs-better-auth` — every
route requires auth by default unless marked `@Public()`/`@AllowAnonymous()`.
`ThrottlerModule` is **not** global; each module registers it locally.

**Module inventory (23 total, 16 documented in CLAUDE.md, 7 not):** `stores`,
`products`, `categories`, `collections`, `store-sections`, `payment-config`,
`delivery-config`, `pickup-points`, `notifications`, `contact`, `customer-auth`,
`stats`, `users`, `health`, `orders`, `suggestions` (in CLAUDE.md's list) plus
**`coupons`, `couriers`, `monitoring`, `restock`, `addresses`,
`whatsapp-templates`** and a separate **`global-account`** controller (not
documented anywhere in CLAUDE.md). All registered in
`apps/api/src/app.module.ts:32-57`.

**Orders state machine.**
`apps/api/src/modules/orders/domain/order-status.vo.ts:17-36` defines
`PaymentStatus` transitions: `PENDING_PAYMENT` →
`[PARTIALLY_PAID, PAYMENT_SUBMITTED, VERIFIED, REJECTED, CANCELLED]`;
`PARTIALLY_PAID` → same set; `PAYMENT_SUBMITTED` →
`[PARTIALLY_PAID, VERIFIED,
REJECTED]` (no direct cancel);
`VERIFIED`/`REJECTED`/`CANCELLED` terminal. `FulfillmentStatus` (L47-53) is
strictly linear `ORDERING → IN_TRANSIT →
READY → COMPLETED`, gated on
`paymentStatus === 'VERIFIED'` (`order.entity.ts:39-47`). See §13 for a real
discrepancy found in how consistently this is enforced.

**Storage.** S3-compatible (MinIO) via `@aws-sdk/client-s3`
(`apps/api/src/storage/storage.service.ts`, 113 lines), three buckets:
`S3_BUCKET` (products), `S3_LOGO_BUCKET` (logos), `S3_PAYMENT_BUCKET`
(**private**, no anonymous-read policy, L16-18). **No presigned URLs anywhere**
— every upload is proxied through the API server itself via `FileInterceptor`
(Multer, in-memory buffer, 5MB cap, magic-byte sniffing for JPEG/PNG/PDF).
Payment-proof images are never served via a public URL — always streamed through
an authenticated `GET .../image` endpoint, because `S3_ENDPOINT` is an internal
Docker hostname (`minio:9000`) unreachable from a browser directly (comment
L66-70). No server-side image resizing exists anywhere.

**Background jobs.** BullMQ, not `@nestjs/schedule` — deliberately moved to
`apps/workers`, confirmed by an explicit migration-plan comment in
`apps/workers/src/jobs/orders/expire-orders-scheduler.service.ts:7-13`
("apps/workers owns scheduling... this replaced apps/api's own in-process
@Cron"). `apps/api` is purely a job **producer** (e.g. mailer sends); the
consumer/scheduler lives entirely in `apps/workers`. This decoupling is
favorable for mobile — none of the API's request/response shapes are entangled
with scheduling.

---

## 5. Database — model inventory highlights

Full schema read: 28 models, Prisma v7,
`generator client { provider =
"prisma-client" }` (schema.prisma:1-4). Money
fields are consistently `Decimal(10,2)`: `Product.price`,
`ProductVariant.priceOverride`,
`Order.totalAmount`/`requiredAmount`/`retainedAmount`/`releasedAmount`,
`OrderItem.unitPriceAtPurchase`, `OrderPayment.amount`, `CourierConfig.price`.

Two buyer-identity models coexist mid-migration:

- **`Customer`** (schema.prisma:535-552) — legacy, per-store
  (`@@unique([storeId, phone])`), being phased out (comment L554-558).
- **`BuyerAccount`** (schema.prisma:559-578) — the new **global** identity,
  `phone @unique`, no `storeId`. Uses a **stateless** `passwordVersion Int`
  counter (L563-566) embedded directly in its session tokens as the only
  revocation mechanism — no DB session-table lookup per request needed. This is
  architecturally the more mobile-friendly of the two auth systems already in
  the codebase (see §7).

By contrast, **`Session`** (schema.prisma:704-717, better-auth's own model for
seller/dashboard auth) is a classic browser-session shape: `token
@unique`
(cookie value), `ipAddress?`, `userAgent?`, `impersonatedBy?`
(admin-impersonation, a web-only feature) — designed for a browser cookie jar,
not a native client.

**Soft delete** exists only on `Product.deletedAt` (schema.prisma:130), enforced
everywhere products are read. No other model soft-deletes. **`AuditLog`** has
exactly 3 real write sites — payment approve/reject
(`review-payment.usecase.ts:143-153`), order expiry
(`expire-orders.usecase.ts:69-82`), and seller-initiated cancellation
(`cancel-order.usecase.ts`) — no audit trail exists for product/store/pricing
mutations.

---

## 6. Ecommerce flow audit

| Flow                         | API support today                                                                                                      | Mobile reuse                                       | Required work                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Browse / search / categories | `@Public()`, paginated (`GET /products/search`, default limit 24, max 50)                                              | High                                               | Native list UI only                                                                                 |
| Product detail + variants    | `@Public()`, full variant/attribute data                                                                               | High                                               | Native UI                                                                                           |
| Store / seller pages         | `@Public()` directory + profile                                                                                        | High                                               | Native UI; per-store CSS-variable theming needs a runtime-object equivalent                         |
| Cart                         | **No server API — doesn't exist**                                                                                      | None                                               | Native-local cart (AsyncStorage/MMKV), porting `lib/cart.ts`'s _algorithm_, not its storage         |
| Checkout                     | `POST /stores/:slug/checkout`, `@Public()`, multipart (items/address as JSON strings + optional proof file)            | High — RN's `FormData` handles this shape natively | Native form + camera/gallery picker                                                                 |
| Order history / detail       | `GET /account/orders` (buyer, global identity via `global-account.controller.ts:17-38`), seller-side order list/detail | High                                               | Requires the new token-auth mode (§7)                                                               |
| Payment proof submit/review  | Proxy-uploaded, private bucket, authenticated streaming read                                                           | Medium — endpoint shape reusable                   | Must replicate "always fetch via authenticated endpoint, never a plain `<img src>` to a public URL" |
| Seller dashboard             | `AuthGuard`-gated, full CRUD                                                                                           | High                                               | Out of MVP scope — see mobile MVP plan                                                              |
| Notifications                | DB model + manual polling only                                                                                         | None                                               | New push pipeline entirely — see §8                                                                 |
| Wishlist / Reviews           | **Does not exist**                                                                                                     | N/A                                                | Out of scope                                                                                        |

---

## 7. Authentication audit

The highest-risk area. Two fully independent systems exist, and **neither
supports a native client as currently configured.**

|                    | Seller/dashboard (`auth.config.ts`)                                                                                                                                             | Buyer (`modules/customer-auth`)                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Library            | better-auth via `@thallesp/nestjs-better-auth`, Prisma adapter                                                                                                                  | Hand-rolled, reuses better-auth's hash/verify only                                                                                                                                                                                |
| Session shape      | DB-backed `Session` row (cookie token)                                                                                                                                          | Stateless HMAC-signed cookie (`bm_customer_session`), 7-day sliding renewal on every authenticated request, `customer-session.guard.ts:52-99`                                                                                     |
| Revocation         | Delete session row                                                                                                                                                              | Bump `passwordVersion` on `BuyerAccount` — invalidates _all_ outstanding tokens at once                                                                                                                                           |
| CSRF/Origin check  | `trustedOrigins: [WEB_URL]` (`auth.config.ts:111`)                                                                                                                              | **`OriginGuard` (`origin.guard.ts:20-40`) hard-requires an `Origin` or `Referer` header equal to `WEB_URL`** on register/login/forgot-password/change-password — a native app sends neither by default and is rejected as written |
| Bearer/JWT support | **None configured.** No JWT/bearer plugin; repo-wide grep for `bearer\|jwt\|Authorization header\|apikey` returns zero hits in non-spec code                                    | **None.** Transport is cookie-only                                                                                                                                                                                                |
| Refresh tokens     | None — relies on session cookie lifetime                                                                                                                                        | None — sliding renewal substitutes                                                                                                                                                                                                |
| Rate limiting      | better-auth's own native Express-level limiter (`rateLimit: { enabled: true }`, `auth.config.ts:124-126`) — runs _before_ Nest's router, bypassing `@nestjs/throttler` entirely | `ThrottlerModule` + `@Throttle` per-route (5-20 req/60s)                                                                                                                                                                          |
| Email verification | `requireEmailVerification: true` (`auth.config.ts:44-48`)                                                                                                                       | N/A — phone-based identity                                                                                                                                                                                                        |

better-auth ships a **Bearer plugin** built exactly for native/mobile clients
that can't hold cookies — it simply isn't enabled today. The buyer side's token
is already conceptually bearer-shaped (self-contained, stateless, versioned);
only its transport (cookie + Origin check) needs a native-friendly mode. Neither
system needs a rewrite — both need an additive parallel token-issuance path.
Full design in `docs/plans/2026-08-31-mobile-app-mvp-plan.md`.

---

## 8. Push notifications, real-time infra

**Nothing exists to build on.** Confirmed zero WebSocket/SSE/`socket.io` usage
anywhere in `apps/api` or `apps/web` (repo-wide grep, zero hits). The in-app
`Notification` model is polled manually, and not even continuously — the web
notification bell
(`apps/web/features/notifications/components/notifications-bell.tsx`) only
fetches the full list while its popover is open; no `refetchInterval` is
configured anywhere (`apps/web/app/[locale]/query-provider.tsx` sets only
`staleTime: 30_000`, no polling). A mobile push pipeline is 100% net-new
infrastructure, not a port — see the mobile MVP plan's push-notification phase.

---

## 9. Payment architecture

No gateway integration exists — see §1. The actual mobile-specific risk is
entirely in the **proof-of-payment capture and delivery pattern**:

- Uploads are proxied through the API (multipart `FormData`, 5MB cap, magic-byte
  validated server-side) — React Native's `FormData` + `expo-image-picker`
  reproduces this with no backend changes.
- Proof images live in a **private** bucket, readable only through an
  authenticated streaming `GET` — mobile must fetch the image as an
  authenticated blob (bearer token attached), never a plain
  `<Image source={{uri: publicUrl}}>`.
- **No client-side image compression exists anywhere in the codebase today**
  (confirmed — no such library in `apps/web/package.json` or source). Mobile
  needs `expo-image-manipulator` to downscale phone-camera photos before upload,
  since camera photos routinely exceed the 5MB server cap where a desktop
  screenshot rarely does — new mobile-specific need, not a port.
- QR-code payment images (Yape/Plin) live in the **public** product bucket,
  distinct from private proof images — mobile can display these as ordinary
  public-CDN images, no auth needed.

---

## 10. Code & UI reuse analysis

Splitting "shared business logic" from "shared UI" deliberately — conflating
them is the most common overestimate in an audit like this.

**Easily shareable, near-unchanged:**

- `packages/types` — the Orval SDK. `http.ts`'s `customFetch` uses only `fetch`,
  no DOM API. One change needed: an injectable auth-header strategy instead of
  the hardcoded `credentials: "include"`.
- `packages/utils` — `phone-country`, `whatsapp`, `strings`, `payment-methods`,
  `errors` are pure, zero-dependency. `customer-account-token` uses
  `node:crypto` (needs an `expo-crypto` polyfill on RN, logic unchanged).
- Zod validation schemas in `apps/web/features/*/schemas/` — DOM-free, not
  currently in a shared package, but portable as-is.

**Potentially shareable (logic yes, wiring no):** TanStack Query hook _shapes_
(query keys, invalidation patterns); form validation logic (the zod schemas
above, minus the `react-hook-form` wiring); the cart's quantity-math _algorithm_
in `lib/cart.ts` (not its `localStorage` backend).

**Web-only, no path to sharing:** every component in `apps/web/components/ui`
(Base UI + Tailwind), all Server Components, next-intl's routing/middleware,
`next/image`, all SEO/JSON-LD code, the CSS custom-property theming system.

**Net figure:** ~90% of `packages/types` + `packages/utils` is portable
unchanged; 0% of existing UI runs on React Native; realistically **10-15% of
total mobile-app code volume** will be reused business logic, not UI. That
10-15% is disproportionately high-value (the code most likely to have subtle
bugs if duplicated), which is why sharing it is worth doing even though it's a
small slice — but it should not be marketed internally as "most of the code is
shared," because that would only be true if UI were counted as freely shareable,
and it isn't.

---

## 11. Mobile framework recommendation (summary)

Full comparison and rationale live in
`docs/plans/2026-08-31-mobile-app-mvp-plan.md` §2. Short version: **Expo + React
Native + Expo Router + NativeWind**, added as `apps/mobile` in the existing
Turborepo. Cross-platform UI frameworks (Tamagui, gluestack-ui) were evaluated
and rejected — they earn their complexity when there's a large, actively-shared
component surface between web and native, and here `packages/ui` is empty and
`apps/web`'s real components are built on Base UI, which has no React Native
equivalent. Adopting Tamagui would mean building a second design system from
scratch anyway, while also taking on a new compiler and styling API — paying
maximum-sharing complexity for a sharing benefit that doesn't exist in this repo
today.

---

## 12. Documentation drift found during this audit

Findings that are stale docs or naming, not code defects — tracked for cleanup
rather than blocking the mobile plan:

1. **CLAUDE.md's module list is out of date.** It documents 16 API modules; 23
   exist (`coupons`, `couriers`, `monitoring`, `restock`, `addresses`,
   `whatsapp-templates`, and the `global-account` controller are undocumented).
2. **`docs/core/security-payments.md` §9 is stale on the expiry-sweep
   implementation.** It describes an in-process `@Cron` in
   `orders-cron.service.ts` — that file no longer exists. The real
   implementation is a BullMQ repeatable job in `apps/workers` calling back into
   `apps/api`'s `POST /internal/orders/expire-sweep`
   (`apps/api/src/modules/orders/infrastructure/internal-jobs.controller.ts:20-29`).
3. **`packages/ui` is documented in CLAUDE.md as "Shared React components
   (theme-aware, no business logic, no fetching)" but is a 5-line unused stub**
   (`packages/ui/index.tsx`, one `Button` function). Confirmed independently by
   two separate audit passes: `grep -rn "@biasmarket/ui"` across `apps/web`
   returns no import, only the `package.json` dependency declaration.
4. **`packages/i18n` is declared as an `apps/api` dependency but never
   imported** — `grep -rn "i18n" apps/api/src` returns zero matches. All backend
   error/notification strings are hardcoded Spanish literals inline (e.g.
   `'Máximo 5MB'`, `'Solo JPEG o PNG'` repeated across several controllers).

---

## 13. Correctness findings (not mobile-blocking, worth fixing)

1. **The order state machine's transition guard is bypassed on two of its four
   mutation paths.** `order-status.vo.ts`'s `PAYMENT_TRANSITIONS` forbids
   `PAYMENT_SUBMITTED → CANCELLED` directly. But
   `expire-orders.usecase.ts:52-65` and `cancel-order.usecase.ts` both mutate
   `paymentStatus`/`status` via a raw `tx.order.updateMany(...)` Prisma call,
   **without ever constructing an `Order` entity or calling
   `assertPaymentTransition`** — and both achieve exactly that forbidden
   transition through this different code path. In practice, the declared state
   machine is only enforced on the approve/reject path
   (`review-payment.usecase.ts:58-79`, the only call site that builds an `Order`
   entity and calls `entity.approvePayment()`/`rejectPayment()`). This isn't
   presently causing observed bugs (the sweep and cancel paths have their own
   correct-looking guard conditions), but it means the VO is not the single
   source of truth its own file's comments imply.
2. **File-type/size validation (5MB cap, JPEG/PNG/PDF magic-byte sniffing) is
   hand-rolled and duplicated verbatim across at least 5 controllers**
   (`products.controller.ts`, `stores.controller.ts`,
   `payment-config.controller.ts`, `checkout.controller.ts`,
   `order.controller.ts`, `customer-order-payments.controller.ts`) instead of a
   shared decorator/pipe. No functional bug today, but any future change to the
   size limit or accepted types requires editing 5+ files correctly.
3. **The product detail page has no `Product` JSON-LD**
   (`store/[slug]/product/[productId]/page.tsx`) — the page a shopper is most
   likely to land on from search or a shared link currently has no structured
   data of its own; only the parent store's listing page does.

---

## 14. Recommendation

See `docs/plans/2026-08-31-mobile-app-mvp-plan.md` for the full architecture
recommendation, phased plan, effort estimate, and risk register. In one line:
add `apps/mobile` (Expo + React Native + NativeWind) to the existing Turborepo,
reuse `packages/types`/`packages/utils` largely unchanged, and make two scoped,
additive backend changes — a bearer-token mode for better-auth and a
header-token + `OriginGuard`-exemption path for `customer-auth` — before writing
any mobile screen that needs authentication.
