# Mobile MVP — Expo app for Bias Market

**Status:** Not started. Written ahead of the work.

Written before execution, at the user's explicit request, to allow a review pass
before code is written (deviates from this directory's normal "record after the
work lands" convention — see `docs/plans/README.md`).

**Source:** `docs/audits/mobile-architecture-audit-2026-08-31.md` (full
architecture audit — read that first for the evidence behind every decision
below).

**Related:** `docs/plans/2026-08-31-mobile-audit-cleanup-plan.md`. Its cleanup
pass repurposed the dead `packages/ui` stub as `packages/design-tokens` and
moved the existing store-palette resolver into it. Phase 0 below now extends
that package instead of introducing it.

## Context

The audit confirmed this is not a generic "add mobile to an ecommerce app"
project: there's no cart API, no payment gateway, no wishlist/reviews, and the
backend is already a clean HTTP-only API with no page-render logic baked in
(`apps/web` never touches `packages/db` directly, per CLAUDE.md's hard rule —
confirmed, not just documented). That narrows the real work to three things: (1)
a native UI layer, since zero shared UI exists today (the former `packages/ui`
stub is now a token-only package, and `apps/web`'s real components are
DOM/Base-UI bound and cannot run on React Native), (2) an auth transport mobile
can actually use, since both existing auth systems are cookie-only, and (3)
replicating the proof-of-payment upload/authenticated-image-view pattern, which
is the one genuinely mobile-specific piece of business logic in this product.

### Framework decision

Evaluated: Expo+RN (bare), Expo+RN+NativeWind, Expo+RN+Tamagui,
Expo+RN+gluestack-ui, Next.js PWA, bare React Native (no Expo), Flutter/native.

**Chosen: Expo + React Native + Expo Router + NativeWind.**

- **PWA rejected** — iOS does support Web Push for Home Screen web apps, so
  notifications are not the deciding limitation. A PWA still lacks the native
  App Store product/distribution target this project calls for and offers a
  weaker fit for camera/file, secure-storage, and native navigation work.
  ([WebKit's iOS/iPadOS Web Push
  announcement](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/))
- **Bare RN (no Expo) and Flutter/native rejected** — bare RN adds native
  build-toolchain maintenance (linking, Xcode/Gradle config, upgrades) for a
  small team with no offsetting benefit over Expo's maturity + EAS. Flutter
  throws away all TypeScript/React code-reuse, which is the entire premise of
  adding mobile cheaply to an existing TS team.
- **Tamagui / gluestack-ui rejected.** These earn their complexity when there's
  a large, actively-shared component surface between web and native. Here, there
  is no shared component package and `apps/web`'s actual components are built on
  Base UI (`apps/web/components.json`: `"style": "base-nova"`), which has no
  React Native renderer and no path to one. Adopting Tamagui would mean building
  a second design system from scratch anyway — while also taking on a new
  compiler and styling API as team surface area — paying maximum-sharing
  complexity for a sharing benefit that doesn't exist in this repo. NativeWind
  gets the one real win (Tailwind class familiarity carrying over from
  `apps/web`) without the framework lock-in.

## MVP scope

**In:**

- Buyer auth (login/register, new bearer-token mode — see Phase 1)
- Store directory + featured (Discover/Home)
- Search + category filter
- Product detail + variants
- Local cart (device-only, not server-persisted — matches web's own
  `localStorage` cart, no parity gap introduced)
- Checkout, including proof-of-payment capture/upload
- Order history + detail, with push notification on proof approved/rejected
- Buyer profile + addresses

**Explicitly out (do not build in this phase):**

- Seller/GOM dashboard on mobile (product/order management) — sellers are a
  small, desk-bound audience; the existing web dashboard serves them fine.
- Admin functionality.
- Advanced analytics/stats.
- Biometric unlock — reasonable V1.1 addition (`expo-local-authentication`), not
  blocking for launch.
- Wishlist/reviews — these don't exist on web either (confirmed, no such models
  in `schema.prisma`); building them for mobile first would not be a parity fix,
  it would be new product scope requiring its own plan.

## Phase 0 — Shared-package preparation

**Goal:** extract the two things mobile actually needs out of `apps/web`, with
zero behavior change to the web app, before any mobile code exists.

**Files/packages affected:**

- New `packages/validation` — lift zod schemas out of 2-3
  `apps/web/features/*/schemas/` directories to start (e.g. `collections`,
  `checkout`, `register-payment`), re-exported so `apps/web`'s imports change to
  point at the package but resolve to identical schema objects.
- Existing `packages/design-tokens` — extend the store palette/resolver already
  extracted by the cleanup pass with any additional color/spacing/type-scale
  values the first native screens actually need. Keep it plain TypeScript data
  and pure functions, with no components.
- `packages/types/http.ts` — add an injectable auth-header strategy to
  `customFetch`, defaulting to today's `credentials: "include"` behavior so
  `apps/web` is unaffected. Signature becomes something like
  `configureApiClient({ baseUrl, getAuthHeader?: () => string | undefined })`.

**Dependencies:** none — this is pure extraction/refactor of existing code.

**Backend changes:** none.

**Frontend changes:** import-path updates only in `apps/web`; no behavior
change. Verify via existing `apps/web` test suite + a manual smoke pass on the
2-3 features whose schemas moved.

**Mobile changes:** none yet — this phase produces the packages mobile will
consume starting in Phase 2.

**Risks:** low. The main way to get this wrong is accidentally changing a
schema's validation rules during the lift-and-shift — diff the schema object
literally, don't "clean it up" while moving it.

**Definition of done:** `apps/web` still passes all existing tests importing
from the new packages instead of local files; `pnpm typecheck` and `pnpm lint`
clean across the whole monorepo.

## Phase 1 — Auth backend changes

**Goal:** give both existing auth systems a native-client-compatible transport,
additively — no removal of the cookie path either system uses today.

**Files/packages affected:**

- `apps/api/src/auth/auth.config.ts` — enable better-auth's Bearer plugin
  alongside the existing cookie session config.
- `apps/api/src/modules/customer-auth/customer-session.guard.ts` — accept the
  session token from an `Authorization: Bearer <token>` header, not only the
  `bm_customer_session` cookie.
- `apps/api/src/modules/customer-auth/customer-auth.controller.ts` — when a
  request carries a marker (e.g. `X-Client: mobile` header), return the session
  token in the JSON response body in addition to (or instead of) setting it as a
  cookie.
- `apps/api/src/modules/customer-auth/origin.guard.ts` — exempt
  bearer-authenticated requests from the `Origin`/`Referer` check; keep the
  check fully intact for cookie-mode requests. **This is the single
  highest-scrutiny change in this plan** — see Risks below.
- `apps/api/test/*.e2e-spec.ts` — new coverage for both new paths.

**Dependencies:** Phase 0's `packages/types` auth-header hook, so the client
side has somewhere to plug the resulting token into once this lands.

**Backend changes:** as above. All additive — no existing better-auth or
customer-auth call site changes behavior for cookie-based (web) callers.

**Frontend changes:** none required — `apps/web` keeps using cookies exactly as
today.

**Mobile changes:** none yet — this phase is backend-only, validated via a plain
script or `curl`/Postman before any mobile UI depends on it.

**Risks:**

- Medium — the Bearer-plugin change needs verification that it composes cleanly
  with the already-configured `admin` plugin and the custom
  `user.additionalFields` (`plan`, `premiumUntil`) in `auth.config.ts`; not
  verifiable from a read of the code alone, needs a spike against the actual
  pinned better-auth version.
- High-consequence if done carelessly — loosening `OriginGuard` is a CSRF
  surface change. Scope the exemption **strictly** to requests carrying a valid,
  already-verified bearer token (i.e. check the token first, and only skip the
  Origin check if verification succeeded) — never skip the Origin check based on
  the mere presence of an `Authorization` header before it's validated. Get a
  second engineer's review on this specific guard change before merging,
  independent of the rest of this phase.

**Definition of done:** a bearer-authenticated request from a plain script (no
cookie, no Origin header) succeeds against both the seller and buyer auth
systems; e2e tests cover both the new success paths and confirm the cookie-based
web paths are unaffected; the `OriginGuard` change has an explicit second
reviewer sign-off.

## Phase 2 — Expo app scaffold

**Goal:** stand up `apps/mobile` inside the existing Turborepo with zero feature
code, proving the build/dev/CI wiring works before investing in screens.

**Files/packages affected:** new `apps/mobile` (Expo Router + NativeWind +
TypeScript), `turbo.json` task wiring, `.github/workflows/ci.yml` path filter
for `mobile`, root `pnpm-workspace.yaml` entry.

**Dependencies:** Phase 0 (consumes `packages/design-tokens` for the NativeWind
config).

**Backend/frontend changes:** none.

**Risks:** low — well-trodden Expo setup path.

**Definition of done:** app boots on iOS Simulator and Android Emulator via
`pnpm turbo run dev --filter=mobile`; `pnpm turbo run lint --filter=mobile` and
`typecheck` pass; CI runs (and passes) a job for `mobile` on a trivial PR
touching only that package.

## Phase 3 — Auth screens

**Goal:** first real end-to-end test of Phase 1's backend work — a buyer can
authenticate from the native app and stay authenticated across app restarts.

**Files/packages affected:** `apps/mobile` login/register screens, session hook,
Expo SecureStore integration for token persistence.

**Dependencies:** Phases 0-2.

**Mobile changes:** `apps/mobile/features/auth` (or equivalent) — form UI
against `packages/validation`'s schemas, calling `packages/types`'s
customer-auth namespace configured with the new bearer-header mode from Phase 0.

**Risks:** medium — first integration test of the new backend auth mode; budget
time for back-and-forth with Phase 1 if the token flow doesn't quite match what
the mobile client needs (e.g. token refresh timing, error-shape mismatches).

**Definition of done:** a buyer can log in, force-close the app, reopen it, and
remain authenticated without re-entering credentials; logout clears the
SecureStore token and any subsequent authenticated call fails cleanly (401, not
a crash).

## Phase 4 — Catalog: discover, search, product detail

**Goal:** browse experience against existing, unchanged `@Public()` endpoints.

**Files/packages affected:** `apps/mobile/features/catalog` (or per-screen
equivalents), consuming `packages/types`'s `stores`, `products`,
`productSearch`, `categories` namespaces unchanged.

**Dependencies:** Phase 2 (doesn't need Phase 1/3 — these endpoints are public).

**Backend changes:** none.

**Risks:** low — no backend changes, pure UI build against stable, already-
paginated (`GET /products/search`, limit 24/max 50) endpoints.

**Definition of done:** a user can browse the store directory, search, filter by
category, and view a product's full detail (including variants) without being
logged in — matching the web app's own unauthenticated storefront browsing.

## Phase 5 — Cart

**Goal:** native-local cart, ported from `apps/web/lib/cart.ts`'s algorithm
(quantity math, currency-mixing guard, totals), not its `localStorage`
implementation.

**Files/packages affected:** `apps/mobile/features/cart`, using MMKV or
AsyncStorage as the native storage backend.

**Dependencies:** Phase 4 (needs product data to add to cart).

**Backend changes:** none — there is no server cart API to build against
(confirmed, no `Cart` model exists).

**Risks:** low.

**Definition of done:** cart persists across app restarts on-device; adding
items from two different stores triggers the same currency-mixing guard behavior
`lib/cart.ts` has on web (whatever that behavior is — block mixed carts, or
split by store; match web's actual current behavior, don't invent new behavior
here).

## Phase 6 — Checkout + proof-of-payment

**Goal:** the highest-value, highest-risk mobile-specific flow — capture and
submit proof-of-payment via camera/gallery.

**Files/packages affected:** `apps/mobile/features/checkout`, using
`expo-image-picker` (camera + gallery) and `expo-image-manipulator` (downscale
before upload — no client-side compression exists anywhere in the codebase
today, so this is new, not ported). Submits via multipart `FormData` to the
existing `POST /stores/:slug/checkout` endpoint unchanged.

**Dependencies:** Phases 3 (auth, if the checkout flow requires a logged-in
buyer) and 5 (cart contents feed the checkout payload).

**Backend changes:** none — the existing checkout endpoint already accepts
multipart with JSON-string fields for items/address plus an optional proof file;
this shape works from React Native's `FormData` unchanged.

**Risks:** medium — camera/gallery UX has real device fragmentation on Android;
test on a spread of real low/mid-range Android devices early, not just
simulators. The 5MB server-side cap is easy to hit with an uncompressed phone
photo — the `expo-image-manipulator` step is not optional polish, it's required
for the flow to work reliably.

**Definition of done:** a buyer can complete checkout end-to-end including
capturing a photo of a bank-transfer receipt, submitting it, and seeing the
resulting order in a pending-review state — verified against a real staging API,
not just a mock.

## Phase 7 — Orders + authenticated image viewing

**Goal:** order history/detail, plus the one pattern that must not be gotten
wrong: private payment-proof images are never fetched like public CDN images.

**Files/packages affected:** `apps/mobile/features/orders`, an
authenticated-image-fetch utility (fetch as a blob/data-URI with the bearer
token attached, then render from the local result — never a plain
`<Image source={{uri: publicUrl}}>` against the proof-image endpoint).

**Dependencies:** Phases 3, 6.

**Backend changes:** none — `GET .../payments/:paymentId/image` already streams
via an authenticated endpoint; this phase is purely about the mobile client
using it correctly.

**Risks:** medium — easy to accidentally treat a private, authenticated image
endpoint like a public one (this is a real category of bug, not a hypothetical —
the endpoint has no presigned-URL fallback and will 401/403 a naive `<Image>`
request with no auth header). Needs explicit code review against this specific
failure mode before merging.

**Definition of done:** a buyer can view their order history, open an order, and
see their previously-submitted proof-of-payment image render correctly; confirm
the image request in dev tools/network inspector actually carries the bearer
token and hits the authenticated endpoint, not a bare URL.

## Phase 8 — Push notifications

**Goal:** net-new infrastructure — nothing to port, since zero
WebSocket/SSE/push infra exists anywhere in the codebase today (confirmed by
repo-wide grep).

**Files/packages affected:**

- New `DeviceToken` Prisma model (userId/buyerAccountId, Expo push token,
  platform) in `packages/db/prisma/schema.prisma`.
- New endpoint in `apps/api` to register/unregister a device token per
  authenticated user.
- New BullMQ processor in `apps/workers` (mirroring the existing mailer
  processor's pattern) that calls Expo's push API.
- `apps/api/src/modules/notifications/notifications.service.ts` — at each
  existing `createIfNotOpen` call site (payment-proof submitted,
  low/out-of-stock), also enqueue a push job.
- `apps/mobile` — Expo push token registration on login, notification
  tap-to-deep-link handling.

**Dependencies:** Phase 3 (needs an authenticated user to associate a device
token with); benefits from Phase 9 (deep linking) for tap-through behavior, but
can ship a basic version without it.

**Backend changes:** as above — a new model, a new endpoint, a new queue
processor. All additive; doesn't touch the existing polling-based in-app
`Notification` read paths.

**Risks:** medium — new infrastructure, but reuses the proven BullMQ pattern
already validated for mailer sends. The real unknown is Expo push delivery
reliability/rate limits at this app's actual traffic volume, which isn't
verifiable from the repo alone.

**Definition of done:** a buyer whose proof-of-payment is approved or rejected
receives a push notification within a reasonable delay; a seller whose store
receives a new proof-of-payment submission likewise gets one (these two events
are the highest "acted on within minutes" value for a manual-payment business —
prioritize them over any other notification type for V1).

## Phase 9 — Deep linking

**Goal:** `biasmarket.com/store/:slug/product/:id`-style URLs open the app when
installed, fall back to the web page otherwise.

**Files/packages affected:** `apps/web` — publish `apple-app-site-association`
and `assetlinks.json` static files at the domain root (no app-code change).
`apps/mobile` — Expo Router config for Universal Links (iOS) / Android App
Links, mirroring the existing web URL structure.

**Dependencies:** none functionally, but sequenced late since it depends on
having real screens to deep-link into (Phases 4, 6, 7).

**Risks:** low-medium — Apple/Google domain verification is often the slow,
fiddly part; start the config work early relative to when it's actually needed,
since turnaround isn't fully controllable.

**Definition of done:** tapping a product link on a device with the app
installed opens the app directly to that product; the same link on a device
without the app installed opens the web page.

## Phase 10 — Testing hardening + beta

**Goal:** Maestro flows for the golden paths, real-device beta with a small
buyer cohort.

**Files/packages affected:** new `apps/mobile/.maestro/` flow definitions
covering browse → checkout → proof-upload → order-detail; TestFlight (iOS) and
Play Store Internal Testing (Android) distribution config.

**Dependencies:** Phases 4-9 substantially complete.

**Risks:** low — mostly time, not technical risk.

**Definition of done:** the golden-path Maestro flow passes against a staging
build; a small beta cohort has used the app to complete at least one real
checkout.

## Phase 11 — Store release

**Goal:** production submission.

**Files/packages affected:** EAS Build production profiles, `eas submit` config
for both stores.

**Dependencies:** Phase 10.

**Risks:** low-medium — first-submission App Store/Play Store review timelines
are the team's biggest unknown here, not engineering effort; budget calendar
slack accordingly, not additional dev time.

**Definition of done:** the app is live on the App Store and Play Store.

## Testing strategy

- **Unit (pure logic):** Vitest — same runner as `apps/api`/`apps/web`;
  `packages/utils` and `packages/validation` tests run unchanged against the
  mobile bundle too.
- **Component:** React Native Testing Library — new, native-specific.
- **API contract:** the existing `apps/api` e2e suite (`vitest.config.e2e.ts`,
  real `AppModule`) is fully reused — mobile doesn't need its own backend test
  suite, it just needs Phase 1's new bearer-auth paths added to the existing
  one.
- **E2E on-device:** Maestro, not Detox — YAML flows, no native rebuild required
  per test change, meaningfully lower maintenance for a small team.
- **Web E2E:** existing `apps/web` E2E tooling stays untouched by this plan.

## CI/CD strategy

1. **EAS Build** for iOS/Android binaries — avoids the team maintaining
   Xcode/Android Studio build machines directly.
2. **EAS Update** (OTA) for JS-only changes between store releases — lets the
   team ship fixes without a multi-day App Review wait each time.
3. GitHub Actions triggers `eas build` on merge to a release branch, adding a
   `mobile` filter alongside the existing per-package filters in
   `.github/workflows/ci.yml`.
4. Internal distribution (TestFlight + Play Internal Testing) on every
   release-branch build before promoting to a production track.
5. Store submission stays a manual, deliberate `eas submit` step — mirroring the
   deliberate blue/green production-deploy gate already documented for
   `apps/api`/`apps/web` in `docs/core/deploy.md`.

## Security considerations

- Tokens (both auth systems) live in Expo SecureStore only, never
  `AsyncStorage`.
- The `OriginGuard` exemption (Phase 1) must be scoped to already-verified
  bearer requests only — see Phase 1's Risks.
- Existing `ThrottlerGuard` configs (5-20 req/60s on sensitive endpoints) apply
  identically to mobile traffic — confirm they're keyed in a way that doesn't
  unfairly throttle a shared carrier-NAT IP across many mobile users, but no
  config change is expected to be needed.
- Certificate pinning and jailbreak/root detection are **not recommended for
  this MVP** — this is a merch storefront, not a banking app, and the added
  maintenance overhead (cert rotation coordination) isn't justified by the
  current threat model. Revisit if fraud patterns emerge.
- No client-embedded secrets for any mobile-specific integration (push, deep
  links) — keep every such flow server-mediated, matching how the rest of the
  app already avoids client-side secrets.

## Performance considerations

- `FlashList` over `FlatList` for the catalog/search results — better recycling
  performance for image-heavy rows.
- `expo-image` for disk+memory caching of product/store CDN images (same
  `cdn.biasmarket.com` host as web); payment-proof images are the explicit
  exception that must bypass any public-image cache layer (Phase 7).
- Existing pagination (`GET /products/search`, limit 24/max 50) is already
  suited to `useInfiniteQuery`-driven infinite scroll — no backend change
  needed.
- **No offline-sync engine** — deliberately rejected. This is a
  real-time-inventory, manual-payment business; showing stale stock/price data
  offline risks a buyer ordering something already sold out. React Query's
  default cache-then-refetch behavior is sufficient.

## Effort estimate

| Workstream                              | Relative effort | Biggest unknown                                                                        |
| --------------------------------------- | --------------- | -------------------------------------------------------------------------------------- |
| Phase 0 (package extraction)            | S               | How entangled the zod schemas are with Next-specific imports                           |
| Phase 1 (auth backend changes)          | M               | Whether better-auth's Bearer plugin interacts cleanly with the existing `admin` plugin |
| Phase 2 (Expo scaffold)                 | S               | Low — well-trodden path                                                                |
| Phase 4 (catalog)                       | M               | Low — pure UI build against stable public endpoints                                    |
| Phase 5 (cart)                          | S               | Low                                                                                    |
| Phase 6 (checkout + proof-of-payment)   | L               | Camera/gallery UX polish across Android device fragmentation                           |
| Phase 7 (orders + authenticated images) | M               | Low                                                                                    |
| Phase 8 (push notifications)            | M               | Expo push delivery reliability at this app's actual volume is unverified               |
| Phase 9 (deep linking)                  | M               | Apple/Google domain verification turnaround                                            |
| Phase 10 (testing + beta)               | S               | Low                                                                                    |
| Phase 11 (store submission)             | M               | First-submission review timelines, not engineering effort                              |

Scale: XS < S < M < L < XL, relative only — no calendar estimates, per the
audit's own instruction to avoid false precision.

## Risk register

| Risk                                                                                  | Probability | Impact | Mitigation                                                                                                                                                                          | Validate when         |
| ------------------------------------------------------------------------------------- | ----------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Bearer-plugin change destabilizes existing seller cookie auth                         | Low         | High   | Ship behind e2e coverage before any mobile dependency; both transports coexist per-request, no removal of the cookie path                                                           | Phase 1               |
| Loosening `OriginGuard` opens a CSRF gap                                              | Medium      | High   | Scope the exemption strictly to requests carrying an already-verified bearer token; keep the Origin check fully intact for cookie-mode requests; mandatory second-reviewer sign-off | Phase 1, before merge |
| Camera/gallery proof-upload UX has high device fragmentation on Android               | Medium      | Medium | Test on a spread of real low/mid-range Android devices early, not just simulators                                                                                                   | Phase 6               |
| Expo push delivery reliability/rate limits at actual scale                            | Low-Medium  | Medium | Start with the two highest-value notification types only; monitor delivery success rate before expanding                                                                            | Phase 8, post-beta    |
| App Store/Play Store review rejects on first submission                               | Medium      | Low    | Submit to TestFlight/Internal Testing well before a target launch date; budget calendar slack, not engineering time                                                                 | Phase 10-11           |
| Universal/App Links domain verification friction                                      | Medium      | Low    | Start AASA/assetlinks.json config early — independent of app functionality, can be validated in isolation                                                                           | Phase 9               |
| Team drifts toward duplicating cart/validation logic instead of using shared packages | Low         | Low    | Phase 0's extraction makes the shared path the path of least resistance, not a discipline problem                                                                                   | Ongoing               |

## Open questions

- Does better-auth's Bearer plugin compose cleanly with the already- configured
  `admin` plugin and custom `plan`/`premiumUntil` additional fields? Not
  verifiable from the repo alone — needs a Phase 1 spike.
- What's the actual expected push-notification volume? Affects whether Expo's
  push service tier is sufficient or a direct FCM/APNs integration becomes worth
  the extra setup later.
- Is there appetite for a seller-mobile app later (V2)? Would change how much
  the Phase 0 design-token/navigation groundwork should anticipate a dashboard
  surface now versus later.

## Files likely touched (cumulative, across all phases)

- New: `apps/mobile/**`, `packages/validation/**`
- Extended: `packages/design-tokens/**`
- `packages/types/http.ts` (injectable auth-header strategy)
- `apps/api/src/auth/auth.config.ts`,
  `apps/api/src/modules/customer-auth/customer-session.guard.ts`,
  `apps/api/src/modules/customer-auth/customer-auth.controller.ts`,
  `apps/api/src/modules/customer-auth/origin.guard.ts`
- `packages/db/prisma/schema.prisma` (new `DeviceToken` model, Phase 8)
- `apps/workers/src/jobs/**` (new push-send processor, Phase 8)
- `apps/api/src/modules/notifications/notifications.service.ts` (push enqueue
  call sites, Phase 8)
- `apps/web/public/.well-known/apple-app-site-association`,
  `apps/web/public/.well-known/assetlinks.json` (Phase 9)
- `.github/workflows/ci.yml` (mobile path filter, `turbo.json`)

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm test` clean across the whole monorepo
  after every phase — no phase should leave `apps/web` or `apps/api` in a worse
  state than before it started.
- `pnpm --filter api test:e2e` covers both new Phase 1 auth paths without
  regressing existing cookie-based coverage.
- Each phase's own Definition of Done (above) is the acceptance criterion for
  that phase — don't start the next phase's mobile screens against an unverified
  backend change from the phase before it.
