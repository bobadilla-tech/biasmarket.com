# Mobile PR stack review: research notes

**Status:** Notes after three review rounds (see `review-rounds.md` for what
changed between rounds). Nothing has been posted to GitHub yet. Drafts are in
`draft-comments.md`.

**Reviewer account for `gh`:** `UltiRequiem` (selected per-command with
`GH_TOKEN=$(gh auth token --user UltiRequiem)`, so the globally active `gh`
account was never switched).

## Scope

Nine stacked PRs by `OneLastChanc3` implementing phases 3-11 of
`.artifacts/2026/08/20260831--mobile-app-mvp/plan.md` (Expo buyer app). Each
PR's base is the previous PR's head branch; only #220 targets `main`.

| PR   | Phase | Head SHA   | Diff (non-lock)           | Review state before this pass                              |
| ---- | ----- | ---------- | ------------------------- | ---------------------------------------------------------- |
| #220 | 3     | `5a0c43af` | auth screens, SecureStore | Approved by UltiRequiem; CodeRabbit left 3 inline comments |
| #223 | 4     | `5b9ff4b5` | catalog, search, product  | none                                                       |
| #231 | 5     | `253798aa` | cart + shared cart util   | none; **all CI red**                                       |
| #232 | 6     | `d17dcea0` | checkout + proof upload   | none                                                       |
| #233 | 7     | `4bf2a909` | orders + private proof    | none                                                       |
| #234 | 8     | `df8661ae` | push (api, workers, db)   | none; Codacy red                                           |
| #235 | 9     | `a1f40a28` | deep links, AASA gen      | none                                                       |
| #236 | 10    | `0b0b8841` | Jest, Maestro, EAS cfg    | none; Codacy red                                           |
| #237 | 11    | `5880e197` | release workflows, fixes  | none; Codacy red                                           |

Main at review time: `854d993a`. CodeRabbit is configured to skip stacked bases
("Review skipped: reviews are disabled for this base branch"), so #223 to #237
had no automated or human review before this pass.

## Method

1. Read every PR's diff separately (`git diff origin/<base>...origin/<head>`,
   lockfile excluded), not just the combined stack.
2. Checked each behavioral claim against the backend and the shared packages at
   the stack top (`origin/codex/phase11-release`), in a throwaway worktree under
   the session scratchpad.
3. Installed deps there (`pnpm install --frozen-lockfile --ignore-scripts`) and
   ran what is cheap to run: mobile `typecheck`/`lint`/`test`, Jest component
   tests, `expo config`, the Orval generator, a zod probe.
4. Compared the stack against the plan's per-phase definition of done and risk
   notes.

## What ran, and the results

| Check (stack top)                                              | Result                                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `turbo run typecheck lint test --filter=mobile`                | pass (9 tasks)                                                                                    |
| `pnpm --filter mobile test:components` (Jest)                  | pass (2 suites, 4 tests)                                                                          |
| `expo config --json`                                           | works; shows the `/store` Android intent filter and no `projectId` unless `EAS_PROJECT_ID` is set |
| `pnpm --filter @biasmarket/types generate` (Orval)             | **fails**: spec validation rejects `/stores/{slug}/account/devices` (no `slug` path parameter)    |
| zod probe: API DTO regex vs `expoPushPayloadSchema`            | `ExpoPushToken[...]` passes the DTO and **throws** in the queue schema                            |
| `@expo/config` `getConfig` on a project without `node_modules` | throws "module `expo` is not installed" (same call path `eas-cli` uses)                           |
| API vitest for device-token / notifications specs              | could not run locally (Prisma client not generated, known env gap); not used as evidence          |

## Findings, grouped by PR

IDs match `draft-comments.md`. Severity: **B** blocker, **S** should fix before
merge, **Q** question / design, **N** nit.

### #220: buyer auth (already approved)

- **220-1 (S)** Register is two calls (`register` then `signIn`). The backend
  makes `register` single-use for `confirm` tokens (`ConflictException` once a
  password exists). If `signIn` then fails (mistyped phone, throttle, network),
  the screen says "Could not complete registration", the password is already
  set, and retrying `register` gets a 409 that is also shown as the generic
  error. The user is never told to go to Login.
- **220-2 (Q)** The bearer token is a stateless HMAC token with a fixed 7-day
  expiry. The sliding renewal in `CustomerSessionGuard` only reissues the
  _cookie_; the mobile client never sees it. So a buyer is signed out 7 days
  after login regardless of activity, which is weaker than the phase 3
  definition of done ("remain authenticated"). Needs a product decision (longer
  TTL for mobile, or a token-refresh response header the client persists).
- **220-3 (N)** Adding `mobile` to the shared `messages` object ships ~10 KB of
  mobile-only strings to the web client (`getMessages(locale)` in the web
  request config; `NextIntlClientProvider` has no `messages` prop, so next-intl
  v4 forwards everything). Not measured, inferred from config.
- Fixed later in the stack (see stack-level notes): infinite spinner when the
  startup SecureStore read throws (fixed in #237).

### #223: catalog

- **223-1 (S)** Search screen store selection does not scope results.
  `GET /products/search` accepts only `q`, `page`, `limit`, `category`, `sort`.
  Tapping a store (from Discover, or a chip) only changes which category chips
  are shown; results stay global. The `category` filter is a case-insensitive
  name match across all stores, so "Albums" from store A also returns store B's
  "Albums". The query key also omits `storeSlug`.
- **223-2 (S)** `ci.yml` drops `branches: [main]` from `pull_request` for the
  whole repo (intended for stacked PRs). That is a permanent CI policy change
  hiding in a feature PR. Revert it when the stack lands, or land it as its own
  PR.
- **223-3 (N)** Lockfile churn: +29,460 / -10,908 lines, and the header is
  rewritten to double quotes, which means a formatter touched `pnpm-lock.yaml`.

### #231: cart

- **231-1 (B)** `pnpm-lock.yaml` at the PR head is the empty blob (`e69de29`, 0
  bytes). `pnpm install --frozen-lockfile` cannot work; 16 CI checks fail. It is
  restored in #232.
- **231-2 (N)** Hard-coded Spanish strings in the product detail screen ("No
  pudimos encontrar...", "Volver al catalogo", "Seguir explorando") replaced
  `t(...)` calls from #223. Fixed in #237, but the intermediate state regresses.
- **231-3 (S)** `readStoreCart` swallows every error and returns `[]`;
  `updateStoreCart` then writes `update([])` back. One transient AsyncStorage
  read failure followed by "add to cart" overwrites the stored cart with just
  the new item.
- **231-4 (N)** The per-variant "Add" button disables on stock but its styling
  only uses the product-level `disabled`, so a sold-out variant looks enabled.

### #232: checkout and proof upload

- **232-1 (S)** `await clearStoreCart(...)` runs in the same `try` as the
  checkout POST. If the local write throws after the server created the order,
  the screen shows an error and keeps the cart, inviting a duplicate order.
  Cleanup should not be able to fail the submit.
- **232-2 (S)** Prefilled fields cannot be cleared:
  `value = form.x ||
  profile.x`. Deleting the last character snaps the profile
  value back, and submit applies the same fallback.
- **232-3 (S)** Android activity recreation while the camera is open is not
  handled (`ImagePicker.getPendingResultAsync`). The plan lists camera/gallery
  fragmentation as the top phase 6 risk.
- **232-4 (Q)** `requestMediaLibraryPermissionsAsync()` before
  `launchImageLibraryAsync` is unnecessary on current iOS/Android pickers and a
  denial dead-ends the flow with no path to Settings.
- **232-5 (N)** The catch shows `error.message` verbatim: Spanish backend text
  in the English UI, or "Network request failed".
- **232-6 (Q)** Courier form omits `shippingDocumentType/Number`, `line2` and
  `region`, which the shared schema and web form support (all optional).
  Peruvian agency pickup normally needs the recipient's document. Intentional?
- Checked and fine: the request sends `items` without prices (server
  recomputes), JSON-string `items` matches the controller's normalizer,
  multipart goes through `customFetch` without forcing a `Content-Type`.

### #233: orders and private proof

- **233-1 (Q/S)** Order history uses `customerAuth.me(storeSlug).orders`, so it
  is limited to the one store the session was created for, even though the
  session token is global and `GET /account/orders` already returns every order
  with `storeSlug`/`storeName`. It also forces login with a typed store slug and
  stores one slug in SecureStore, so shopping in a second store loses prefill
  and its orders.
- **233-2 (S)** `t("auth.signIn")` is not a key in either catalog.
  `orders/index` was changed in #237, but `orders/[orderId].tsx:52` still
  renders the literal `auth.signIn` on the signed-out screen, which is exactly
  where a deep link lands (#235).
- **233-3 (N)** `customFetchBlob` duplicates `customFetch`'s header merge and
  401 handling. Extract a shared request helper so the two cannot drift.
- Checked and good (this was the plan's explicit phase 7 review item): private
  proof goes through the authenticated endpoint, is rendered with RN core
  `Image` from a data URI (never `expo-image`/disk cache), and the cached data
  is removed on logout / 401.

### #234: push notifications (highest risk)

- **234-1 (S, high; latent)** `createIfNotOpen(..., tx)` is called _inside_ the
  checkout and submit-proof `$transaction`s. The new code awaits a
  `deviceToken.findMany` on `this.prisma` (second connection) and
  `pushQueue.add` (Redis) inside that transaction. `buildRedisConnection` sets
  `maxRetriesPerRequest: null`, so with Redis down `add()` is expected to wait
  rather than reject (inferred from ioredis/BullMQ behavior, not reproduced);
  the checkout would stall until Prisma's default 5 s interactive-transaction
  timeout and roll back the order. Any enqueue error (including 234-3) rolls the
  order back too, and a job can be enqueued for a transaction that later rolls
  back. The `add()` branch only runs for sellers with a registered token, and
  nothing in this stack registers one, so it is dormant today; the two queries
  still run on every proof submission.
- **234-2 (B)** `pushToBuyer` is awaited, unguarded, at the end of
  `ReviewPaymentUseCase` _after_ the review committed. A queue/DB/zod error
  returns 500 for an approval that already happened. The email send right above
  it is wrapped in try/catch for exactly this reason.
- **234-3 (S)** Token format mismatch: DTO accepts `ExpoPushToken[...]`, queue
  schema requires `startsWith("ExponentPushToken[")`. Reproduced with zod.
- **234-4 (S)** `QUEUE_NAMES.PUSH` is registered with no `defaultJobOptions` in
  both `apps/api` and `apps/workers`. BullMQ default is `attempts: 1` and
  completed jobs are kept forever. Mailer/orders queues use bounded retry and
  cleanup (`defaultJobOptions`, see its comment). The processor throws on 5xx
  expecting a retry that will not happen.
- **234-5 (S)** `push.processor.ts` treats every `status: "error"` ticket as
  retryable and never removes tokens on `DeviceNotRegistered`. Dead tokens
  accumulate and get re-sent forever; Expo receipts are not read at all. Workers
  depend only on `@biasmarket/queue` (no DB), so pruning needs an internal API
  endpoint.
- **234-6 (S)** OpenAPI is invalid for Orval: `/stores/{slug}/account/devices`
  declares `{slug}` but no path parameter (same gap `changePassword`/`logout`
  already document and fix with `@ApiParam`).
  `pnpm --filter @biasmarket/types
  generate` fails, and
  `packages/types/generated/**` was not regenerated, which CLAUDE.md requires.
- **234-7 (N)** Device endpoints mutate state with a cookie-capable guard and no
  `OriginGuard`; other mutation routes in this module use
  `@UseGuards(CustomerSessionGuard, OriginGuard)`.
- **234-8 (N)** Push copy is hard-coded Spanish and puts the full cuid order id
  in the body; the app UI shows the first 8 characters and is bilingual.
- **234-9 (Q)** Registration only happens inside `signIn`. A restored session
  (app restart) never re-registers, permission granted later is never picked up,
  and a failed unregister leaves the previous account's token on the device
  until the next register.
- **234-10 (Q)** Seller registration (`/mobile/devices`) and seller enqueue have
  no client in this stack (seller dashboard is out of MVP scope) and no tests;
  nothing exercises `pushToBuyer`/the enqueue branch (specs only stub the
  providers).
- **234-11 (N, verify)** `router.push` from the root layout's effect on cold
  start (before the navigator is ready); no `setNotificationHandler`, so
  foreground pushes are not shown; deep link uses the _session's_ store slug, so
  an order from another store 404s.

### #235: deep links

- **235-1 (S)** The web app is locale-prefixed. `i18n/routing.ts` is
  `defineRouting({ locales: ["es","en"], defaultLocale: "es" })` (next-intl
  default `localePrefix: "always"`) and routes live under
  `app/[locale]/(storefront)/store/[slug]/...`. Canonical URLs are
  `/es/store/...`. The AASA components (`/store/*/product/*`,
  `/store/*/account/orders/*`) and the Android `pathPrefix: "/store"` do not
  match those, so links from search results, the sitemap, shares, and the
  address bar will not open the app. Only locale-less links (e.g. the API's
  emailed `${webUrl}/store/${slug}/account/confirm`) match. The Expo router has
  no `/:locale` mapping either.
- **235-2 (S)** iOS and Android claim different path sets. Android's `/store`
  prefix claims every store URL, including `/store/:slug/account/confirm?token=`
  emailed by `customer-account.service.ts`, which the app has no route for
  (Unmatched Route on a verified install). The doc says both platforms claim
  `/store/*` and that "store URLs open that store's catalog"; the iOS file lists
  only product and order paths.
- **235-3 (N)** Deep-link params flow into the generated client unencoded
  (`/stores/${slug}/account/orders/${orderId}`). A crafted link with `..%2F`
  makes the app send an authenticated GET to another API path. GET-only and the
  response renders only for the victim, so low impact; validate the params.

### #236: tests, Maestro, EAS config

- **236-1 (S)** `mobile-maestro.yml` never runs `pnpm install`, then runs
  `eas build`. eas-cli needs `expo` resolvable to read the config (reproduced
  the underlying `@expo/config` error). Also `pnpm/action-setup` `version: 10`
  while `packageManager` is `pnpm@10.11.0` (ci.yml uses `env.PNPM_VERSION`), and
  `setup-node@v4`/node 22 vs the repo's v6/node 24.
- **236-2 (S)** `runtimeVersion: { policy: "appVersion" }` sends every OTA
  update to all binaries with the same `version`. Adding a native module in
  JS-only releases would crash older binaries; `fingerprint` is the safer
  policy.
- **236-3 (N)** The Maestro flow only runs on pushes to a `mobile-release`
  branch that does not exist yet and on dispatch, so nothing gates PRs on it;
  the flow taps the photo picker by screen coordinates (`25%, 35%`).
- **236-4 (N)** Mobile vitest tests added in #220-#233 were not run by CI until
  this PR (main's Mobile job ran lint + typecheck only).

### #237: release

- **237-1 (S)** `mobile-production-update.yml` and `mobile-store-submit.yml`
  have no pnpm/install step; `eas update` bundles locally and cannot work
  without `node_modules` (same root cause as 236-1). `production-build.yml`
  installs.
- **237-2 (S)** `mobile-production-build.yml` fires on every push to
  `mobile-release` that touches `packages/**` (including web-only packages),
  alongside the preview build from the Maestro workflow: two store builds with
  `autoIncrement`. Make it dispatch/tag only.
- **237-3 (S)** Store policy: Apple 5.1.1(v) and Play require in-app account
  deletion when the app supports account creation. Buyers set a password in-app;
  there is no deletion flow and `metadata.md` does not mention it. Likely a
  review rejection (the plan's risk register already expects store-review risk).
- **237-4 (N)** `t` was added to `useCallback`/`useEffect` deps of the session
  provider although `clearLocalSession` never uses it; switching language now
  re-runs the restore effect, bumps `sessionGeneration`, and can abort an
  in-flight login with `auth.sessionChanged`. The translated `Error` messages
  are also never shown (screens catch and print a generic string).

## Stack-level observations

- Fixes for earlier PRs land late: the infinite startup spinner (#220) is fixed
  in #237, the Spanish regression in #231 is fixed in #237, `auth.signIn` is
  half-fixed in #237. Each PR should be correct on its own because they may
  merge separately; fold fixes down.
- #231's head is not installable, so #231 cannot be merged as a standalone step.
- The lockfile is rewritten four times (+29k, -36k, +28k, +2.5k). The final net
  diff vs main is only about +2.7k lines, so squash-merging the stack is fine,
  but each intermediate PR is unreviewable on that file.
- `auth` design: a global buyer token but a single-store session (login by store
  slug, one slug in SecureStore) is the root of 233-1, 234-11 and part of 232.
- Mixed import style in `apps/mobile` (some files keep `.js`, others dropped
  it); pick one.

## Candidates investigated and dropped

- `app.config.js` using `require`/`module.exports` inside a `"type": "module"`
  package: `expo config` evaluates it fine, so not a bug (only a style
  inconsistency with the ESM-only rule; not worth a comment).
- Login/register "required field" for every error: login schema only has
  `min(1)` rules so the message is accurate there; #237 also maps the password
  length/mismatch cases for register.
- "Logout does not revoke the server session": the backend session is stateless
  (HMAC), so there is nothing to revoke; the `logout` route only clears a
  cookie.
- "Token for store A rejected by store B": session tokens are global
  (`BuyerAccount`), not per store.
- `cartCurrency` removal from `apps/web/lib/cart.ts`: no remaining web importer.
- `@biasmarket/utils/cart` resolving to `dist/`: pre-existing convention for all
  workspace packages.
- Checkout login link losing context (`returnTo`): handled in #237.
- Seller push `body: ''` zod failure: both call sites pass a non-empty body.

## Not verified

- Behavior on real devices (camera recreation, push delivery, App Links
  verification). Everything above is from code, the backend, and local commands.
- Whether a real Expo token is ever `ExpoPushToken[`; docs show both prefixes.
- Why Codacy fails on #234/#236/#237 and Vercel on several PRs (no log access
  from here).
