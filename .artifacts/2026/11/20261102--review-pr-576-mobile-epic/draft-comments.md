# Draft comments: PR #576 (Consolidate mobile Epic implementation)

Head SHA reviewed: `8a2097675b435bea0afce71a855aa6bd9610c3b0`. The PR was
already merged (06:00 UTC, 2026-11-02) when this review was written, so the
posting plan is a single `COMMENT` review plus two replies to existing bot
threads that are resolved (and outdated) but whose code is unchanged at head.
`REQUEST_CHANGES` is moot after the merge.

Replies to existing threads (posted via `/pulls/576/comments/{id}/replies`):

- 4439033730 (`proofSubmitted` from buyer-submitted payments only): still not
  fixed at head. `checkout.controller.ts:127` is still
  `payments?.some((p) => Boolean(p.imageUrl))`; `source` is typed on line 99 and
  never used.
- 4439033777 (Sign up link forwards the slug): still not fixed at head.
  `apps/mobile/src/app/login.tsx:126` still passes `slug: params.storeSlug`.

## #576: Consolidate mobile Epic implementation

**Review body (COMMENT):**

> Review of the merged head `8a20976`. The PR was merged before this review, so
> read "blocking" below as "fix before the mobile release is cut", not "blocks
> this PR".
>
> **What held up** (checked by running): all new suites pass (API 127 tests,
> mobile 26 vitest + 4 jest, web `.well-known` 6, types 12). A throwaway
> Postgres 16 ran all migrations with `prisma migrate deploy`, and
> `prisma migrate diff` against `schema.prisma` reported an empty migration (no
> drift). Both migrations are additive. The replay comparison matches how the
> order stores `deliveryDetails`. The origin guard on `DELETE /account/me` is
> sound by reading: a verified bearer is exempt, and a cookie request without an
> Origin is rejected (it has no test either, see 576-17). The checkout error
> path preserves a proof that a committed payment references. By a per-thread
> check against the code, 36 of CodeRabbit's 39 inline threads are fixed or
> moot; two are not (replies below) and one is partial.
>
> **Blocking the mobile release** (each has an inline comment):
>
> 1. **`mobile-maestro.yml` cannot run.** The emulator action runs each line of
>    `script:` as its own `sh -c`, so `cd`, `export PATH`,
>    `BUILD_ID=$(node -e '...')` and the `--env` continuation lines all break
>    (576-1). There is also no KVM step (576-2).
> 2. **`pnpm/action-setup` runs after `setup-node` with `cache: pnpm`** in
>    `mobile-maestro.yml`, `mobile-production-update.yml` and
>    `mobile-store-submit.yml`, so each job fails during setup (576-3). This was
>    in a CodeRabbit review body (no thread), so it was never revisited.
> 3. **COURIER + AGENCY checkout cannot be completed on mobile.** The shared
>    schema requires department, province and district for every COURIER order,
>    but the form only renders them for HOME (576-11). Validation errors for
>    those fields, and for `customerName`, render as raw keys because the
>    catalog has no entry (576-12).
> 4. **Session renewal was removed.** `setSessionRefreshHandler` is no longer
>    called anywhere, while the API still sends `X-Session-Token` on every
>    request, so buyers are logged out 7 days after sign-in even when active
>    (576-10).
> 5. **Account deletion is untested.** `deleteGlobalAccount` and
>    `DELETE /account/me` have no test, and every mutation I applied to the
>    method or its guards survived (576-17). Separately, a retention-policy
>    question: per-store `Customer` rows keep phone/email/name after deletion
>    (576-14), and CodeRabbit's deletion-vs-checkout race item is still open.
> 6. **Production release path is not safe to dispatch yet.** The
>    `mobile-staging` and `mobile-production` GitHub environments do not exist
>    (so no reviewers or branch policy), the build/update/submit workflows can
>    be dispatched from any branch, `mobile-maestro.yml` also triggers on pushes
>    to a `mobile-release` branch that does not exist, `eas update` has no
>    `--environment production`, `expo-updates` is not a dependency, and
>    `eas-cli` is installed unpinned with `npm` (576-4 to 576-8).
>
> **Still open from CodeRabbit's review bodies** (no thread, so easy to miss):
> compare `pickupDate` on replay; lock deletion against checkout for the same
> phone; checkout keeps its key when `removeItem` fails (`cart-storage.ts:105`
> swallows the error); `OkResponseDto` on `deleteMe` and `format: uuid` on the
> `Idempotency-Key` header; delivery, pickup and courier query failures fall
> through to empty option lists (only the payment query has an error screen);
> `search.tsx` reads `storeSlug` once.
>
> **Suggested follow-up issues** (outside this PR):
>
> - Release pipeline hardening: create and protect the two environments,
>   restrict dispatch to `main`, scope secrets to the `eas` step, pin `eas-cli`
>   as a devDependency, add `concurrency` and `timeout-minutes`, print EAS build
>   IDs to the step summary, and update `docs/core/ci.md` (still says mobile UI
>   is untested and lists only `mobile-release.yml`) and merge the two mobile
>   release docs.
> - Account erasure: reuse `identityErasedAt`/`erasedCustomerData()` for
>   `Customer` rows, add an advisory lock against checkout, add service and
>   controller tests.
> - Mobile checkout resilience: request timeout/`AbortController` on the
>   multipart upload, a TTL or form-aware fingerprint for the checkout key.
> - Test backlog from mutation testing (see 576-17, 576-18, 576-19).
> - Provisioning docs: add `IOS_TEAM_ID`, `IOS_BUNDLE_ID`, `ANDROID_APP_ID` and
>   `ANDROID_APP_SHA256_CERT_FINGERPRINT` to the env checklist; the routes only
>   work if someone edits `env/shared.env`.
>
> Not verified: nothing was run on a device or emulator, so the Maestro picker
> behavior, the real EAS behavior of `eas update` without `--environment`, and
> iOS/Android link verification are stated as questions, not facts.

### 576-1 · blocker · `.github/workflows/mobile-maestro.yml:50`

> **Blocker.** `android-emulator-runner` does not run `script:` as one shell
> script. At the pinned SHA (`a421e43`), `parseScript` splits the input on
> newlines and `main.ts` runs each line with `exec('sh', ['-c', line])`. I
> replayed every line through `sh -c` (network lines skipped):
>
> - `export PATH=...` and `cd apps/mobile` exit 0 but do not carry to the next
>   line, so `eas build`, the fixture `adb push` and `maestro test` run from the
>   repo root and `maestro` is not on `PATH`.
> - `BUILD_OUTPUT=$(eas build ...)` is lost after its own line.
> - `BUILD_ID=$(node -e '` fails with `unexpected EOF`, the following lines of
>   the node snippet are run as their own commands, and the closing
>   `' "$BUILD_OUTPUT")` is a syntax error.
> - `maestro test ... \` runs alone, then each `--env X=...` line runs as
>   `sh --env` and exits 2.
>
> The loop stops at the first non-zero exit, so in practice `eas build` (run
> from the repo root, outside the app project) fails first, and the job can
> never reach `eas build:run` or `maestro test`.
>
> Fix: build and install in ordinary `run:` steps (they can share `cd`, env and
> `$GITHUB_ENV`), and keep a single line in the emulator action, for example
> `script: bash apps/mobile/.maestro/run-ci.sh`, with the script doing
> `eas build:run --id "$BUILD_ID"`, the `adb` push and `maestro test`. Passing
> `BUYER_PASSWORD` through a Maestro env file instead of `--env` on the command
> line also keeps it out of the process list.

### 576-2 · should fix · `.github/workflows/mobile-maestro.yml:45`

> `arch: x86_64` on `ubuntu-24.04` needs KVM, and the emulator-runner README
> documents a step for it (a udev rule for `/dev/kvm` plus
> `udevadm control
> --reload-rules` and `udevadm trigger --name-match=kvm`).
> This workflow has none, so the emulator either refuses to start or falls back
> to software emulation that will not finish the flow inside the timeout. I
> could not run this on a runner, so check the first run's log. Add the
> documented KVM step before this one.

### 576-3 · blocker · `.github/workflows/mobile-production-update.yml:28`

> `actions/setup-node` with `cache: pnpm` runs `pnpm store path` during setup,
> and `pnpm/action-setup` is on line 32, after it. `setup-node` fails with
> `Unable to locate executable file: pnpm`. The same order is in
> `mobile-maestro.yml:35` (pnpm at :39) and `mobile-store-submit.yml:39` (pnpm
> at :43). Only `mobile-production-build.yml`, `mobile-release.yml` and `ci.yml`
> have the right order. CodeRabbit raised this in a review body (no inline
> thread), so it was never marked fixed or revisited. Move `pnpm/action-setup`
> above `actions/setup-node` in all three files. As written the OTA and
> store-submit workflows cannot start (the error text comes from `@actions/exec`
> in the action's source; I did not re-run it on a runner).

### 576-4 · should fix · `.github/workflows/mobile-production-update.yml:43`

> `eas update --channel production` has no `--environment`. `eas.json` sets
> `"environment": "production"` on the production _build_ profile, which is how
> `EXPO_PUBLIC_API_URL` and friends get baked into the store binary;
> `eas update` does not read the build profile. If the OTA bundle is exported
> without an environment, `EXPO_PUBLIC_API_URL` can be missing, and
> `src/features/auth/api-client.ts:4` then falls back to the hardcoded
> production URL, which is silent. I did not fetch the EAS CLI docs for this, so
> please confirm the flag in the docs, then add `--environment production`.
>
> Related question: with `runtimeVersion: { policy: "fingerprint" }`, an update
> published from a commit whose native fingerprint differs from the shipped
> binaries reaches nobody. A `fingerprint:compare` or runtime-version check step
> would make that visible.

### 576-5 · should fix · `.github/workflows/mobile-production-build.yml:14`

> `environment: mobile-production` does not exist in the repo yet. The
> environments list (`gh api repos/.../environments`) contains only `copilot`,
> `Preview` and `production`; `mobile-staging` does not exist either, and the
> `mobile-release` branch from `docs/mobile/release.md` returns 404. GitHub
> creates a missing environment on first use with no required reviewers and no
> deployment-branch policy.
>
> The build, update and submit workflows are `workflow_dispatch` only, so anyone
> with write access can dispatch them from any branch, including one with an
> edited workflow, and reach `EXPO_TOKEN` (production build, OTA publish, store
> submit). `mobile-maestro.yml` also triggers on pushes to `mobile-release`,
> which does not exist, so anyone with write access can create it and run that
> job in the unprotected `mobile-staging` environment.
>
> Suggested hardening, none of it in the PR today:
>
> - create `mobile-production` with required reviewers and a deployment branch
>   policy of `main` only, and document that in `docs/mobile/release.md`;
> - add `if: github.ref == 'refs/heads/main'` to the jobs as a second guard;
> - set `EXPO_TOKEN` on the single step that runs `eas` instead of the job, so
>   `pnpm install` (and any dependency postinstall script) cannot read it;
> - add a `concurrency` group, and `timeout-minutes` on the update and submit
>   jobs.

### 576-6 · should fix · `.github/workflows/mobile-production-build.yml:37`

> `npm install --global eas-cli` is unpinned and uses `npm`, which breaks the
> repo's pnpm-only rule in a production release path. It also floats with
> `cli.version: ">= 16.0.0"` in `eas.json`. The same line is in
> `mobile-production-update.yml:41`, `mobile-store-submit.yml:52` and
> `mobile-maestro.yml:60`, and the Maestro job installs via `curl | bash`
> (`mobile-maestro.yml:61`) with no version or checksum.
>
> Fix: add `eas-cli` as an exact-version devDependency in `apps/mobile` and call
> `pnpm exec eas ...` (or use `expo/expo-github-action` pinned by SHA with an
> exact `eas-version`). Pin Maestro with `MAESTRO_VERSION` and verify the
> download. While here: this file uses pnpm `version: 10` and Node 22 while the
> others use `10.11.0` and Node 24 (root pins `pnpm@10.11.0`), and the build job
> never prints the EAS build IDs that `mobile-store-submit.yml` requires as
> inputs, so add them to `$GITHUB_STEP_SUMMARY`.

### 576-7 · question · `apps/mobile/app.config.js:38`

> `runtimeVersion`, `updates.url` and the `channel` entries in `eas.json` are
> configured, but `expo-updates` is not in `apps/mobile/package.json`
> (`grep expo-updates` returns nothing), and `expo config --json` shows
> `"updates":{}` unless `EAS_PROJECT_ID` is set. Without the package the app
> cannot receive OTA updates, so `mobile-production-update.yml` would publish
> bundles nobody can load. Is OTA meant to ship in this release? If yes, add
> `expo-updates`; if not, drop the OTA config and workflow until it is.

### 576-8 · should fix · `apps/mobile/eas.json:17`

> Two release-config gaps:
>
> - `beta` (and `development`) have no `"environment"`, while `preview` and
>   `production` do. `api-client.ts:4` falls back to
>   `https://api.biasmarket.com/api` when `EXPO_PUBLIC_API_URL` is unset, so a
>   beta or development build without EAS env vars talks to **production** with
>   no warning. Set `environment` on both, and consider failing the build when
>   the variable is missing outside production.
> - `appVersionSource: "remote"` is set but only `production` has
>   `autoIncrement`. `beta` and `preview` have `submit` profiles, so repeated
>   builds reuse the same versionCode/buildNumber, which Play and App Store
>   Connect reject. This one is inferred from EAS semantics, not run.

### 576-9 · nit · `apps/mobile/app.json:13`

> `ios.config.usesNonExemptEncryption` (the `ITSAppUsesNonExemptEncryption`
> Info.plist key) is absent from the resolved config (`expo config --json`), so
> every iOS build needs the export-compliance answer entered by hand in App
> Store Connect. If the app only uses HTTPS, set
> `"config": { "usesNonExemptEncryption": false }` under `ios`.

### 576-10 · should fix · `apps/mobile/src/features/auth/session-context.tsx:97`

> This PR removed `refreshSessionToken` and its
> `setSessionRefreshHandler(refreshSessionToken)` registration. At the base
> commit both existed (`626232a8`, lines 88 and 119). At head,
> `setSessionRefreshHandler` is defined in `api-client.ts:45` and never called
> (`grep` over `apps/mobile/src` finds no caller), so `http.ts:100`
> (`config.onSessionRefresh?.(...)`) is a no-op.
>
> The API still sends a fresh `X-Session-Token` on every authenticated mobile
> bearer request (`x-client: mobile`, `customer-session.guard.ts:91`, sliding
> renewal). Result: the token in SecureStore is never renewed, and every buyer
> is logged out 7 days after sign-in even if they use the app daily; the next
> 401 then clears the session. I did not run the app, this comes from the diff
> plus `grep`.
>
> Fix: restore the handler with the same
> generation/`isCurrentMobileAuthorization` guards as the base version, and add
> a test that an `X-Session-Token` response header replaces the stored token. If
> the removal was intentional, the sliding renewal on the server is dead weight
> and the README should say sessions are fixed-length.

### 576-11 · blocker · `apps/mobile/src/app/checkout/[storeSlug].tsx:618`

> The department, province and district inputs are rendered only inside
> `courierModality === "HOME"`, but
> `packages/validation/src/checkout/checkout.schema.ts` (lines ~187-210)
> requires all three for **any** COURIER order. Reading the schema and the form:
> with `courierModality: "AGENCY"` and every visible field filled, those three
> stay empty and fail validation on `shippingDepartment`, `shippingProvince` and
> `shippingDistrict`. The AGENCY branch only renders `shippingAgencyName`, so an
> AGENCY courier order cannot be submitted from the app.
>
> Fix: render the three fields for both modalities, or relax the schema for
> AGENCY if the API allows it (`validateDeliveryPreTx`, which delegates to
> `order-creation.core.ts:144`, requires only `agencyName` for AGENCY today).
> Add a form test for AGENCY.

### 576-12 · should fix · `apps/mobile/src/app/checkout/[storeSlug].tsx:284`

> Validation errors render
> `t(\`checkout.validation.${issue.path[0]}\`)`, and`t`> returns the raw key when a key is missing. The schema emits these paths, and
> none has an entry in`en/mobile.json`or`es/mobile.json`:`customerName`,`shippingRecipientSurnames`,
>`shippingDepartment`,`shippingProvince`,`shippingDistrict`. A buyer who
> leaves the name empty sees the literal text`checkout.validation.customerName`.
>
> Fix: add the five keys to both catalogs and add a test that every path the
> schema can emit has a catalog entry in both locales (the schema and catalog
> are in different packages, so nothing else will keep them in sync).

### 576-13 · should fix · `apps/mobile/src/app/checkout/[storeSlug].tsx:384`

> The idempotency key (`cart-storage.ts`, `getCheckoutIdempotencyKey`) is
> fingerprinted on cart items only and cleared only by `clearStoreCart`, while
> the API now compares the whole payload on replay and answers 409
> `El
> Idempotency-Key ya fue utilizado con datos de orden diferentes`. This
> `catch` maps everything except 400 and `TypeError` to `checkout.submitFailed`.
>
> Scenario (needs a committed-but-unacknowledged submit): the order commits, the
> response is lost (timeout, app killed), the buyer fixes a typo in the phone or
> picks another pickup point, and resubmits. Same cart, same key, different
> payload, so every retry gets 409 and a generic error until the cart changes.
> (From code reading; not run on a device.)
>
> Fix, in order of effort: handle `ApiError` 409 explicitly with a message that
> points the buyer to "My orders"; include a hash of the non-file form fields in
> the stored fingerprint (a changed form then gets a fresh key, at the cost of a
> possible duplicate that the buyer can see in their orders); and give the
> stored key a TTL so a stale key cannot replay a long-expired order (see
> 576-16). A component test for 409/5xx/timeout keeping or resetting the key
> would pin it.

### 576-14 · should fix · `apps/api/src/modules/customer-auth/customer-auth.service.ts:647`

> `deleteGlobalAccount` deletes `Address` and `CustomerStoreLink` rows and nulls
> the `BuyerAccount`, but never touches the per-store `Customer` rows. Those
> hold `phone`, `email`, `emailVerified` and `name` (checkout writes them via
> `findOrCreateCustomer`), and sellers keep seeing the erased buyer in the
> customers dashboard (`customers.service.ts` filters on
> `identityErasedAt: null`, which stays null). The PR text says the deletion
> "removes reusable buyer profile/link/address data", and `Customer` is exactly
> that. (Inferred from the code, not run against a database.)
>
> The repo already has the primitive for this: `Customer.identityErasedAt` and
> `erasedCustomerData()` in `assisted-order-identity-retention.usecase.ts`. Fix:
> in the same transaction, read the buyer's phone before nulling it, apply the
> erasure to the `Customer` rows for the stores in `CustomerStoreLink`, and only
> then delete the links (the links are what finds those stores). Orders also
> keep the phone/email/name snapshot by design, so this is a retention-policy
> decision: decide it for both, and if keeping the `Customer` rows is
> deliberate, say so in the PR text and `apps/mobile/README.md`.
>
> Smaller items on this method: the comment says it removes "device tokens", but
> there is no such model in `schema.prisma`; and CodeRabbit's review-body item
> about locking deletion against a concurrent checkout for the same phone is
> still open (no lock is taken here, and checkout locks in
> `customer-account.service.ts`).

### 576-15 · should fix · `apps/api/src/modules/orders/infrastructure/checkout.controller.ts:288`

> `prisma.orderPayment.findFirst({ where: { imageUrl: proofImageUrl } })` has no
> `storeId` and no supporting index. `OrderPayment` is indexed on
> `(orderId, createdAt)`, `(storeId, createdAt)`, `(storeId, operationCode)` and
> `(storeId, paidAt)` (read from `schema.prisma`); nothing covers `imageUrl`. It
> runs on every failed checkout that uploaded a proof (stock, validation, 409),
> on a public endpoint, so each one scans the payments table across all tenants
> (the scan itself is inferred, not measured). It also breaks the repo rule that
> every tenant query filters by `storeId`.
>
> Fix: resolve the store id once (the use case already loads the store by slug)
> and add `storeId` to the `where`, and either add
> `@@index([storeId, imageUrl])` or skip the lookup for failures that happen
> before the transaction (those can never have attached the proof).

### 576-16 · should fix · `apps/api/src/modules/orders/infrastructure/checkout.controller.ts:229`

> The replay returns whatever order the key points at, with no status or expiry
> check (same in `execute`, `create-order.usecase.ts:~188`). After the soft-hold
> sweep or a seller cancellation, a retry with the same key gets 200 and a dead
> order, the mobile app shows "Order placed", and the stock hold is already
> gone. (Reachable after a lost response, since a successful submit clears the
> key; from code reading, I did not reproduce it.)
>
> Fix: if the replayed order is `CANCELLED` or past `expiresAt`, return a
> distinct 409 (or let the client mint a new key), and decide how long a key is
> valid for. Two smaller points on the same path: the replay returns
> `whatsappUrl: null` unconditionally, so a buyer whose first response was lost
> never gets the link (it can be rebuilt from the order); and the lookup runs
> twice on a miss, once in `findCheckoutReplay` and again in `execute`.

### 576-17 · should fix · `apps/api/src/modules/customer-auth/global-account.controller.ts:81`

> Nothing exercises `DELETE /account/me` or `deleteGlobalAccount`: `grep` over
> all specs and e2e finds no reference, and the `customer-auth.service.spec.ts`
> changes only cover the password-token race. In a mutation run (each mutation
> applied alone and reverted), all of these still passed: dropping the order
> detach, dropping the `Address` delete, dropping the `CustomerStoreLink`
> delete, dropping the `passwordVersion` increment, keeping `googleSub`,
> removing `OriginGuard`, and removing `CustomerSessionGuard`. The last two
> matter most: they are the whole authorization story for an irreversible
> endpoint.
>
> Tests to add: a service spec with the fake tx (unknown id returns `ok` with no
> writes; happy path asserts the detach, both `deleteMany` calls and every
> nulled field including `passwordVersion: { increment: 1 }`); a controller/e2e
> test that no session gives 401, a cookie request with no Origin gives 403, and
> a session token minted before deletion is rejected afterwards. The controller
> also returns a fresh `Set-Cookie`/`X-Session-Token` for the account it just
> erased (harmless since the version is bumped, but `logout` clears the cookie
> and this does not).

### 576-18 · should fix · `apps/api/src/modules/orders/application/create-order.usecase.ts:50`

> Mutation testing shows the replay comparison is only covered for 2 of about 10
> compared fields. Removing the comparison of `paymentMethod`, `pickupPointId`,
> `deliveryMethodType`, email, name, `items.length`, item `quantity`, or item
> `variantId` each still passed the suite (`paymentType`, phone and the repeated
> lines case are killed). Also surviving: removing the whole post-transaction
> P2002 catch (the concurrent same-key race), removing the
> `assertMatchingCheckoutData` call inside it, and dropping the
> `UNIQUE_INDEX_NAME` / `checkoutIdempotencyKey` / index-name alternatives in
> `isIdempotencyKeyConflict`. So the race path that the idempotency design
> exists for has no test, and the test named "matches repeated items as distinct
> order lines" actually asserts a throw.
>
> Add: a table-driven `it.each` of one-field deltas expecting
> `ConflictException` (plus one fully equal payload that must not throw, and
> email case-insensitive equality); a P2002 unit test with `$transaction`
> rejecting (meta as a string, array and nested `driverAdapterError`),
> `findFirst` null then the order, for the replay, mismatch (409), unrelated
> P2002 (rethrown) and missing-replay (original error rethrown) cases; ideally a
> real-DB e2e next to `checkout-customer-race.e2e-spec.ts` with two parallel
> POSTs and one key.

### 576-19 · should fix · `apps/api/src/modules/orders/infrastructure/checkout.controller.ts:213`

> `CheckoutController.create` has no spec (`checkout-upload-limits.spec.ts` only
> tests multer and the pipe against a stub). Eight mutations survived:
> `proofSubmitted` always `false` and `payments.length > 0`, both proof-cleanup
> branches removed, `buyerAccountLinked` forced `true` (replay and create),
> `orderBelongsToSession` ignoring the account id, and skipping the replay
> pre-lookup. `parseIdempotencyKey` accepting an array header also survives, and
> the use case replay tests use non-UUID keys, which hides that validation lives
> only here.
>
> Add a controller spec with mocked `createOrder`, `storage` and `prisma`:
> replay returns without calling `execute` or uploading; `proofSubmitted` and
> `buyerAccountLinked` truth tables (including a valid token for a different
> account); cleanup when `execute` returns an order without the proof, when it
> throws with no referencing payment (delete), with one (keep), and when the
> lookup itself throws (keep, warn); a rejecting `deleteImage` must not fail the
> request; a bad header gives 400 before any upload. Add `customFetchBlob` 401
> without a bearer not calling `onUnauthorized` too (that mutation survived in
> `packages/types/http.ts`).

### 576-20 · nit · `apps/web/features/buyer-purchases/components/my-purchases.tsx:59`

> `removeQueries` on `globalAccountKeys.profile` while the component observes it
> does not notify the observer by itself (in a probe against
> `@tanstack/query-core` 5.105.0 the observer kept its data and got no
> notification). The page flips to the signed-out view only because the mutation
> state change re-renders `MyPurchases`, which makes the observer rebuild the
> query and refetch (I did not run this under React/jsdom). `useGlobalLogout`
> uses `invalidateQueries` for the profile; doing the same here would not depend
> on that re-render. There is also no test for the delete flow (`grep deleteMe`
> in `*.test.tsx` finds nothing).

### 576-21 · nit · `apps/web/features/buyer-purchases/components/my-purchases.tsx:111`

> `window.confirm` for an irreversible action: the repo has
> `components/ui/alert-dialog.tsx`, used in `features/orders/*` and
> `account-addresses-section.tsx`. A native confirm is unstyled, blocks the
> thread, is announced differently by assistive tech, and needs a dialog handler
> in Playwright. Use `AlertDialog` with a destructive action. Also `useMutation`
> and `useQueryClient` are imported on two lines from the same module (lines
> 4-5).

### 576-22 · nit · `apps/mobile/src/features/checkout/proof-image.ts:15`

> Every preset applies `resize: { width }` starting at 1600, so an image
> narrower than that is upscaled, which makes the file larger than needed. Read
> the real width (`ImageManipulator`'s result or `Image.getSize`) and only
> downscale. The intermediate outputs from earlier presets are also never
> deleted from the cache. Tests: the all-fail case asserts only the throw and
> call count, and `<=` vs `<` on `MAX_FILE_SIZE` and the `info.exists` check
> survive mutation.

### 576-23 · should fix · `docs/mobile/release.md:11`

> This says store submission "remains an explicit
> `eas submit --profile
> production` step" and mentions only
> `mobile-production-update.yml`. The PR also adds `mobile-production-build.yml`
> and `mobile-store-submit.yml` (with `ios_build_id` and `android_build_id`
> inputs that are conditionally required, checked in the script), and neither is
> documented. The doc names a protected `mobile-release` branch and a
> `mobile-staging` environment that do not exist yet (see 576-5), and it does
> not link to the existing `docs/core/mobile-release.md`, which describes a
> different workflow. `docs/core/ci.md` is also stale: it still says mobile UI
> is untested and lists only `mobile-release.yml`, while the PR adds the
> `pnpm --filter mobile test:components` step after the Codecov upload (outside
> turbo, so not cached and not covered by the coverage floor). Please document
> the four workflows, their inputs and the secrets each environment needs, and
> update `ci.md`.
