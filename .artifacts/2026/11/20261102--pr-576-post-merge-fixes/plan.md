# Plan: post-merge fixes for PR #576 (mobile Epic)

Status (split, per the final readiness review; rounds 1-3 applied, see
`review-log.md`):

- **ready**: PR 1, 3a, 3b, 4a, 4b, 5a, 5b, 6a-i, 6a-ii, 6c, 7, 8 (4b and 5a: see
  the release-order rule and Q10)
- **ready with caveats**: PR 2a (merge waits on the Q2 admin steps), PR 6b-race
  (unproven design; merges only with a green CI `E2E (API)` job)
- **blocked**: PR 6b-erase (Q8), PR 2b `app.json` half (Q7, no default); the
  `eas.json` half of 2b is ready with the Q9 default Plan session date:
  2026-11-02. Repo state used: `origin/main` = `3c40e0b0` (contains the merge of
  #576 at `d8c645fa`, PR head `8a209767`). Source review:
  `.artifacts/2026/11/20261102--review-pr-576-mobile-epic/` (comments 576-1 to
  576-23, posted as review 5737995758 plus two thread replies).

Audience: the implementer in a fresh session. **[fact]** = read or run in the
plan session; anything else is a decision or an assumption (assumptions live in
section 12).

## 1. Context and outcome

PR #576 consolidated the mobile Epic and merged on 2026-11-02 06:00 UTC. The
post-merge review found defects that keep the mobile release from being cut:
workflows that cannot run, a checkout path that cannot complete for one delivery
mode, a removed session-renewal handler, an unsafe production release path,
incomplete and untested account erasure, and large untested areas.

Outcome: every finding is fixed in a PR below, turned into a follow-up issue
(section 10), or dropped with a reason (`review-log.md`). Done = the acceptance
criteria in section 9 hold on `main`.

Already shipped, do not redo **[fact]**: deep-link locale stripping, AASA
exclusions, assetlinks validation, `expo-crypto` UUID source, PDF-proof message,
`paymentType`/multiset/shipping-field replay compares, and 33 other CodeRabbit
inline items (36 of 39 threads fixed or moot).

Collision check **[fact]**: the only open PR is #568 (unrelated). The user's
checkout is on `fix/mobile-release-workspace-build` (commit `cb840143`, edits
only `.github/workflows/mobile-release.yml`, which this plan never touches).
Implementers start from a fresh branch off `origin/main`, never from that
checkout. Issue #186 (deep linking) is still OPEN and stays open: device
verification has not run.

## 2. Current behavior (facts, file:line on `main` `3c40e0b0`)

CI / release

- `.github/workflows/mobile-maestro.yml:50` `script: |` is multi-line. The
  pinned `reactivecircus/android-emulator-runner@a421e43` splits on newlines and
  runs `exec('sh', ['-c', line])` per line (`src/script-parser.ts`,
  `src/main.ts:221-227`), so `cd`, `export`, `$(...)` and `\` continuations
  cannot work. No KVM udev step (the README at that SHA documents one).
- `actions/setup-node@v6` with `cache: pnpm` precedes `pnpm/action-setup` in
  `mobile-maestro.yml` (35/39), `mobile-production-update.yml` (28/32),
  `mobile-store-submit.yml` (39/43); the other mobile/CI workflows have the
  right order. `mobile-production-build.yml:22-24` has `pnpm/action-setup` with
  `version: 10` while root `package.json` pins `pnpm@10.11.0`; the pinned action
  (`src/install-pnpm/run.ts`, `readTargetVersion`) throws "Multiple versions of
  pnpm specified" on any mismatch, so that workflow fails at setup (verified in
  the action source). It also uses Node 22; no production workflow has an `if:`;
  only update/submit pin `ref: ${{ github.sha }}`.
- `npm install --global eas-cli` (unpinned): `mobile-production-build.yml:37`,
  `mobile-production-update.yml:41`, `mobile-store-submit.yml:52`,
  `mobile-maestro.yml:60`; Maestro via `curl | bash` at `mobile-maestro.yml:61`.
  `eas.json` `cli.version` is `>= 16.0.0`. `dependabot-automerge.yml` runs
  `gh pr merge --auto --squash` for every Dependabot patch/minor with no package
  allow-list; there is no `.github/dependabot.yml`.
- Secrets (`EXPO_TOKEN`, `EAS_PROJECT_ID`, and in Maestro `BUYER_PASSWORD`) are
  job-level `env`. Every mobile workflow already has
  `permissions: contents: read` and routes `workflow_dispatch` inputs through
  `env`.
- `mobile-production-update.yml:43` `eas update --channel production` has no
  `--environment`. EAS CLI (`packages/eas-cli/src/update/utils.ts`,
  `environmentFlagNeededForSdk550OrGreater`) returns `false` when `CI` or
  `EAS_BUILD` is set, so in CI the flag is silently not required: no EAS
  environment variables reach the bundle and
  `apps/mobile/src/features/auth/api-client.ts:4` falls back to
  `https://api.biasmarket.com/api`. `app.config.js:32-40` reads `EAS_PROJECT_ID`
  at config load; if it is missing `updates.url`/`enabled` silently drop.
- GitHub environments present: `copilot`, `Preview`, `production`.
  `mobile-staging`, `mobile-production`, branch `mobile-release` do not exist;
  GitHub auto-creates an environment on first use with no protection.
- `apps/mobile/package.json`: `expo` `~57.0.27`, no `expo-updates`;
  `app.config.js:38` `runtimeVersion: { policy: "fingerprint" }`.
- `eas.json`: `preview`/`production` have `environment`; `beta`/`development` do
  not; `autoIncrement` only on `production`. `app.json` has no
  `ios.config.usesNonExemptEncryption`.
- `docs/mobile/release.md` omits two workflows and names nonexistent
  environments/branch; `docs/core/ci.md:100-102` says "the UI is untested" and
  its workflow table lists only `mobile-release.yml`;
  `apps/mobile/vitest.config.ts:11` carries a similar comment.
- The Hygiene job in `ci.yml` (`:1167-1176`) runs actionlint and
  `shellcheck scripts/ci/*.sh`; it passed on #576 (actionlint cannot see
  emulator-runner's per-line execution).
- `infra/vps/Caddyfile` has two `log` blocks (global and `(redact_log)`) that
  redact only `/public/orders/` and `/pedido/` URIs and `Referer`; Caddy also
  logs response headers and request headers. `customer-session.guard.ts:91` sets
  `X-Session-Token: <fresh>` on mobile responses.

Mobile

- `src/features/auth/session-context.tsx:97` registers only
  `setUnauthorizedHandler`. At base `626232a8` lines 88-142 also had
  `refreshSessionToken` and `setSessionRefreshHandler(refreshSessionToken)` /
  `(undefined)`. `apps/mobile/src/features/auth/api-client.ts:45` exports the
  setter, nothing calls it; `packages/types/http.ts:97-100` calls
  `config.onSessionRefresh?.(...)`; `customer-session.guard.ts:91` sends
  `X-Session-Token` for `x-client: mobile`.
- `src/app/checkout/[storeSlug].tsx:618`: department/province/district inputs
  sit inside `form.courierModality === "HOME"`. **Probe P1**: AGENCY with the
  rendered fields fails on `shippingDepartment`, `shippingProvince`,
  `shippingDistrict`.
- `checkout.validation.*` in `packages/i18n/{en,es}/mobile.json` lacks
  `customerName`, `shippingRecipientSurnames`, `shippingDepartment`,
  `shippingProvince`, `shippingDistrict`; line 284 renders the raw key.
- `cart-storage.ts` `getCheckoutIdempotencyKey`: fingerprint = items only; the
  key is removed only by `clearStoreCart`, after the cart write; the catch at
  `checkout/[storeSlug].tsx:384` maps everything except 400/`TypeError` to
  `checkout.submitFailed`; `ApiError` has `message` and `status` only. The
  success path swallows a `clearStoreCart` failure (`:364-369`).
- `checkout/[storeSlug].tsx:187-190` `?? []` for failed delivery/pickup/courier
  queries; only `paymentQuery.isError` has a screen (:411). All six queries are
  `useQuery` objects.
- `login.tsx:126` passes `slug: params.storeSlug` (`initialSlug` at :22);
  `search.tsx:33` `useState(routeStoreSlug ?? "")` read once; `signIn` removes
  `["buyer"]` queries before login succeeds; `account.tsx` delete/sign-out leave
  `biasmarket:cart:*` and `biasmarket:checkout-key:*` AsyncStorage entries;
  `orders/index.tsx` error state has no retry.
- `proof-image.ts:15` always `resize: { width }` (upscales narrow images).
- Mobile test runners: vitest includes `src/**/*.test.ts` (coverage gates only
  `session-storage.ts`, `cart-storage.ts`, `pagination.ts`); jest `testMatch` is
  `src/**/*.component.tsx` (2 suites today). `*.component.test.tsx` runs in
  neither.

API / web

- `checkout.controller.ts:127`
  `proofSubmitted = payments?.some(p =>
  Boolean(p.imageUrl))` (`source` typed
  at :99, unused). `:221-233` the replay pre-lookup runs before the
  missing-proof 400 (~:246) and the upload. Replay read sites: controller
  `:224`, `execute` (`create-order.usecase.ts:~188`), P2002 catch (`:~283`).
  `findCheckoutReplay` is called only from the controller. None check status or
  expiry. Replay returns `whatsappUrl: null`.
- `checkout.controller.ts:288`
  `orderPayment.findFirst({ where: { imageUrl } })`: no store scope;
  `OrderPayment` indexes are `(orderId,createdAt)`, `(storeId,createdAt)`,
  `(storeId,operationCode)`, `(storeId,paidAt)`. Today the catch deletes the
  image when no payment references it, for any error.
- `assertMatchingCheckoutData` (`create-order.usecase.ts:50`) does not compare
  `pickupDate`, and its shipping compare runs only `if (dto.shippingAddress)`.
  Stored `pickupDate` is a `Date` at UTC midnight (`order-creation.core.ts`).
- Expiry facts: `RESERVED_HOLD_STATUSES` (`domain/hold-statuses.ts`) =
  `PENDING_PAYMENT`, `PARTIALLY_PAID`, `PAYMENT_SUBMITTED`; the sweep
  (`expire-orders.usecase.ts`) selects `expiresAt: { lt: now }`, sets
  `status: CANCELLED` and leaves `expiresAt`; `VERIFIED` keeps its past
  `expiresAt`. `Order.status` is `ACTIVE | CANCELLED` and `paymentStatus` also
  has `CANCELLED`.
- `all-exceptions.filter.ts` `handleHttpExpression` rebuilds plain
  `HttpException` bodies as `{statusCode,message,path,timestamp}`; only two
  dedicated exception classes keep extra fields. It does not report 4xx to the
  error tracker. Web assisted orders (`apps/web/features/assisted-orders`) also
  send `Idempotency-Key` to a different endpoint and rely on that exception.
- `customer-auth.service.ts:631-665` `deleteGlobalAccount` does not touch
  `Customer` rows (`phone`, `email`, `name`, `identityErasedAt`) and takes no
  lock. Non-exported helpers: `erasedCustomerData` (`:493`), `isClosed`
  (`:489`), `hasRemainingCustomerOrders` (`:446`) in
  `orders/application/assisted-order-identity-retention.usecase.ts`; the
  retention flow takes `lockAssistedCustomer(tx, storeId, phone)` (`:123`,
  `:326`) before `hasRemainingCustomerOrders`. `lockBuyerPhone` is private at
  `customer-account.service.ts:~248`; `CustomerAuthService` already injects
  `CustomerAccountService`. `findOrCreateCustomer`'s null-phone attach is
  `buyerAccount.updateMany({ where: { id: own.id, phone: null } })`
  (`customer-account.service.ts:163-164`). `claimWithGoogle`
  (`customer-auth.service.ts:~273-345`) locks `Order` rows `FOR UPDATE`, then
  updates orders and writes links against the account.
  `customers.service.ts:58,306` filter `identityErasedAt: null`; its list
  rebuilds guest rows from `Order.customerPhone/Name/Email` snapshots and calls
  `normalizePhone` (`:~182`). `CustomerStoreLink` has no `customerId`.
- `global-account.controller.ts:84` returns `Promise<{ ok: true }>`
  (`metadata.ts` `deleteMe: {}`); `OkResponseDto` already exists
  (`customer-auth-response.dto.ts:16`); `Idempotency-Key` has no `format: uuid`;
  `metadata.ts` is generated by `pnpm --filter api generate:swagger-metadata` (a
  `pretypecheck`/`prebuild` hook); `generate:openapi` is
  `pnpm build && node
  scripts/generate-openapi-spec.ts`.
- `web/.../my-purchases.tsx:51-59` inline `useMutation`, `removeQueries` on the
  observed profile query (works only through the re-render), `window.confirm` at
  :111, two imports from `@tanstack/react-query`, no test for the delete flow
  (`my-purchase-order.test.tsx` exists for another component). Existing web
  tests already use `findByRole("alertdialog")`
  (`assisted-order-section.test.tsx`, `save-invite.test.tsx`); the dialog is
  Base UI and `ResizeObserver` is stubbed in the shared setup.
- Mutation testing of the PR (52 mutations): replay compare covered for 2 of ~10
  fields, P2002 race catch untested, `CheckoutController.create` no spec,
  `deleteGlobalAccount` / `DELETE /account/me` untested.

## 3. Probes run in this plan session

All probe code lives in the session scratchpad (not in the repo).

| #  | What ran                                                                                                                                                        | Result                                                                                                                                                                                                                                                                                                                                                                                                                           | Changed in the plan                       |
| -- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| P1 | `buildCheckoutFormSchema` against an AGENCY form with only rendered fields (`scratchpad/probe-agency2.mjs`, from `apps/mobile` of a scratch worktree on `main`) | fails on `shippingDepartment`, `shippingProvince`, `shippingDistrict`; filling them leaves only surnames + proof. A probe that omitted `customerName`/`shippingRegion` failed only on those: Zod skips `.refine` when the base object is invalid, so probes must supply every base field. With `paymentMethodsAvailable=true` it also reports `paymentMethod`; a non-cash method needs a `ProofFileLike` fixture (round-2 probe) | PR 4a parity test design                  |
| P2 | same script: emitted paths vs catalog keys                                                                                                                      | five shown paths missing in en and es                                                                                                                                                                                                                                                                                                                                                                                            | PR 4a adds five keys                      |
| P3 | read EAS CLI source via `gh api`                                                                                                                                | `--environment` check skipped in CI; flag exists                                                                                                                                                                                                                                                                                                                                                                                 | PR 2a adds it                             |
| P4 | verification commands on a scratch worktree at `3c40e0b0`, Node 24                                                                                              | pass; timings in section 8                                                                                                                                                                                                                                                                                                                                                                                                       | handoff commands are real                 |
| P5 | (review session) replayed Maestro lines through `sh -c`                                                                                                         | stops at first non-zero line                                                                                                                                                                                                                                                                                                                                                                                                     | PR 1 moves logic into a script            |
| P6 | (review session) throwaway Postgres 16: migrations + `prisma migrate diff`                                                                                      | no drift; migrations additive                                                                                                                                                                                                                                                                                                                                                                                                    | no migration in this plan                 |
| P7 | (review session) `@tanstack/query-core` 5.105.0 `removeQueries` on an observed key                                                                              | observer not notified; page flips via the mutation re-render                                                                                                                                                                                                                                                                                                                                                                     | PR 6c uses `invalidateQueries`            |
| P8 | (round 1) jest `--listTests` with a copy named `*.component.test.tsx`                                                                                           | not listed                                                                                                                                                                                                                                                                                                                                                                                                                       | test naming rule                          |
| P9 | (round 2) fake-timer boundary probe in the API vitest setup                                                                                                     | -1/0/+1 ms around a timestamp deterministic with `vi.setSystemTime`                                                                                                                                                                                                                                                                                                                                                              | `resolveReplay` takes an injectable `now` |

## 4. Design and non-goals

Principles: smallest change that closes each finding; reuse existing primitives;
additive API behavior.

1. **Workflows.** Shared-shell logic lives in `scripts/ci/mobile-maestro.sh`
   (covered by the Hygiene `shellcheck`), called from one line of `script:`.
   Build and install stay in ordinary `run:` steps; `eas build:run` runs inside
   the emulator script because it needs the running emulator. `eas-cli` becomes
   an exact devDependency of `apps/mobile`; workflows call
   `pnpm --filter mobile exec eas`. Secrets are step-scoped. Environment
   protection rules (not an `if: github.ref` line) are the real control.
2. **Replay rules, one helper.** `resolveReplay(order, dto, now = new Date())`
   is the single place deciding what a replay does and is called from all three
   read sites (controller pre-lookup, `execute`, P2002 catch). Checks in order:
   (a) payload compare (now including `pickupDate`, and the shipping compare
   runs when _either_ side has a shipping address) -> mismatch = **409**
   (existing message); (b) if equal, the order is dead when
   `order.status === "CANCELLED" || order.paymentStatus === "CANCELLED" ||
   (["PENDING_PAYMENT","PARTIALLY_PAID"].includes(order.paymentStatus) &&
   order.expiresAt < now)`
   -> **410 Gone** (`<` matches the sweep's `lt`); (c) otherwise return it.
   `PAYMENT_SUBMITTED` (proof awaiting review) and `VERIFIED` replay normally
   even past `expiresAt`; in the gap before the sweep cancels an expired
   `PAYMENT_SUBMITTED` order the replay still returns it, which is documented
   (the divergence from `buyer-payment-proof.service.ts:146-152`, which treats
   every reserved status past `expiresAt` as expired for _new_ proofs, is
   deliberate: a replay must not tell the buyer to re-order a payment that is
   awaiting review). `REJECTED` + `ACTIVE` replays. Compare `pickupDate` as
   `existing.pickupDate?.toISOString()
   .slice(0,10) ?? null` vs
   `dto.pickupDate ?? null`, only when `existing.pickupPointId` is set. The
   controller pre-lookup stays where it is (before the missing-proof 400 and the
   upload) so a replay uploads nothing. `whatsappUrl` stays `null` on replay
   (mobile treats it as optional). 409/410 bodies echo no order id or payload.
   The assisted-order flow is untouched.
3. **No machine-readable `code`.** The global filter strips it. Status carries
   the distinction: 409 mismatch, 410 dead order. Mobile maps by
   `ApiError.status`.
4. **Mobile key lifecycle (minimal).** Items-only fingerprint kept. The stored
   record is `{ v: 1, id, fingerprint, done?: true }`; an unknown or missing
   version is invalid and mints a new key; a `done` record mints a fresh id on
   the next call. After a 2xx the record is rewritten with `done: true` first
   (one retry), then the cart is cleared; the cart clear is retried once; a
   persistent failure is swallowed and logged (buyer stays on the success
   screen; residual risk, section 11: after an app restart the stale cart can be
   resubmitted and mints a fresh key, i.e. a duplicate order the buyer can see).
   Key reads and writes go through a per-store promise chain (like
   `updateStoreCart`'s `pendingWrites`) so two concurrent calls cannot mint
   different ids. 410 -> clear the key and ask the buyer to submit again. 409 ->
   clear the key and show neutral copy "We couldn't confirm this order. Check My
   orders before trying again" (a bare 409 can also be the transient
   `customer-account.service.ts:196` conflict). Other statuses keep the key.
   Replacing the proof file while keeping the same key replays the old order and
   ignores the new file; `proofSubmitted` on the success screen is the only
   signal (documented, not fixed).
5. **Error-path proof cleanup.** For an `HttpException` with status < 500 the
   transaction rolled back or never ran (verified: no 4xx is thrown after the
   commit; post-commit steps are a template lookup, WhatsApp URL build, a
   verification email that swallows its own errors, and `requiredEnv` in
   `orderBelongsToSession`, which throws a plain Error): call `deleteImage`
   directly, no lookup. For 5xx/non-HTTP errors keep the lookup scoped to the
   store (resolve it from the slug) and delete only when no payment references
   the image. `proofImageUrl` is server-generated, so the scope is hygiene, not
   a cross-tenant fix. A comment and a spec guard state "no 4xx may be thrown
   after the transaction commits".
6. **Account deletion concurrency (PR 6b-race; hardest part of the plan).** Lock
   order everywhere: phone advisory lock -> assisted-customer advisory locks
   (only when Customer erasure runs, sorted by `(storeId, phone)`; candidates
   are read unlocked first and re-validated after locking, because `eraseOrder`
   and the buyer-request path in `assisted-order-identity-retention.usecase.ts`
   take the assisted lock _first_; a delete that took it after the Order locks
   deadlocks with them, reproduced in round 3) -> `Order` rows (id-sorted
   `SELECT ... FOR NO KEY UPDATE`, so child inserts such as
   `OrderEvent`/`OrderPayment` are not blocked; it still conflicts with
   `claimWithGoogle`'s `FOR UPDATE`) -> `BuyerAccount` row. Sequence in
   `deleteGlobalAccount`'s existing transaction: read the account's phone; if
   present take the phone lock via a new public `withBuyerPhoneLock(tx, phone)`
   (same key `buyer-phone:${normalizePhone(phone)}`); lock the account's orders;
   lock the `BuyerAccount` row; re-read the phone. A phone change since the
   first read, a deadlock (Prisma `P2034` / Postgres `40P01`) or an
   interactive-transaction timeout (`P2028`; pass an explicit `timeout`) throws
   a retryable 409 (no PII in the message; the account screen already offers
   retry). Two guard fixes ship with it: (i) the null-phone attach in
   `findOrCreateCustomer` gets `passwordVersion: own.passwordVersion` and
   `email: own.email` in its `where` so an erased shell can never receive a
   phone; (ii) `claimWithGoogle`, after taking its Order locks, does a _locked_
   read (`SELECT ... FROM "BuyerAccount" WHERE id = $1 FOR SHARE`) and checks
   credentials and `passwordVersion` on that result before writing
   `buyerAccountId` and the link (a plain read passes and the following `UPDATE`
   then waits on the FK lock and succeeds against the erased shell, reproduced
   in round 3); (iii) every other writer that takes a lock on the account via an
   FK also uses the same guard through a shared
   `lockLiveBuyerAccount(tx, id, passwordVersion)` (`FOR SHARE`, then verify
   live): `addresses.service` create/update, `ensureStoreLink` (login,
   `loginWithGoogle`, register), `upsertStoreLink`, and `changePassword` /
   `updateProfile` (or `updateMany where { passwordVersion }`), otherwise an
   `Address` or link survives deletion. Fake-tx unit tests can only assert call
   order; lock-order safety is proven by e2e (checkout vs delete, claim vs
   delete, phone-attach vs delete).
7. **Customer erasure (PR 6b-erase, blocked on Q8).** Candidates = `Customer`
   ids from `Order.customerId` where `buyerAccountId = account` (read before the
   detach) plus the exact `(storeId, phone = normalizedPhone)` for linked
   stores. For each candidate: `lockAssistedCustomer(tx, storeId, phone)`
   (order: phone -> assisted customer, same as `findOrCreateCustomer`), then
   erase only if `hasRemainingCustomerOrders` is false (the retention rule, not
   "no non-closed orders"), using the exported `erasedCustomerData`. Gaps
   accepted and listed: an ACTIVE order with a REJECTED payment is open forever;
   legacy non-normalized phones; Customers for stores without a link. Tests must
   prove the seller customers list and detail do not throw on an `erased:<id>`
   phone and do not re-create an erased row from retained order snapshots, plus
   an e2e of retention (`eraseOrder`) vs buyer deletion on the same customer (no
   deadlock).
8. **AGENCY.** Render department/province/district for both modalities (web
   does). They are stored as-is in `deliveryDetails`; the seller UI likely
   ignores department/province; no API change. The shared schema is not changed
   (web uses it).
9. **Release-log hygiene.** Caddy must not log `X-Session-Token` (response) or
   `Idempotency-Key` (request) headers; a small infra PR (PR 8) deploys before
   any mobile build contains PR 5.

Retained after buyer-account deletion (owner to confirm, Q8):

| Data                                                                                       | After deletion                                                                | Notes                                                                     |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `BuyerAccount` row                                                                         | kept as an emptied shell                                                      | identity/credential fields nulled; `passwordVersion` bumped               |
| `Order` rows and contact/address snapshots (`customerName/Phone/Email`, `deliveryDetails`) | kept, `buyerAccountId` nulled                                                 | merchant records; the seller customers list rebuilds guest rows from them |
| `OrderPayment.imageUrl` proof screenshots                                                  | kept                                                                          | private bucket                                                            |
| `OrderEvent`, `Notification`, `AuditLog`                                                   | kept; `actorId` may reference the emptied account                             |                                                                           |
| `Customer` rows (per store)                                                                | erased by PR 6b-erase when no remaining orders (`hasRemainingCustomerOrders`) | cosmetic while snapshots survive                                          |
| Public order links (`accessTokenHash`)                                                     | stay valid                                                                    | default; revocation is Q8                                                 |
| Addresses, store links                                                                     | deleted                                                                       |                                                                           |

Non-goals: no shared-schema change, no DDD layering in `orders`, no push, no EAS
credentials or store submission, no device runs, no change to
`mobile-release.yml`, no new migration, no closing of #186, no change to the
assisted-order idempotency path, no UUID v4 tightening. Creating GitHub
environments / branch protection is a repo-admin action (Q2).

## 5. Files and components

| PR       | Add                                                                                                          | Change                                                                                                                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1        | `scripts/ci/mobile-maestro.sh`                                                                               | `mobile-maestro.yml`, `mobile-production-build.yml` (concurrency/timeout only), `mobile-production-update.yml`, `mobile-store-submit.yml`, `apps/mobile/.maestro/README.md`                                                                                              |
| 2a       | `scripts/ci/check-mobile-ota-ready.sh`                                                                       | `apps/mobile/package.json` + `pnpm-lock.yaml`, four mobile workflows, `.github/workflows/dependabot-automerge.yml`, `docs/mobile/release.md`, `docs/core/ci.md`, `docs/core/provisioning.md`                                                                             |
| 2b       | none                                                                                                         | `apps/mobile/eas.json`, `apps/mobile/app.json`                                                                                                                                                                                                                           |
| 3a       | `orders/application/replay.ts`, `replay.spec.ts`, `apps/api/test/checkout-replay-race.e2e-spec.ts`           | `create-order.usecase.ts` (+ `create-order.usecase.spec.ts`), `checkout.controller.ts` (call sites), `idempotency-key.spec.ts` (exists; add non-UUID and undefined cases)                                                                                                |
| 3b       | `orders/infrastructure/checkout.controller.spec.ts`                                                          | `checkout.controller.ts`                                                                                                                                                                                                                                                 |
| 4a       | `apps/mobile/src/features/checkout/courier-fields.ts`, `checkout-view-state.ts` + tests, catalog parity test | `checkout/[storeSlug].tsx`, `packages/i18n/{en,es}/mobile.json`                                                                                                                                                                                                          |
| 4b       | `apps/mobile/src/features/checkout/checkout-errors.ts` + test                                                | `checkout/[storeSlug].tsx`, `apps/mobile/src/features/cart/cart-storage.ts` + `cart-storage.test.ts` (incl. variantId case), `proof-image.ts` + test, `vitest.config.ts` (`coverage.include`, and replace the "UI is untested" comment at :11), `mobile.json` (409 copy) |
| 5a       | session refresh component test                                                                               | `session-context.tsx`, `account.tsx` (401-on-delete handling), `packages/types/http.test.ts` (`onSessionRefresh`, `customFetchBlob` 401 without a bearer)                                                                                                                |
| 5b       | search/login tests where logic is extracted                                                                  | `login.tsx`, `search.tsx`, `session-context.tsx` (`signIn` ordering), `account.tsx` (cart/key wipe on deletion only), `orders/index.tsx`                                                                                                                                 |
| 6a-i     | `customer-auth.service.spec` cases, `global-account.controller.spec.ts`                                      | `customer-auth.service.ts` (log line only), `global-account.controller.ts` (`clearCookie`, `@Throttle`)                                                                                                                                                                  |
| 6a-ii    | none                                                                                                         | `OkResponseDto` reuse in `global-account.controller.ts`, checkout `@ApiHeader`, regenerated `apps/api/openapi.json`, `apps/api/src/metadata.ts`, `packages/types/generated/**`                                                                                           |
| 6b-race  | `apps/api/test/buyer-delete-race.e2e-spec.ts`                                                                | `customer-auth.service.ts` (`deleteGlobalAccount`, `claimWithGoogle`), `customer-account.service.ts` (`withBuyerPhoneLock`, attach `where`)                                                                                                                              |
| 6b-erase | tests                                                                                                        | `customer-auth.service.ts`, `assisted-order-identity-retention.usecase.ts` (export helpers only), `apps/mobile/README.md`, `packages/i18n/{en,es}/mobile.json`, `packages/i18n/{en,es}/storefront.json`                                                                  |
| 6c       | `features/buyer-purchases/mutations/use-delete-global-account.ts`, web test                                  | `my-purchases.tsx`                                                                                                                                                                                                                                                       |
| 7        | none                                                                                                         | `apps/web/app/.well-known/**` tests, `+native-intent.test.ts`, `private-payment-proof.test.ts`                                                                                                                                                                           |
| 8        | none                                                                                                         | `infra/vps/Caddyfile`, `docs/core/caddy.md`, `docs/core/deploy.md`                                                                                                                                                                                                       |

## 6. PR stack, order and base policy

Merge order: **1, 5a, 3a, 3b, 8, 4a, 4b, 5b, 6a-i, 6a-ii, 6c, 6b-race, 6b-erase,
2a, 2b, 7** (5a and 3a unblock the app; 2 is infra and can run in parallel).
Bases: 1, 5a, 3a, 4a, 6a-i, 6c, 7, 8 from `main`; 3b on 3a (same file); 4b on 4a
and 5b on 5a (same files); 6a-ii on 6a-i; 6b-race on 6a-i; 6b-erase on 6b-race;
2a on 1; 2b on `main`. `ci.yml` has no `branches:` filter on `pull_request`, so
stacked PRs get CI.

Deploy-order rules: the API (3a) is deployed before any mobile build containing
4b; PR 8 (Caddy) is deployed before any mobile build containing 5a. No mobile
build has shipped yet (assumption, Q10); 4b and 5a may merge earlier but must
not be released first.

### PR 1 `fix(mobile): make the Maestro and release workflows runnable`

Branch `fix/mobile-workflows-runnable`.

- `pnpm/action-setup` above `actions/setup-node` in the three workflows; in
  `mobile-production-build.yml` set pnpm to `10.11.0` (it currently fails at
  setup because `version: 10` conflicts with `packageManager`) and Node 24; add
  `scripts/ci/mobile-maestro.sh` to the `paths` of the `mobile-maestro.yml` push
  trigger.
- Maestro: install,
  `eas build --platform android --profile preview
  --non-interactive --wait --json`
  and id extraction (`jq -r '.[0].id'`, fail on empty) in normal `run:` steps;
  the emulator `script:` is one line: `bash scripts/ci/mobile-maestro.sh`
  (`set -euo pipefail`), doing `cd apps/mobile`, `eas build:run --id`, the `adb`
  push + media scan, and `maestro test`. Add the documented KVM udev step.
- Names **[fact]**: repo/environment secrets `EXPO_TOKEN`, `EAS_PROJECT_ID`,
  `MAESTRO_STORE_SLUG`, `MAESTRO_PRODUCT_ID`, `MAESTRO_PRODUCT_NAME`,
  `MAESTRO_BUYER_PHONE`, `MAESTRO_BUYER_PASSWORD`, `MAESTRO_PICKUP_LABEL`,
  `MAESTRO_PAYMENT_METHOD` (mapped in the job `env:` to `STORE_SLUG`,
  `PRODUCT_ID`, `PRODUCT_NAME`, `BUYER_PHONE`, `BUYER_PASSWORD`, `PICKUP_LABEL`,
  `PAYMENT_METHOD`); environments `mobile-staging` (Maestro) and
  `mobile-production` (build, update, submit).
- Secrets step-scoped (`EXPO_TOKEN`/`EAS_PROJECT_ID` on every `eas` step and
  every step that loads Expo config; `BUYER_PASSWORD` only on the Maestro step).
  Do not upload the Maestro output directory. Never write `eas build --json`
  output or `EAS_PROJECT_ID` to `$GITHUB_STEP_SUMMARY`. Validate build-id inputs
  in the submit workflow with a UUID regex.
- `BUYER_PASSWORD` handling: verify against the pinned Maestro version whether
  `MAESTRO_*` env vars or an env file are supported (Q6); otherwise keep
  `--env`.
- `timeout-minutes` on update/submit/build; `concurrency` per workflow
  (`cancel-in-progress: false` for production build/update/submit). Must not
  change: app code, release hardening (2a). Verify: Hygiene commands (section
  8), criteria 1-2 and the `yq` half of criterion 3;
  `bash -n scripts/ci/mobile-maestro.sh`; a dry run with stub
  `eas`/`adb`/`maestro` on `PATH`; criteria 1-2. A real `workflow_dispatch` only
  if staging secrets exist, otherwise report "not run".

### PR 2a `chore(mobile): harden the production release path` (stacked on 1; merge after Q2 admin steps)

- `eas-cli` exact devDependency; all `eas` calls via
  `pnpm --filter mobile exec eas`; Maestro installed by a download-and-checksum
  step (like `scripts/ci/install-actionlint.sh`, no `curl | bash`) at a version
  passed through `env`; if the release publishes no checksum, compute the
  SHA-256 once from the pinned download and commit it in the script (assumption:
  whether a checksum is published is not verified).
- Production workflows: add `if: github.ref == 'refs/heads/main'` to each job as
  belt-and-braces (docs: environment rules are the control) and the same
  `ref: ${{ github.sha }}` checkout pin that update/submit have to
  `mobile-production-build.yml`; pnpm `10.11.0` and Node 24 everywhere; EAS
  build ids (only) to `$GITHUB_STEP_SUMMARY`.
- `eas update --channel production --environment production`, preceded by a step
  that runs `bash scripts/ci/check-mobile-ota-ready.sh` (fails with a clear
  message when `expo-updates` is not in `apps/mobile/package.json`; Q1 default
  means the OTA workflow is inert until it is added, and the docs say so). The
  production build also asserts `pnpm --filter mobile exec expo config --json`
  shows the EAS project id (`app.config.js:32-40` sets `updates.url`/`enabled`
  whenever `EAS_PROJECT_ID` is set, even without `expo-updates`, so this only
  proves the id was supplied).
- `dependabot-automerge.yml`: skip auto-merge for `eas-cli` by changing the step
  condition to
  `(<existing a> || <existing b>) && !contains(steps.metadata.outputs.dependency-names, 'eas-cli')`
  (parenthesize the existing `||`), and say why in `release.md`.
- Docs: `docs/mobile/release.md` (all four workflows, inputs, secrets as
  environment secrets, admin prerequisites with `gh api` commands and a precheck
  `gh api
  repos/:owner/:repo/environments/mobile-production`, "inert until
  done", link to `docs/core/mobile-release.md`); `docs/core/ci.md` (replace the
  "UI is untested" claim, add the `test:components` step and the new workflows);
  provisioning checklist for `IOS_TEAM_ID`, `IOS_BUNDLE_ID`, `ANDROID_APP_ID`,
  `ANDROID_APP_SHA256_CERT_FINGERPRINT`.
- State in the PR text: the lockfile change fans out CI jobs filtered on
  `pnpm-lock.yaml` and makes the next `mobile-release.yml` run treat the merge
  as a mobile change. Must not change: app source, `mobile-release.yml`, CI path
  filters. Verify: `pnpm install --frozen-lockfile`;
  `pnpm --filter mobile typecheck`; the lockfile diff adds only `eas-cli`
  subtree entries and changes no existing resolution;
  `pnpm --filter mobile exec eas --version` (proves no build script is needed);
  Hygiene commands; run `check-mobile-ota-ready.sh` with and without
  `expo-updates` in a copy.

### PR 2b `chore(mobile): EAS profile and iOS compliance settings` (blocked on Q7, Q9)

`eas.json`: `environment` on `development` and `beta` (Q9 default `preview`);
`autoIncrement` only on `beta` and `production`. `app.json`:
`ios.config.usesNonExemptEncryption: false` only after the owner answers Q7.
Verify: `pnpm --filter mobile exec expo config --json` shows the resolved
values.

### PR 3a `fix(api): make checkout replay safe` (branch `fix/checkout-replay-rules`)

`replay.ts` `resolveReplay` per design 2 at the three sites; compare changes;
409 before 410. Tests: (1) a test that enumerates the keys of `CreateOrderDto`
and `ShippingAddressDto` and requires each key to be in the delta table or an
explicit "intentionally not compared" list; (2) table-driven one-field deltas
(`it.each`) for each compared field, an equal payload, email case-insensitive
equality, repeated lines, `paymentType`, `pickupDate` (including a stored date
vs a differently normalized string), and "COURIER stored, dto without
`shippingAddress`" -> 409; (3) expiry matrix with injected `now` at -1/0/+1 ms:
`PENDING_PAYMENT` and `PARTIALLY_PAID` (live, at, past `expiresAt`),
`PAYMENT_SUBMITTED` past `expiresAt` -> replay, `VERIFIED` past `expiresAt` ->
replay, `REJECTED`, sweep-cancelled, `Order.status` CANCELLED with future
`expiresAt`, and a mismatched payload against a cancelled order -> 409 not 410;
(4) P2002 unit tests (meta as string, array, nested `driverAdapterError`;
mismatch -> 409; cancelled winner -> 410; unrelated P2002 rethrown; missing
replay rethrows the original error), pattern from
`create-assisted-order.usecase.spec.ts`; (5) an HTTP-level assertion that 409
and 410 survive `AllExceptionsFilter` and bodies carry no order id; (6)
`parseIdempotencyKey` spec; (7) the e2e `checkout-replay-race.e2e-spec.ts`
modeled on `checkout-customer-race.e2e-spec.ts`: fresh `randomUUID` key per
round, same body, both responses 201 with the same `order.id`, `order.count` for
the key = 1, loser's uploaded proof deleted from storage, cleanup in `afterAll`.
If Postgres, Redis and MinIO are unavailable report "e2e not run". Must not
change: schema/migrations, assisted-order idempotency, throttling. Verify:
`pnpm db:generate` + `turbo run build --filter='api^...'`;
`cd apps/api &&
pnpm exec vitest run <specs>`; `pnpm --filter api typecheck`;
`pnpm --filter api
test:cov`; `pnpm turbo run lint --filter=api`; e2e via
`scripts/ci/e2e.sh` when datastores exist (the whole e2e glob includes
`assisted-order-idempotency.e2e-spec.ts`).

### PR 3b `fix(api): correct checkout proof state and cleanup` (stacked on 3a)

`proofSubmitted = payments?.some(p => p.source === "BUYER_SUBMITTED" &&
Boolean(p.imageUrl))`;
cleanup per design 5. Tests (`checkout.controller.spec.ts`, mocked
`createOrder`/`storage`/`prisma`): replay skips upload and `execute` and does
not 400 on a missing file; `proofSubmitted` false with only a seller-recorded
image payment; a 400 and a 409 `HttpException` each call `deleteImage` once with
no lookup; the 499/500 boundary; a non-HTTP error does the lookup with the store
scope in `where` (`expect.objectContaining`), deleting only when unreferenced
and keeping the image when the lookup throws; a rejecting `deleteImage` does not
fail the request. Verify: as PR 3a.

### PR 4a `fix(mobile): complete courier checkout and surface config failures`

Branch `fix/mobile-checkout-courier`. First step: rebuild the P1 probe from
appendix B (the scratchpad script is not in the repo) and confirm it still fails
on `shippingDepartment`, `shippingProvince`, `shippingDistrict` before changing
anything.

- `courier-fields.ts` exports `courierFieldGroups(modality)`; the screen renders
  department/province/district for HOME and AGENCY.
- Five catalog keys in en and es. Parity test (vitest): start from a full valid
  form (P1), `paymentMethodsAvailable=false`, `paymentMethod: ""`, a
  `ProofFileLike` fixture; blank each _shown_ field one at a time for HOME and
  for AGENCY; collect `issues[].path[0]`; require a key in both locales; require
  the AGENCY form with all shown fields filled to validate.
- `checkout-view-state.ts` exports a pure function deciding the config-error
  state: gate unconditionally on `deliveryQuery` failing (the enabled delivery
  types are only known from `deliveryQuery.data`), then on pickup/courier only
  for the selected/enabled type (a failing courier query must not block a
  pickup-only store); treat a query as failed only when
  `isError && data === undefined` (React Query v5 keeps `status: error` after a
  failed background refetch that still has good cached data; the existing
  `paymentQuery.isError` screen has the same bug and uses the same rule);
  include the relevant query's `isPending` in the loading gate (`courierQuery`
  is not in it today); the screen uses the function; submit disabled in the
  error state. Vitest cases: delivery fails, courier fails on a pickup-only
  store, courier fails on a courier store, refetch error with cached data,
  courier pending. At most one jest smoke render (`*.component.tsx`) of the
  AGENCY group. Verify: `pnpm --filter mobile typecheck`, `test`,
  `test:components`, `test:cov`; `pnpm --filter mobile exec jest --listTests`
  lists any new component file; `pnpm turbo run lint --filter=mobile`.

### PR 4b `fix(mobile): make checkout retries recoverable` (stacked on 4a)

`checkout-errors.ts` `mapCheckoutError(err)` ->
`connection | mismatch | expired |
validation(message) | failed` by
`ApiError.status` (410, 409, 400, `TypeError`); key record
`{ v: 1, id, fingerprint, done? }` per design 4 with neutral 409 copy (en and
es); `proof-image.ts` downscale only and delete intermediate outputs. Tests
(vitest; AsyncStorage mocked inside the file): `mapCheckoutError` for
409/410/400/TypeError/other; key reuse, new key on fingerprint change,
old/unknown version -> new key, done marker -> new id, marker write retry once,
"marker written, cart clear fails"; the variantId fingerprint case; proof-image
boundaries (`size === MAX_FILE_SIZE` accepted, `exists:false` and
`size: undefined` fall through, third preset args, no upscale). Add the new pure
modules to `coverage.include`. Verify: as PR 4a.

### PR 5a `fix(mobile): restore session renewal` (branch `fix/mobile-session-renewal`)

- Restore `refreshSessionToken` and the `setSessionRefreshHandler` registration
  and cleanup from `626232a8:apps/mobile/src/features/auth/session-context.tsx`
  (lines 88-142). Merge those lines into the current effect; do not paste the
  whole block (the current `clearLocalSession` also removes queries). Run
  typecheck after.
- `account.tsx`: a 401 from `deleteMe()` (`packages/types/http.ts:104-110`
  already clears the local session through `onUnauthorized`) shows neutral copy
  ("your session ended, sign in to check your account") and routes to login
  instead of the "delete failed" alert; it does not claim the account was
  deleted (a 401 can also be a plain expired session). Tests: jest
  `session-context.component.tsx` (extend): handler registered and cleaned up;
  calling it with a new token writes it and sets the bearer; a stale generation
  or a sign-out between calls does not write. Vitest in
  `packages/types/http.test.ts`: a mocked `fetch` response with
  `X-Session-Token` reaches `onSessionRefresh`; `customFetchBlob` 401 without an
  `Authorization` header does not call `onUnauthorized`. A small vitest/jest
  case for the 401-on-delete decision (pure helper if needed). Verify: mobile
  commands as PR 4a plus `pnpm --filter @biasmarket/types test`.

### PR 5b `fix(mobile): small auth and navigation fixes` (stacked on 5a)

`login.tsx:126` `slug: initialSlug`; `search.tsx` syncs `storeSlug` from
`routeStoreSlug` with an effect; `signIn` removes `["buyer"]` queries after the
generation check, before `setStatus`; account **deletion** (not sign-out) also
removes `biasmarket:cart:*` and `biasmarket:checkout-key:*` and the
`["cart"]`/`["checkout"]` queries; `orders/index.tsx` error state gets retry and
back. Extract pure helpers where needed so the tests are vitest. Verify: mobile
commands as PR 4a.

### PR 6a-i `fix(api): buyer account deletion safety and tests`

Branch `fix/buyer-account-deletion-safety`. `clearCookie` on `deleteMe` with the
same options as `logout` (`path: "/"`); `@Throttle` (5/min) matching
neighbouring routes; a structured log line with the opaque account id only;
comment fix ("device tokens" do not exist). Tests: service spec with the fake tx
(unknown id -> `{ok:true}` with no writes; happy path asserts the order detach,
both `deleteMany`s and every nulled field including
`passwordVersion: {increment:1}`; no PII in log output); controller/e2e: no
session 401, cookie without Origin 403, a bearer minted before deletion rejected
afterwards, a reset or confirm token minted before deletion returns 400, an
erased row cannot be revived via confirm/change-email/change-phone, throttle
test. Verify: as PR 3a.

### PR 6a-ii `chore(api): type DELETE /account/me and the Idempotency-Key header`

Reuse `OkResponseDto` for `deleteMe`; edit the existing `@ApiHeader` on
`checkout.controller.ts` (~:203) to add
`schema: { type: "string", format: "uuid" }`. Merge after 3b (same file); if
3a/3b change a swagger decorator or DTO they run the two drift scripts
themselves. Regeneration order: `pnpm --filter api
generate:swagger-metadata` ->
`pnpm --filter api generate:openapi` ->
`pnpm --filter
@biasmarket/types generate` -> `git status --porcelain` (no
untracked files under `generated/`) -> commit ->
`bash scripts/ci/check-openapi-drift.sh` ->
`bash
scripts/ci/check-types-sdk-drift.sh`.

### PR 6b-race `fix(api): make buyer deletion safe against concurrent checkout and claim` (merge only with a green CI `E2E (API)` job)

Design 6 end to end (lock order, retryable 409 incl. `P2028`, attach `where`
fix, `claimWithGoogle` locked read, `lockLiveBuyerAccount` for the other
writers, `withBuyerPhoneLock`). Tests: lock taken before the first write and
phone re-read (call order, fake tx); null-phone account skips the phone lock but
takes the row lock; the attach `where` carries `passwordVersion` and `email`
(regression: a Google-session checkout racing delete must not write a phone onto
the shell); e2e `buyer-delete-race.e2e-spec.ts`: concurrent checkout vs delete
on one phone, claim vs delete, phone-attach vs delete, address-create vs delete,
link-upsert vs delete; each runs several rounds with fresh data
(`X-Forwarded-For` in an unused range: `198.51.101.x`-`198.51.103.x` are taken
by the existing specs, use `198.51.104.x`; reuse the Google mock from
`test/buyer-claim.e2e-spec.ts`); assert no deadlock error surfaces other than
the retryable 409 and no order, address or link ends attached to an erased
account. The PR is mergeable only when the CI job `E2E (API)`
(`ci.yml:1180-1181`, required by `ci-success`, 30 min timeout; keep `ROUNDS`
small) is green with the new spec; "not run locally" is acceptable for the
implementer's report, merging on fake-tx tests alone is not. Verify: as PR 3a
with the e2e.

### PR 6b-erase `fix(api): erase per-store customer records on buyer deletion` (blocked on Q8; stacked on 6b-race)

Design 7; export `erasedCustomerData`, `isClosed`, `hasRemainingCustomerOrders`
(export only, no behavior change). `apps/mobile/README.md` and the deletion copy
in `packages/i18n/{en,es}/mobile.json` (`account.deleteConfirmation`) and
`packages/i18n/{en,es}/storefront.json` (`deleteConfirmation`) aligned with the
retained-data table; rebase on 4b/5b if they changed those files; follow-up for
the privacy page. Tests: buyer linked to two stores; account with no phone;
Customer with a remaining order is not erased; a Customer reached only via
`Order.customerId` after a phone change is erased; delete -> re-register the
same phone -> old orders neither visible nor claimable (`claimedAt` set) and no
inherited `Customer` history; seller customers list and detail do not throw on
`erased:<id>` and do not re-create the row.

### PR 6c `fix(web): buyer account deletion UI` (branch `fix/web-account-deletion-ui`)

`AlertDialog` instead of `window.confirm`; `invalidateQueries` for the profile
(`removeQueries` stays for orders); one react-query import; mutation moved to
`features/buyer-purchases/mutations/use-delete-global-account.ts` and exported
from `features/buyer-purchases/index.ts` (the generated
`apiClient.globalAccount.deleteMe` returns `Promise<void>` until 6a-ii lands;
the hook ignores the body). Tests: model on `assisted-order-section.test.tsx`
(`findByRole("alertdialog")`, `userEvent`): confirm calls `mutate` and
invalidates the profile key; cancel does nothing. Verify:
`pnpm --filter web exec vitest run features/buyer-purchases`,
`pnpm --filter
web typecheck`, `pnpm --filter web test:cov` if available,
`pnpm turbo run lint
--filter=web`.

### PR 7 `test: close remaining web and mobile test gaps` (deferrable)

`.well-known` tests (`vi.stubEnv`/`unstubAllEnvs`, clear `IOS_BUNDLE_ID`, assert
`exclude` per pattern); `+native-intent.test.ts` (full `https://` URL,
`/espresso/...` unchanged, invalid URL -> `/`, lookahead; pin that query/hash
are dropped today); `private-payment-proof.test.ts` asserts the Blob passed to
`readAsDataURL`. Verify: `pnpm --filter web exec vitest run app/.well-known`,
mobile commands as PR 4a.

### PR 8 `fix(infra): do not log session tokens or idempotency keys in Caddy`

Branch `fix/caddy-redact-session-headers`. In both `log` blocks of
`infra/vps/Caddyfile` delete the response header `X-Session-Token` and the
request header `Idempotency-Key` (confirm exact field paths with
`caddy adapt`/`caddy
validate`; the JSON field for response headers is
`resp_headers`, verified by a stubbed `caddy validate` in round 3; whether
`caddy` is installed locally is an assumption, otherwise report "not run").
Update `docs/core/caddy.md` ("Access logs and token redaction") and add a note
to `docs/core/deploy.md` to confirm against one real log line after deploy.
`caddy validate` on the real file fails on the missing
`import /etc/caddy/active/*.caddy` files; validate a copy with those two
`import` lines replaced (e.g. via `sed`) by an empty file. Infra changes follow
the supervised blue/green flow in `docs/core/deploy.md`. Verify:
`caddy validate` (if available locally; otherwise report "not run").

## 7. Sequenced steps and completion signals

0. Release-order constraints (not merge order): PR 8 is deployed before any
   mobile build containing PR 5a; PR 3a before any build containing PR 4b; both
   need the owner's Q10 confirmation that no mobile build with this code has
   reached users. PR 2a/2b run in parallel with everything but 2a merges only
   after the Q2 admin steps.
1. Fresh branch off `origin/main`; if `main` moved in files of section 5,
   re-read section 2. Signal:
   `git diff 3c40e0b0 origin/main --stat -- <section 5 paths>` empty or
   reviewed.
2. PR 1; then PR 5a and PR 3a (+3b); PR 8 (before any mobile release) ->
   criteria 1, 2, 8-13, 22.
3. PR 4a, 4b, 5b -> criteria 6, 7, 14, 15, 20.
4. PR 6a-i, 6a-ii, 6c; then 6b-race; 6b-erase only after Q8 -> criteria 16-19.
5. PR 2a after the Q2 admin steps; 2b after Q7, Q9 -> criteria 3-5.
6. PR 7; open the follow-up issues (section 10).

## 8. Test strategy and command facts

Rules: mobile component tests are named `*.component.tsx`; every mobile PR runs
`pnpm --filter mobile exec jest --listTests` and any new file must appear (today
2 suites, 4 tests). New mobile logic goes into pure modules tested under vitest.
Inject `now` instead of fake timers where possible; assert UUID shape only (or
mock `expo-crypto`); vitest tests mock AsyncStorage themselves (`jest.setup.cjs`
mocks are jest-only). Fake data only (`+51900000001`, `example.com`);
`apps/mobile/.maestro/fixtures/payment-proof.png` must not be a real payment
screenshot. After each PR run `test:cov` for touched packages (floors: mobile
statements 79 / branches 81 / functions 72 / lines 87 on the three gated files;
API 75/73/67/75; web 48/46/43/48).

Prerequisites: Node 24 first on `PATH` (the Homebrew default node aborts here on
a missing `libsimdjson`); `pnpm install --frozen-lockfile --ignore-scripts`;
build workspace packages before API/mobile suites
(`DATABASE_URL=postgresql://x:x@localhost/x
pnpm turbo run build --filter='api^...'`
/ `--filter='mobile^...'`) and `pnpm
db:generate` for API specs.

**[fact]** run in the plan session on a scratch worktree at `3c40e0b0`:

| Command                                                                                           | Result                   | Time   |
| ------------------------------------------------------------------------------------------------- | ------------------------ | ------ |
| `pnpm install --frozen-lockfile --ignore-scripts`                                                 | ok                       | 13 s   |
| `pnpm --filter mobile typecheck`                                                                  | ok                       | ~1.5 s |
| `pnpm --filter mobile test`                                                                       | 6 files / 26 tests pass  | ~3 s   |
| `pnpm --filter mobile test:components`                                                            | 2 suites / 4 tests pass  | ~5 s   |
| `pnpm db:generate` + `turbo run build --filter='api^...'`                                         | ok                       | ~3 s   |
| `cd apps/api && pnpm exec vitest run` (create-order, customer-auth, checkout-upload-limits specs) | 3 files / 127 tests pass | ~2.5 s |
| `pnpm --filter api typecheck`                                                                     | ok                       | ~8 s   |
| `cd apps/web && pnpm exec vitest run app/.well-known`                                             | 2 files / 6 tests pass   | ~2 s   |

Planned, not run in the plan session (implementers report "not run" when they
cannot run them): `pnpm lint`, `pnpm --filter api test:e2e` and the new e2e
specs (need Postgres, Redis, MinIO via `scripts/ci/e2e.sh`), the regeneration
commands and both drift scripts, any `test:cov`, any emulator/device/EAS run,
any GitHub workflow run, `caddy validate`.

Hygiene commands (same as CI):
`bash scripts/ci/install-actionlint.sh
"$TMPDIR/actionlint" && "$TMPDIR/actionlint/actionlint"`
(downloads a linux_amd64 binary, so on a Mac use `brew install actionlint` and
run `actionlint`) and `shellcheck scripts/ci/*.sh`.

## 9. Acceptance criteria (each has a command or a named test)

1. In each of `mobile-maestro.yml`, `mobile-production-update.yml`,
   `mobile-store-submit.yml`, an awk/grep check shows the `pnpm/action-setup`
   line before the `actions/setup-node` line; actionlint and
   `shellcheck scripts/ci/*.sh` pass.
2. The `script:` of the emulator step in `mobile-maestro.yml` is exactly one
   non-empty command line (awk over a `script: |` block, or the inline
   `script:
   bash ...` form; the check must handle both).
3. `git grep -nE "npm install (-g|--global)|curl .*\| *bash" -- .github/workflows/mobile-*.yml`
   is empty; `eas-cli` is an exact version in `apps/mobile/package.json`; this
   `yq` query prints `0` for each of the four mobile workflows (today it prints
   9, 2, 2, 2):
   `yq '[.jobs[] | select(has("env")) | .env | to_entries[] | select(.value | test("secrets\\."))] | length' <workflow>`.
4. `mobile-production-update.yml` contains `--environment production`;
   `bash scripts/ci/check-mobile-ota-ready.sh` fails without and passes with
   `expo-updates` in a copy of `package.json`; `dependabot-automerge.yml` skips
   `eas-cli`.
5. (after 2a and 4b) `git grep -n "UI is untested" docs apps/mobile` is empty;
   `docs/mobile/release.md` lists all four workflows, their inputs, secrets and
   the admin prerequisites.
6. `courierFieldGroups("AGENCY")` includes department/province/district and an
   AGENCY form with all shown fields filled validates (vitest).
7. The parity test fails if a shown-path key is missing in en or es (HOME and
   AGENCY).
8. (`apps/mobile/src/features/auth/session-context.component.tsx`, extended, and
   `packages/types/http.test.ts`) Handler tests: registered/cleaned up, writes a
   new token, ignores a stale generation or post-sign-out call; the
   `packages/types` test shows `X-Session-Token` reaches `onSessionRefresh`; a
   401 on delete routes to login with the neutral message.
9. Replay tests per PR 3a: the key-enumeration test passes; every compared field
   delta -> 409; equal payload -> replay; the expiry matrix incl.
   `PAYMENT_SUBMITTED` and `VERIFIED` past `expiresAt` -> replay,
   reserved-unpaid past `expiresAt` and cancelled -> 410, mismatched payload vs
   cancelled -> 409.
10. An HTTP-level test proves 409 and 410 reach the client through
    `AllExceptionsFilter` with no order id in the body.
11. The race e2e passes in the CI job `E2E (API)` ("not run locally" is fine in
    the implementer's report); the loser's proof is deleted.
12. `proofSubmitted` is false with only a seller-recorded image
    (`apps/api/src/modules/orders/infrastructure/checkout.controller.spec.ts`).
13. A 400/409 `HttpException` calls `deleteImage` once with no lookup; a
    non-HTTP error does a store-scoped lookup (same
    `checkout.controller.spec.ts`).
14. `mapCheckoutError`, key-record, done-marker and proof-image tests pass.
15. `checkout-view-state` tests prove a failing delivery/pickup/courier query
    shows the retry state only when relevant to the selected/enabled method.
16. `DELETE /account/me` tests per PR 6a-i; the lock tests and the e2e per PR
    6b-race pass, the latter in the CI job `E2E (API)` (fake-tx tests alone
    never justify merging 6b-race).
17. `openapi.json` and the SDK show an `OkResponseDto` response and
    `format: uuid`; both drift scripts pass.
18. (after Q8) the PR 6b-erase tests pass.
19. The web delete flow uses `AlertDialog`, `invalidateQueries`, the new
    mutation file, and has the test above.
20. Per touched package: `typecheck`, `lint`, unit tests and `test:cov` pass;
    `jest
    --listTests` lists every new mobile component test.
21. Every follow-up issue in section 10 exists on GitHub (`gh issue list`) and
    is linked from the PR that introduced the related change; PR 7's tests are
    covered by criterion 20.
22. `caddy validate` passes on the stubbed copy (or "not run" is reported) and
    both `log` blocks in `infra/vps/Caddyfile` delete `X-Session-Token`
    (response) and `Idempotency-Key` (request).

Appendix: finding -> PR -> criterion

| Review comment                                        | PR            | Criterion               |
| ----------------------------------------------------- | ------------- | ----------------------- |
| 576-1, 576-2, 576-3                                   | 1             | 1, 2                    |
| 576-4, 576-5, 576-6, 576-23                           | 2a            | 3, 4, 5                 |
| 576-7                                                 | 2a (guard)    | 4                       |
| 576-8, 576-9                                          | 2b            | (Q7, Q9)                |
| 576-10                                                | 5a (+8)       | 8, 22                   |
| 576-11, 576-12                                        | 4a            | 6, 7                    |
| 576-13                                                | 4b            | 14                      |
| 576-14                                                | 6b-erase      | 18                      |
| 576-15                                                | 3b            | 13                      |
| 576-16                                                | 3a            | 9, 10, 11               |
| 576-17                                                | 6a-i, 6b-race | 16                      |
| 576-18, 576-19                                        | 3a, 3b        | 9-13                    |
| 576-20, 576-21                                        | 6c            | 19                      |
| 576-22                                                | 4b            | 14                      |
| bot thread `proofSubmitted`                           | 3b            | 12                      |
| bot thread login slug                                 | 5b            | 20 (login/search tests) |
| bot review-body: `pickupDate`                         | 3a            | 9                       |
| bot review-body: deletion vs checkout race            | 6b-race       | 16                      |
| bot review-body: `removeItem` swallowed               | 4b            | 14                      |
| bot review-body: `OkResponseDto`, uuid format         | 6a-ii         | 17                      |
| bot review-body: delivery/pickup/courier error screen | 4a            | 15                      |
| bot review-body: search slug                          | 5b            | 20                      |

## 10. Follow-up issues to open (not in these PRs)

- Mobile checkout request timeout/`AbortController` (map `AbortError`).
- Tighten `Idempotency-Key` to UUID v4 (shared with assisted orders).
- `whatsappUrl` on replay (needs product names + template lookup).
- Consolidate `docs/mobile/release.md` and `docs/core/mobile-release.md`.
- A11y pass on mobile checkout (`Field` labels, `Choice` radio group, touch
  targets).
- Dead i18n keys in `mobile.json` (13 listed in the review notes).
- Android `pathPattern` entries still match extra segments/empty ids.
- Device verification of Universal/App Links and the Maestro picker (#186).
- Maestro flow regex-sensitive env values; staging-API-URL guard.
- Privacy page copy vs the retained-data table; anonymizing detached orders
  (reuse the order erasure helpers) as an accepted gap.
- Convention for non-concurrent index migrations (CodeRabbit item).
- `Cache-Control: no-store` on checkout replies (optional).

## 11. Risks and edge cases

- **Deploy order and old clients.** No schema change in any PR. An old API never
  sends 410, so a new app against an old API would replay a cancelled order with
  200 and show a success screen for a dead order: hence "deploy the API (3a)
  before any mobile build containing 4b". Blue/green canary windows serve both
  API versions; a replay can hit either, which is acceptable. An old app against
  the new API treats 409/410 as `checkout.submitFailed` and keeps its key (loop
  until the cart changes): no mobile build has shipped (Q10). Web assisted
  orders use another endpoint and exception; the e2e glob includes
  `assisted-order-idempotency.e2e-spec.ts`.
- **Key record format.** An older app's `getCheckoutIdempotencyKey` reads
  `{fingerprint,id}` and ignores `v`/`done`, so rolling back 4b makes it reuse
  v1 records, including `done` ones (a stale key until the cart changes). 4b's
  own code mints a new key for unknown versions.
- **Erasure.** Lock order is phone -> orders (id-sorted) -> account row
  everywhere; `claimWithGoogle` and `findOrCreateCustomer` are changed together
  with the delete path and proven by e2e. A `Customer.phone` update takes a row
  lock that can briefly block order inserts for that customer (no cycle:
  assisted flows take only `assisted-customer:` locks). 6b-erase is irreversible
  for deleted accounts, hence its own PR and Q8. Without anonymizing order
  snapshots the seller can still see the buyer's data, so UI/README copy says
  "reusable profile data".
- **Residual risk (accepted, tested):** if the done-marker write succeeds and
  the cart clear then fails twice, an app restart can resubmit the stale cart
  with a fresh key (a duplicate order the buyer can see in My orders).
- **Logs.** No buyer data in new logs; Caddy must not log session tokens or keys
  (PR 8); test data is fake; the Maestro output directory is never uploaded;
  replay 409/410 bodies carry no order id.
- **Workflow changes cannot be fully tested without secrets/runners**; report
  what was not run. GitHub auto-creates missing environments unprotected, so PR
  2a must not merge before the Q2 admin prerequisites; the docs mark the
  workflows inert until then.
- **Rollback.** PR 1 and 2a revert together (the lockfile drop removes
  `eas-cli`). 3a/3b/6a revert cleanly (no schema change). 6b-erase does not undo
  erasures. PR 8 reverts by redeploying the previous Caddyfile.

## 12. Open questions (defaults are safe to ship unless marked)

| #   | Question                                                                                                                                                                                                           | Default if unanswered                                                                                                             | Blocks                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Q1  | Ship OTA now (add `expo-updates`) or keep it inactive?                                                                                                                                                             | Keep it inactive: no `expo-updates`; PR 2a adds `check-mobile-ota-ready.sh` and the docs say the OTA workflow is inert            | none                       |
| Q2  | Who creates `mobile-staging` / `mobile-production` (required reviewers, deployment branch `main`, environment secrets) and the protected `mobile-release` branch?                                                  | A repo admin, before PR 2a merges, with the documented `gh api` commands; the implementer does not run them                       | PR 2a merge                |
| Q3  | Error-path proof lookup: no-lookup-for-4xx + store-scoped lookup, or an `@@index([storeId, imageUrl])`?                                                                                                            | No migration. If chosen, `CREATE INDEX CONCURRENTLY` in its own migration (`docs/core/blue-green-migrations.md`)                  | none                       |
| Q6  | Does the pinned Maestro version accept `MAESTRO_*` env vars / an env file for `BUYER_PASSWORD`?                                                                                                                    | Verify in PR 1; if unsupported keep `--env` and note it                                                                           | none                       |
| Q7  | **Owner decision, legal declaration**: does the app use only exempt (HTTPS/standard OS) encryption so `usesNonExemptEncryption: false` is accurate?                                                                | **No default**: the `app.json` change in PR 2b is skipped until answered                                                          | PR 2b                      |
| Q8  | **Owner decision**: retention policy and legal basis for the retained-data table (orders, proof images, events, audit); erase per-store `Customer` rows; anonymize detached orders; revoke `accessTokenHash` links | Erase eligible `Customer` rows, keep order snapshots, keep order links live, document all of it; do not anonymize orders          | PR 6b-erase (stop and ask) |
| Q9  | Which EAS `environment` does `beta` use?                                                                                                                                                                           | `preview` (staging API)                                                                                                           | PR 2b                      |
| Q10 | Has any mobile build with this code reached real users?                                                                                                                                                            | Assume no. **Blocking for the release of 4b/5a (not for merging them)**: the owner confirms before a build containing them is cut | release of 4b/5a           |

Q7 and Q8 change legal/data scope, so the `app.json` part of PR 2b and PR
6b-erase do not start without an owner answer. PR 6b-race and PR 6b-erase are
the highest-uncertainty items: three review rounds each found new lock-order or
writer-coverage problems in the account-deletion design (round 3 reproduced a
deadlock with the retention flow and an ineffective plain-read re-check in a
throwaway Postgres). The design in section 4 (items 6-7) is the best current
answer but is not proven; the implementer of 6b starts by writing a short
lock-order table of every writer of `BuyerAccount`, `Order.buyerAccountId`,
`Address`, `CustomerStoreLink` and `Customer`, has it reviewed, and proves it
with the e2e before merging. If that cannot be done, ship 6a-i / 6a-ii / 6c
(deletion tests, cookie, throttle, types, web UI) and leave 6b as a follow-up
issue. Everything else has a safe default.

## Appendix B: probe P1 (rebuild it; the scratch copy is not in the repo)

Run from `apps/mobile` with Node 24 after
`turbo run build --filter='mobile^...'`:

```js
import { buildCheckoutFormSchema } from "@biasmarket/validation";
const s = buildCheckoutFormSchema(false, true, new Set(), new Set());
const form = {
  customerName: "Ana",
  customerPhone: "999999999",
  customerEmail: "",
  deliveryMethodType: "COURIER",
  pickupPointId: "",
  pickupDate: "",
  paymentMethod: "YAPE",
  paymentType: "FULL",
  courierName: "Olva",
  courierModality: "AGENCY",
  shippingRecipientName: "Ana",
  shippingRecipientSurnames: "",
  shippingPhone: "999999999",
  shippingDocumentType: "DNI",
  shippingDocumentNumber: "12345678",
  shippingDepartment: "",
  shippingProvince: "",
  shippingDistrict: "",
  shippingLine1: "",
  shippingLine2: "",
  shippingCity: "",
  shippingRegion: "",
  shippingReference: "",
  shippingAgencyName: "Olva Miraflores",
  paymentProof: null,
};
const r = s.safeParse(form);
console.log(
  r.success ? "OK" : [...new Set(r.error.issues.map((i) => String(i.path[0])))],
);
```

Expected today: it reports `paymentProof` (non-cash method without a proof),
`shippingRecipientSurnames` and `shippingDepartment`, `shippingProvince`,
`shippingDistrict`. The 4a test uses `paymentMethod: ""` (with
`paymentMethodsAvailable=false`) or a `ProofFileLike` fixture so only the
courier paths remain, and fills the shown fields except the one under test.
