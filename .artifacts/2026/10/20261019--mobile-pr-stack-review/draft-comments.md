# Draft review comments: mobile PR stack

**Status:** Drafts, not posted. Written for the PR author (`OneLastChanc3`) and
the other maintainers who will read the PR threads. Line numbers are on each
PR's head commit (right side of the diff) and were re-checked against the head
SHAs in `review-notes.md`.

**Proposed posting plan** (one `gh api .../pulls/N/reviews` call per PR, posted
as `UltiRequiem`):

| PR   | Proposed event  | Why                                                                              |
| ---- | --------------- | -------------------------------------------------------------------------------- |
| #220 | COMMENT         | Already approved by UltiRequiem; extra items are follow-ups                      |
| #223 | COMMENT         | Two should-fix items, nothing that breaks the branch                             |
| #231 | REQUEST_CHANGES | Head has an empty `pnpm-lock.yaml`, CI fully red                                 |
| #232 | COMMENT         |                                                                                  |
| #233 | COMMENT         |                                                                                  |
| #234 | REQUEST_CHANGES | Push enqueue inside the checkout transaction; unguarded push after review commit |
| #235 | COMMENT         | Deep links as written will not match real URLs                                   |
| #236 | COMMENT         |                                                                                  |
| #237 | COMMENT         |                                                                                  |

One extra issue comment on #220 carries the stack-level notes; each review body
links to it.

Severity tags used in comments: `blocker`, `should fix`, `question`, `nit`.

---

## Stack-level comment (issue comment on #220)

> **Stack-level notes (applies to #220 to #237)**
>
> I reviewed all nine PRs, each against its own base, then re-checked the
> findings against the stack top (`codex/phase11-release`). Per-PR comments are
> on each PR; this is the cross-cutting part.
>
> 1. **#231 is not mergeable as a step.** Its head commit has an empty
>    `pnpm-lock.yaml` (0 bytes) and 16 CI checks fail. #232 restores the file.
>    The lockfile is also rewritten in every PR (+29k, -36k, +28k lines; #223's
>    header is reformatted to double quotes, so a formatter was run over it).
>    Please keep `pnpm-lock.yaml` out of `pnpm fix`/prettier and regenerate it
>    once with `pnpm install` per PR.
> 2. **Fixes for earlier PRs land in #237.** The startup SecureStore-read
>    failure that leaves the app on a spinner (#220), the Spanish strings that
>    replace `t()` calls in #231, and the `auth.signIn` key that never existed
>    (#233) are all patched in the last PR or not at all. If these PRs can merge
>    separately, each should be correct on its own.
> 3. **CodeRabbit skips stacked bases**, so #223 to #237 had no automated
>    review, and `apps/mobile`'s vitest suite was not run in CI until #236
>    (main's Mobile job runs lint + typecheck only).
> 4. **Red checks I could not diagnose.** Vercel fails on #223, #231, #233,
>    #234, #237 and Codacy on #234, #236, #237; I have no log access, so please
>    look before merging.
> 5. **CI trigger change.** #223 removes `branches: [main]` from `pull_request`
>    for the whole repo. That is a permanent policy change; revert it when the
>    stack lands or land it separately.
> 6. **Session model.** The backend buyer token is global (`BuyerAccount`), but
>    the app logs in per store slug and stores one slug in SecureStore. That is
>    the root of several smaller issues (order history limited to one store,
>    checkout prefill only for that store, push deep links using the session's
>    slug). Worth deciding the intended model before more screens depend on it.
> 7. Good: shared `@biasmarket/utils/cart` and `@biasmarket/validation` reuse,
>    the bearer/`X-Client: mobile` design, and the private payment-proof
>    handling (authenticated fetch, RN core `Image` with a data URI, cache purge
>    on logout) are exactly what the plan asked for.

---

## #220: feat(mobile): buyer auth and SecureStore sessions

**Review body (COMMENT):**

> Already approved; this is a second pass with two follow-ups and a nit, none
> blocking. Stack-level notes are in my comment above.

### 220-1 · should fix · `apps/mobile/src/features/auth/session-context.tsx:157`

> `register()` is two calls, and the first one is single-use: for a `confirm`
> token `CustomerAuthService.register` throws `ConflictException` once the
> account has a password. If `signIn` fails here (mistyped phone, the 5/min
> throttle, a dropped connection), the user has a password but sees "Could not
> complete registration" (`register.tsx:55`). Retrying `register` returns 409,
> shown as the same generic text, so they never learn to use Login.
>
> Suggest separating the two failure modes: if `customerAuth.register` succeeded
> and `signIn` failed, show a message that the password was saved and send them
> to `/login` with the slug prefilled; and surface the 409 as "this account
> already has a password, sign in".

### 220-2 · question · `apps/mobile/src/features/auth/session-context.tsx:136`

> The token stored here is the stateless HMAC session token with a fixed 7-day
> expiry (`createCustomerSessionToken`). The sliding renewal in
> `CustomerSessionGuard` only reissues the `Set-Cookie`, which this client never
> reads, so a buyer is signed out 7 days after login regardless of activity (the
> 401 handler then clears the session silently). The phase 3 definition of done
> is "remain authenticated". Is a weekly re-login acceptable for a shopping app,
> or should the API return a refreshed token (e.g. `X-Session-Token` header when
> `X-Client: mobile`) that the client persists, or use a longer TTL for mobile?

### 220-3 · nit · `packages/i18n/index.ts:36`

> Adding `mobile` to the shared `messages` object means `getMessages(locale)`
> now includes ~10 KB of mobile-only strings (including the iOS permission
> texts) for the web app too: `apps/web/i18n/request.ts` returns
> `getMessages(locale)`, and `NextIntlClientProvider` in
> `app/[locale]/layout.tsx` is rendered without a `messages` prop, which in
> next-intl v4 forwards all messages to the client. If that matches what you see
> in the page payload, consider exposing the mobile catalogs as a separate
> export (`@biasmarket/i18n/mobile`) or omitting the namespace in the web
> request config.

---

## #223: feat(mobile): public catalog browsing

**Review body (COMMENT):**

> Catalog structure, pagination (`nextProductSearchPage` + FlashList), and the
> public-endpoint usage look good. Two things to fix and one note. Stack-level
> notes: see my comment on #220.
>
> Note: `pnpm-lock.yaml` here is +29,460 / -10,908 lines and the header changed
> to double quotes, which means a formatter ran over it. Please regenerate it
> with `pnpm install` only.

### 223-1 · should fix · `apps/mobile/src/app/search.tsx:51`

> Selecting a store does not scope the results. `GET /products/search` only
> takes `q`, `page`, `limit`, `category`, `sort` (see
> `ProductSearchController`); there is no store parameter, and
> `productSearch.search` at line 54 is called without one. So tapping a store on
> Discover (which routes to `/search?storeSlug=...`) or a store chip only
> changes which category chips appear; the product list is still global. Worse,
> `category` is a case-insensitive _name_ match across all stores, so choosing
> "Albums" under store A also returns store B's "Albums".
>
> Also `storeSlug` is missing from the query key, so if the API gains a store
> filter later the cache would mix stores.
>
> This also backs the store deep link added in #235
> (`store/[storeSlug]/index.tsx` redirects to `/search?storeSlug=...`), which
> would open a global search.
>
> Options: add an optional `store` (slug) param to the search endpoint and pass
> it here (preferred, small change), or use the store's own product listing for
> the store-scoped view and keep this screen global-only.

### 223-2 · should fix · `.github/workflows/ci.yml:10`

> Removing `branches: [main]` makes CI run for PRs against any base, repo-wide,
> and stays that way after the stack merges. Fine as a temporary change to get
> CI on stacked PRs, but please revert it when the stack lands (or move it to
> its own PR so it gets reviewed as a CI policy change).

---

## #231: feat(mobile): persistent per-store cart

**Review body (REQUEST_CHANGES):**

> **Blocker: `pnpm-lock.yaml` on this branch is empty.** The head commit
> (`253798aa`) contains the empty blob (`e69de29`, 0 bytes); the diff shows
> -36,142 lines. `pnpm install --frozen-lockfile` cannot work, which is why 16
> checks (API, Web, Mobile, Types, Utils, E2E, CI Success, ...) are red. #232
> re-adds the file, so the stack recovers, but this PR cannot merge on its own.
> Please restore the lockfile (e.g. start from #220's version and run
> `pnpm install` so it adds `@react-native-async-storage/async-storage` and the
> #223 deps; #223's copy is the double-quote-reformatted one).
>
> Otherwise the shared `@biasmarket/utils/cart` extraction is clean and
> `apps/web` keeps identical behavior (I checked nothing else imports the
> removed `cartCurrency` from `lib/cart.ts`). Three smaller items inline.

### 231-1 · should fix · `apps/mobile/src/features/cart/cart-storage.ts:33`

> `readStoreCart` swallows every error and returns `[]` (line 19), and this line
> feeds that into `update(current)` and then `setItem`. A single transient
> AsyncStorage read failure followed by "Add to cart" overwrites the stored cart
> with only the new item, silently dropping everything else. Let the read inside
> `updateStoreCart` throw (surface `cart.saveFailed`), and only fall back to
> `[]` for "key missing" and "unparseable JSON". Also worth validating the
> parsed shape (price/quantity numbers) instead of `as CartItem[]`, since a bad
> entry would make `item.price * item.quantity` render `NaN`.

### 231-2 · nit · `apps/mobile/src/app/product/[storeSlug]/[productId].tsx:46`

> This replaces `t("catalog.notFound")` / `t("catalog.backToCatalog")` from #223
> with literal Spanish (also `Seguir explorando` at line 195), so the English
> locale regresses. Looks like a merge-conflict resolution; #237 puts the `t()`
> calls back, but this PR should not regress them in between.

### 231-3 · nit · `apps/mobile/src/app/product/[storeSlug]/[productId].tsx:257`

> The button is `disabled` for sold-out variants (line ~253) but the `className`
> only checks the product-level `disabled` prop, so a sold-out variant still
> renders in the active pink style. Use the same predicate for both.

---

## #232: feat(mobile): checkout and payment proof upload

**Review body (COMMENT):**

> The request shape is right (items sent without prices, JSON-string `items`
> matching `CheckoutController`'s normalizer, multipart through `customFetch`
> without forcing a content type) and `compressPaymentProof` with a size loop is
> the correct answer to the 5 MB cap. Six inline items below; the first four are
> the ones I would fix before merge.

### 232-1 · should fix · `apps/mobile/src/app/checkout/[storeSlug].tsx:306`

> `await clearStoreCart(storeSlug)` is inside the same `try` as the checkout
> POST. If this local write throws after the server has already created the
> order, the catch shows an error, the cart is kept, and the buyer taps "Place
> order" again and creates a second order (there is no idempotency key on this
> endpoint). Cleanup must not be able to fail the submit: put the clear in its
> own `try/catch` (log and continue) and always navigate to the success screen
> once `result.order` exists.

### 232-2 · should fix · `apps/mobile/src/app/checkout/[storeSlug].tsx:391`

> `value={form.customerName || profile.name || ""}` (and the same for
> phone/email below, and in `submitCheckout` at line 223) means the buyer can
> never clear a prefilled field: deleting the last character makes
> `form.customerName === ""`, so the profile value reappears. A buyer who wants
> a different name/email than their account has to type over it character by
> character, and an optional email cannot be removed. Initialize `form` from the
> profile once when it loads (`useEffect` that sets only still-empty, untouched
> fields) and bind the inputs to `form` only.

### 232-3 · should fix · `apps/mobile/src/app/checkout/[storeSlug].tsx:194`

> The plan calls Android camera/gallery fragmentation the main phase 6 risk. On
> low-memory Android devices the OS can destroy the app's activity while the
> camera is open; the result is then only retrievable with
> `ImagePicker.getPendingResultAsync()` on the next launch, and the in-memory
> checkout form is gone as well. At minimum, call `getPendingResultAsync` when
> the checkout screen mounts and feed a recovered asset through
> `compressPaymentProof`, and consider persisting the non-sensitive form fields
> while the picker is open. This is hard to catch in the emulator; worth a real
> low-RAM device pass as the plan intends.

### 232-4 · question · `apps/mobile/src/app/checkout/[storeSlug].tsx:200`

> `requestMediaLibraryPermissionsAsync()` before `launchImageLibraryAsync` is
> not needed on current iOS/Android pickers (the system photo picker runs
> out-of-process) and a denial stops the flow with "We need permission..." and
> no way to Settings. Could the gallery path skip the explicit permission call
> (keep it for the camera), or at least offer `Linking.openSettings()` when
> `canAskAgain` is false?

### 232-5 · nit · `apps/mobile/src/app/checkout/[storeSlug].tsx:320`

> `error.message` goes straight to the UI. Backend validation errors are Spanish
> (and can be an array joined into one string), network failures give "Network
> request failed". For `ApiError` with 400, showing the server text is fine as a
> fallback; for everything else use `t("checkout.submitFailed")`, and show a
> distinct "check your connection" message for network errors. Related: pickup
> date is a free-text `YYYY-MM-DD` field, so a bad value only fails server-side
> with that same raw message; a date picker or format check in the schema would
> avoid it.

### 232-6 · question · `apps/mobile/src/app/checkout/[storeSlug].tsx:668`

> `toShippingAddress` never fills `documentType`/`documentNumber`, `line2`, or
> `region`, and the form has no inputs for them, while the web form collects the
> document fields (`checkout-form.tsx`). They are optional in the shared schema,
> but Peruvian agency pickup usually requires the recipient's document. Is the
> omission intentional for the MVP? If so a short comment here (or in the plan)
> would help the next reader.

---

## #233: feat(mobile): buyer order history and private proof viewing

**Review body (COMMENT):**

> The phase 7 review item from the plan ("private proof must not be fetched like
> a public image") is handled correctly: `customFetchBlob` with the bearer
> header, RN core `Image` from a data URI (never `expo-image`/disk cache),
> `staleTime:
> Infinity` but cleared with `removeQueries` on logout/401. Nice.
> Three items.

### 233-1 · question / should fix · `apps/mobile/src/app/orders/index.tsx:16`

> `customerAuth.me(storeSlug).orders` only returns this store's orders, so order
> history is limited to the store used at login. The session token is global,
> and `GET /account/orders` (`GlobalAccountController`) already returns every
> order with `storeSlug`/`storeName`. Using it here would give a real
> cross-store history and let the detail screen use each row's `storeSlug` (the
> list already passes `storeSlug` as a param that `[orderId].tsx` ignores until
> #235). If single-store is the intended MVP, please say so in the plan, because
> checkout prefill (#232), push deep links (#234) and this screen all depend on
> it.

### 233-2 · should fix · `apps/mobile/src/app/orders/[orderId].tsx:52`

> `auth.signIn` is not a key in `en/mobile.json` or `es/mobile.json` (the script
> I ran over all literal `t()` calls finds only this one missing), so the
> signed-out button renders the literal text `auth.signIn`. #237 fixes
> `orders/index.tsx` (to `auth.loginTitle`) but not this file, and this is the
> screen a deep link opens when the buyer is signed out. Also, after sign-in the
> buyer lands on `/` rather than back on the order.

### 233-3 · nit · `packages/types/http.ts:126`

> `customFetchBlob` copies the header merge, `fetch`, and 401 handling from
> `customFetch` (~40 lines). The next change to one (e.g. a timeout, or the 401
> rule) will miss the other. Consider extracting `request(url, options)`
> returning the `Response` and letting both wrappers parse it.

---

## #234: feat(mobile): add Expo push notifications

**Review body (REQUEST_CHANGES):**

> Good: the checks on the controller side are tight (DTO regex and length
> bounds, exactly-one-owner `CHECK` constraint, upsert so a reinstalled/shared
> device moves the token, `deleteMany` scoped to the authenticated owner on
> unregister), and the e2e coverage over the real bearer guards is useful.
>
> Two changes I would block on (the push side effects can fail or hang a
> checkout, and an approved payment can return 500), plus four should-fix items.
> Details inline.

### 234-1 · should fix (high; latent until a seller registers a token) · `apps/api/src/modules/notifications/notifications.service.ts:156`

> `createIfNotOpen` is called with the `tx` client from inside the checkout
> `$transaction` (`create-order.usecase.ts:501`) and the buyer submit-proof
> transaction (`customer-order-payments.controller.ts:209`). This new block
> awaits two more things inside that transaction: a `deviceToken.findMany` on
> `this.prisma` (a second pooled connection while the tx holds one), and
> `pushQueue.add` against Redis.
>
> `buildRedisConnection()` uses `maxRetriesPerRequest: null`, so when Redis is
> unavailable `add()` is not expected to reject; it waits on the reconnect, and
> the checkout request would stall until Prisma's default 5 s
> interactive-transaction timeout and then roll the order back (no custom
> `transactionOptions` in `PrismaService`). Any other throw here (see 234-3)
> rolls the order back too, and a job can be enqueued for a transaction that
> later rolls back, which sends a push for an order that does not exist.
>
> The `add()` branch is dormant today (no seller client registers a token, see
> 234-10), but it activates the first time a seller does, and the two extra
> queries already run on every proof submission. A push is best-effort and must
> not be able to fail checkout. Please move it out of the transaction: have the
> use cases enqueue after `$transaction` resolves (return the store id from the
> tx), inside a `try/catch` that logs, or write a small outbox row in the tx and
> let the worker drain it.

### 234-2 · blocker · `apps/api/src/modules/orders/application/review-payment.usecase.ts:176`

> This runs after the review transaction has committed, and it is not guarded.
> If `pushToBuyer` throws (Redis, DB, or the zod parse in 234-3), `execute()`
> rejects and the seller sees a 500 for an approval/rejection that did happen
> (stock adjusted, audit row written, email sent). A retry then fails on the
> already-reviewed state. The email send just above is wrapped in `try/catch` +
> `logger.error` for exactly this reason; do the same here (or make
> `pushToBuyer` itself catch and log).

### 234-3 · should fix · `packages/queue/src/jobs/push.jobs.ts:5`

> The API accepts tokens matching `^(Exponent|Expo)PushToken\[...\]$`
> (`device-token.dto.ts:7`), but this schema requires
> `startsWith("ExponentPushToken[")`. I reproduced it: `ExpoPushToken[abc...]`
> passes the DTO and throws `ZodError` here, which with 234-1/234-2 turns into a
> failed checkout or a 500 on review. (The e2e tests register
> `ExpoPushToken[phase8-...]` tokens, which is why they never hit this.) Define
> the token pattern once in `@biasmarket/queue` and use it for both the DTO and
> this schema (`z.string().regex(...)`).

### 234-4 · should fix · `apps/api/src/queue/queue.module.ts:19`

> `QUEUE_NAMES.PUSH` is registered without `defaultJobOptions` here and in
> `apps/workers/src/queue/queue.module.ts:23`. The BullMQ default is
> `attempts: 1` with completed jobs kept forever, while `default-job-options.ts`
> documents bounded retries/cleanup as the repo's policy and the mailer/orders
> queues use them. As written, the processor's "throw on HTTP 5xx" never
> retries, so a transient Expo outage drops notifications, and Redis grows with
> every completed job. Pass `defaultJobOptions` (or a `pushJobOptions` next to
> `mailerJobOptions`) in both registrations.

### 234-5 · should fix · `apps/workers/src/jobs/push/push.processor.ts:35`

> Every `status: "error"` ticket is thrown as retryable. For
> `details.error === "DeviceNotRegistered"` (uninstalled app, reset device) that
> means retrying a permanently dead token (once 234-4 is fixed), and nothing
> ever deletes the `DeviceToken` row, so each future notification does the same.
> Treat `DeviceNotRegistered` as terminal and return without throwing; keep
> throwing for `MessageRateExceeded`/5xx. Workers have no database access (only
> `@biasmarket/queue`; they call internal API endpoints, like the expiry sweep),
> so pruning needs an internal endpoint, or the Expo send could live in the API.
> Also note an `ok` ticket only means Expo accepted the message; the plan's
> "monitor delivery" goal needs a receipts check as a follow-up.

### 234-6 · should fix · `apps/api/src/modules/customer-auth/customer-device-tokens.controller.ts:16`

> The generated OpenAPI has `/stores/{slug}/account/devices` with
> `"parameters": []`, which Orval rejects:
> `pnpm --filter @biasmarket/types
> generate` fails with "Declared path
> parameter "slug" needs to be defined as a path parameter" (I ran it on the
> stack top). This is the same gap `changePassword`/`logout` document in
> `customer-auth.controller.ts`; the fix there is
> `@ApiParam({ name: 'slug', type: String })`. CLAUDE.md also requires
> committing the regenerated `packages/types/generated/**` after changing
> `openapi.json`; this PR changes the spec but not the generated client, so the
> mobile app uses a raw `customFetch` for these routes instead of the typed one.

### 234-7 · nit · `apps/api/src/modules/customer-auth/customer-device-tokens.controller.ts:19`

> POST/DELETE here accept the cookie session (web) and mutate state, but the
> guard list is only `CustomerSessionGuard`. The other mutating routes in this
> module use `@UseGuards(CustomerSessionGuard, OriginGuard)` (`change-password`,
> `PATCH me`); `OriginGuard` already lets verified bearer requests through.
> Adding it keeps the module's CSRF stance consistent (registering an attacker's
> token on a victim account would redirect their order notifications).

### 234-8 · nit · `apps/api/src/modules/orders/application/review-payment.usecase.ts:178`

> The push title/body are fixed Spanish and include the full cuid order id
> (`El pago del pedido cm...xyz fue aprobado`), while the app is bilingual and
> the UI shows `id.slice(0, 8)`. Consider storing the app locale with the device
> token (the app already knows it) and localizing server-side, and use the short
> id.

### 234-9 · question · `apps/mobile/src/features/auth/session-context.tsx:143`

> Registration only happens in `signIn`. A session restored on app start never
> re-registers, so (a) a token rotated by Expo, (b) permission granted later in
> OS settings, and (c) a reinstall that restores the SecureStore session (iOS
> Keychain items can survive an uninstall) will not deliver pushes until the
> next manual login (up to 7 days). Registering on `status === "authenticated"`
> (once per launch) would cover all three. Related: if
> `unregisterBuyerPushToken` fails on sign out (offline) the token stays
> attached to the previous account, and the next user on that device only takes
> it over if they accept notifications, so the previous buyer's payment pushes
> keep arriving there.

### 234-10 · question · `apps/api/src/modules/device-tokens/device-tokens.controller.ts:7`

> This seller registration route and the seller branch of `createIfNotOpen` have
> no client in this stack (the plan puts the seller dashboard out of MVP scope),
> and no test exercises `pushToBuyer` or the enqueue branch (the specs only add
> stub providers). Either defer the seller half to the PR that adds a seller
> client, or add tests; right now it is untested surface that also adds a query
> to every proof submission.

### 234-11 · nit (verify) · `apps/mobile/src/app/_layout.tsx:31`

> Three things to check on a device: (1) `router.push` from this effect on a
> cold start launched by a notification tap can run before the navigator is
> ready (expo-router warns "navigate before mounting the Root Layout"); a
> `useRootNavigationState` guard or `setTimeout` is the usual fix; (2) no
> `Notifications.setNotificationHandler` is set, so pushes are not shown while
> the app is in the foreground; (3) the deep link uses the _session_ store slug,
> so an order from another store opens "We couldn't open this order".

---

## #235: feat(mobile): add Universal Links and Android App Links

**Review body (COMMENT):**

> The generator is carefully done (fails closed, validates the Team ID /
> fingerprint formats, covered by tests) and serving the files with
> `application/json` through `headers()` is right (the `proxy.ts` matcher
> already skips dotted paths, so `.well-known` is not locale-redirected). My
> main concern is that the path patterns will not match the URLs the web app
> actually serves.

### 235-1 · should fix · `apps/web/scripts/generate-mobile-associations.mjs:64`

> The web app is locale-prefixed. `i18n/routing.ts` is
> `defineRouting({ locales: ["es", "en"], defaultLocale: "es" })` (next-intl's
> default `localePrefix: "always"`) and the storefront lives at
> `app/[locale]/(storefront)/store/[slug]/...`. The canonical product URL is
> `https://biasmarket.com/es/store/<slug>/product/<id>` (that is the form
> `lib/product-json-ld.test.ts` uses), which is what search results, the
> sitemap, shares, and the address bar contain. `/store/*/product/*` (here, and
> `pathPrefix: "/store"` in `app.json` for Android) will not match those. Only
> locale-less links match, and those are the ones that redirect to a locale
> route when the app is not installed.
>
> Suggest: components `"/": "/*/store/*/product/*"` (plus the locale-less form
> if the emailed links should keep working), the equivalent Android
> `pathPattern`/`pathAdvancedPattern`, and a `+native-intent.tsx`
> `redirectSystemPath` in the Expo app that strips a leading `/es|en` segment
> before routing. Because Maestro uses the custom scheme, nothing in CI
> exercises the https path; the doc's manual verification step should include a
> locale-prefixed URL.

### 235-2 · should fix · `docs/mobile/deep-links.md:3`

> The doc says the app claims `https://biasmarket.com/store/*` on both platforms
> and that "store URLs open that store's catalog", but they differ: iOS lists
> only `/store/*/product/*` and `/store/*/account/orders/*`, while Android's
> `pathPrefix: "/store"` (`app.json:35`) claims every store URL. On a verified
> Android install, links the API emails (`customer-account.service.ts:300`:
> `/store/<slug>/account/confirm?token=...`) would open the app on an Unmatched
> Route instead of the web confirm page, and likewise checkout, cart, and login
> URLs. Please make both platforms claim the same set, add app routes (or a
> catch-all that hands unknown paths back to the browser) for what is claimed,
> and fix the doc.

### 235-3 · nit · `apps/mobile/src/app/orders/[orderId].tsx:25`

> `storeSlug` now comes from the URL, and with `orderId` it is interpolated
> unencoded by the generated client
> (`/stores/${slug}/account/orders/${orderId}`). A crafted link like
> `.../orders/..%2F..%2Fme` makes the app send an authenticated GET to a
> different API path. It is GET-only and the response is only rendered to the
> same user, so low impact, but cheap to close: validate `storeSlug` against
> `/^[a-z0-9-]+$/i` (the checkout already does) and `orderId` against the id
> format before querying, and bail to the not-found state otherwise. The same
> applies to `product/[storeSlug]/[productId]`.

---

## #236: test(mobile): add beta golden-path and component tests

**Review body (COMMENT):**

> Component tests cover the right lifecycle cases (sign out deletes the stored
> session; 401 clears it) and run clean for me (2 suites, 4 tests). The Maestro
> flow is a good fit for the golden path. Two workflow issues and a policy
> setting inline.

### 236-1 · should fix · `.github/workflows/mobile-maestro.yml:61`

> This job never installs dependencies before `eas build`. eas-cli reads the app
> config through `@expo/config`, which needs `expo` resolvable from the project;
> I reproduced
> `Cannot determine the project's Expo SDK version because the
> module expo is not installed`
> with the same call on a project without `node_modules`. Add the same setup as
> `ci.yml` (`pnpm/action-setup` with the pin, `actions/setup-node`,
> `pnpm install --frozen-lockfile`) before the emulator step. Related:
> `version: 10` here vs `packageManager: pnpm@10.11.0` (`ci.yml` passes
> `env.PNPM_VERSION`; `pnpm/action-setup` can fail with "Multiple versions of
> pnpm specified" when the two disagree, so use the same pin), and
> `setup-node@v4` / node 22 vs v6 / node 24 elsewhere.

### 236-2 · should fix · `apps/mobile/app.config.js:38`

> With `policy: "appVersion"` every OTA update for `1.0.0` is delivered to every
> installed `1.0.0` binary. The first JS-only release that imports a native
> module an older binary lacks (e.g. `expo-notifications` arrived in #234)
> crashes those users. Expo's recommendation is `{ policy: "fingerprint" }` so
> incompatible native layers never receive each other's updates.

### 236-3 · nit · `.github/workflows/mobile-maestro.yml:5`

> The flow runs only on pushes to a `mobile-release` branch (which does not
> exist yet) and on manual dispatch, so no PR is gated on it. That is a
> reasonable cost trade-off for an EAS-build-plus-emulator job, but then the
> phase 10 definition of done ("golden path passes against a staging build")
> stays unproven until the first dispatch; I would run it manually once before
> merging this PR. Also the flow taps the Android photo picker by coordinates
> (`buyer-checkout-proof-order.yaml:30`, `point: "25%, 35%"`), which will break
> across API levels/OEM pickers.

---

## #237: build(mobile): configure production EAS release

**Review body (COMMENT):**

> Good that production credentials sit behind a `mobile-production` environment,
> that `inputs.message` is passed via `env` (no expression injection), and that
> submission is a separate manual step. Four items.

### 237-1 · should fix · `.github/workflows/mobile-production-update.yml:37`

> `eas update` exports the JS bundle locally with Metro, so it needs
> `node_modules`; this workflow only runs `setup-node` and installs `eas-cli`.
> Same root cause as the Maestro workflow (see #236). Add pnpm setup +
> `pnpm install --frozen-lockfile`. `mobile-store-submit.yml` very likely has
> the same gap (eas-cli resolves the app config through `expo` there too). Also,
> the checkout uses `ref: mobile-release`, not the commit that produced the
> installed binaries; with `runtimeVersion: appVersion` (#236) that is a risk,
> see my comment there.

### 237-2 · should fix · `.github/workflows/mobile-production-build.yml:5`

> This fires on every push to `mobile-release` that touches `packages/**`, which
> includes web-only packages, and it runs next to `mobile-maestro.yml`'s preview
> build (same trigger). Each run does `eas build --platform all` with
> `autoIncrement: true`, so a docs/package tweak burns two store builds and a
> build number. Suggest `workflow_dispatch` only, or a version tag trigger.

### 237-3 · should fix (release) · `apps/mobile/store-listing/metadata.md:16`

> Apple App Store Review Guideline 5.1.1(v) and Google Play's account-deletion
> policy require an in-app way to delete the account (and a web URL for Play)
> when the app lets users create one. Buyers set a password and get an account
> in this app, and there is no delete flow or API endpoint, nor a mention in
> this checklist. Expect a rejection otherwise. Please add it to the
> pre-submission list at least, and plan the endpoint (what happens to orders:
> anonymize the `BuyerAccount`, keep order rows for the store).

### 237-4 · nit · `apps/mobile/src/features/auth/session-context.tsx:116`

> `t` was added to the deps of `clearLocalSession` (line 89), the restore effect
> (here) and `signIn`, but `clearLocalSession` doesn't use it. Because `t`
> changes with the locale, switching language now re-runs the restore effect
> (re-reads SecureStore, bumps `sessionGeneration`), which can abort an
> in-flight login with `auth.sessionChanged`. Also the
> `new Error(t("auth.missingSessionToken"))` messages (lines 129-162) are never
> displayed: `login.tsx`/`register.tsx` catch everything and show a generic
> string. Drop `t` from the deps and keep the error keys as plain keys (as in
> #220) or map them in the screens.
