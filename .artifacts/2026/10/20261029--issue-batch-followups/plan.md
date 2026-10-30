# Plan: close the 15 open follow-up issues in one implementation session

Status: ready (rounds 1-4 findings applied; the last two rounds found only
wording-level gaps, all fixed; no further round was run) Date: 2026-10-29. Base:
`origin/main` @ `010f43d8` (local `main` is 2 commits behind; always `git fetch`
first).

Issues: #391 #380 #379 #378 #377 #376 #375 #356 #342 #341 #340 #339 #338 #336
#335. Shape: the implementation session opens PRs and does NOT merge; a review
session reviews, fixes, posts, merges and closes issues (see
`review-handoff-prompt.md`). The human confirmed one decision in the plan
session (#377, section 2 D11); everything else uses the defaults in section 10.

## 1. Context, and what is stale in the request

Facts (verified on `origin/main` unless marked probe/claim):

- No issue has shipped. All 15 are OPEN.
- `ci.yml` runs on `pull_request` with no branch filter (PR #416), so stacked
  PRs get CI. A red `main` blocks CD (`docs/core/ci.md`). `ci.yml` concurrency
  cancels in-progress runs, so rapid merges deploy only the last SHA, all
  migrations at once.
- **#375 is partly stale.** Probe (scratch worktree): the "missing" DTOs
  `StorefrontCatalogRequestDto`/`StorefrontRequestDto` ARE in `openapi.json` and
  `generated/api.schemas.ts`; `apps/api/openapi.json` has zero drift; TS2308 did
  not reproduce (tsc passed with the stray file). Real cause: committed SDK =
  orval **8.23.0** (file headers), `package.json` `^8.23.0`, lockfile resolves
  **8.43.0**.
- **#338 probe:** with 8.43.0 `generate` changes 33 files (after prettier +1615/
  -316): header loses version, operation names are deduped globally across tags
  (`findAll` -> `findAll3`..`findAll15`, `orderDetail` -> `orderDetail2`), type
  casing changes, and `generated/index.ts` is emitted. `typecheck --filter=web`
  then has 110 errors (~49 call sites). With 8.23.0 + prettier `generate` is a
  zero diff and emits no `index.ts`. Names depend on tag order in 8.43.
- **#340 premise is conditional.** `infra/vps/Caddyfile` has no `log` directive,
  so Caddy emits no access logs today; the compose image is floating
  `caddy:2-alpine`, no `logging:` limits. Web route is
  `/store/:slug/pedido/:token` (also `/{es,en}/...`); api route is
  `/api/public/orders/:token`. `next.config.ts:35` already sets
  `Referrer-Policy: no-referrer` and `scrub-request-url.ts` scrubs api error
  tracking. Deploy mechanics (ops review, claim from reading):
  `docker-compose.yml` bind-mounts the single file `./Caddyfile`; `cd.yml`
  rsyncs with `--delay-updates` (rename -> new inode, a single-file bind mount
  may keep the old content); `deploy.sh` only calls `reload_caddy` on normal
  deploys, runs `compose up -d caddy` only in bootstrap, and has no
  `caddy validate` step.
- **#356:** the screenshot is the landing "New Products" row
  (`discovery/server.ts` `fetchProducts(3,"latest")` ->
  `product-search.service.ts`), which already filters `PUBLIC_STORE_VISIBILITY`.
  The "test" item (@carlos, no image) is either an `isDemo` store (data) or a
  junk product.
- **#380 is a bundle** of ~13 items; two cannot be done by an agent.
- **#377 attack paths (verified by reading code):** `register` takes only
  `{token,password}` with an emailed HMAC token (no attacker-chosen password).
  Reachable paths: (1) an unauthenticated checkout creates a `BuyerAccount` with
  the attacker's phone and the victim's email
  (`customer-account.service.ts:~186-217`, `emailVerified=false`); the victim
  clicks confirm / sets a password (`confirmAccount` `:~384`,
  `setPasswordFromToken`), the account becomes verified and a later Google login
  by the victim links to it. (2) change-email: tokens carry only
  `id.purpose.expiry` (`packages/utils/src/customer-account-token`),
  `updateProfile` clash check is exact-match and ignores other accounts'
  `pendingEmail`, and `confirmAccount` applies whatever `pendingEmail` is
  current, so an attacker can redeem an earlier token after re-pointing
  `pendingEmail`. Both end with `emailVerified=true` on an account the attacker
  shaped, and the Google link rule (`customer-auth.service.ts:~348-410`) merges
  into it.
- Account model is `BuyerAccount`; the claim failure type is `ClaimOrderError`.

## 2. Design decisions

### D1 Orval: pin 8.23.0 exactly, deterministic generate, drift check (#338, #375)

- `packages/types/package.json`: `"orval": "8.23.0"`. Edit by hand, then
  `pnpm install --lockfile-only` (not `pnpm add`, which rewrote ~30k lines in
  the probe). Acceptance: the lockfile diff touches only orval/`@orval/*`
  entries and their direct deps (`git diff --stat pnpm-lock.yaml`; investigate
  if more than ~300 lines or any non-orval package changes). CI uses
  `--frozen-lockfile`.
- `generate` script:
  `orval --config orval.config.ts && node
  scripts/fix-esm-extensions.mjs && pnpm exec prettier --write generated`;
  delete `generated/index.ts` if present (in `fix-esm-extensions.mjs` or a tiny
  script). `prettier` is only a root devDependency: verify it resolves from
  `packages/types` (or add it as a devDependency there).
- Exit criterion: `pnpm --filter @biasmarket/types generate` ->
  `git status
  --porcelain --untracked-files=all` empty. No regeneration, no
  web churn.
- Non-goal: upgrading to 8.43 (needs `operationName` config first).
- `scripts/ci/check-types-sdk-drift.sh`: run generate, then
  `git diff
  --exit-code -- packages/types/generated` and
  `test -z "$(git status
  --porcelain --untracked-files=all -- packages/types/generated)"`;
  message says to run generate and commit. Wire into the `types` job (after
  install, before lint; the job already has `fetch-depth: 0`, pnpm, install).
  Add `apps/api/openapi.json`, `scripts/ci/check-types-sdk-drift.sh` to the
  `types:` paths filter in `ci.yml`. Editing `ci.yml` makes every filter true
  (full CI on this PR, expected). `shellcheck scripts/ci/*.sh` in the `hygiene`
  job covers the new script; run `node scripts/check-workspace-scripts.mjs`
  (`pnpm
  check:workspaces`) after the ci.yml edit; quote `${{ }}`/`$GITHUB_*`
  for actionlint. `check-ci-success.sh` needs no change (Types is already
  listed).
- Dependabot: there is no `.github/dependabot.yml` (only
  `dependabot-automerge.yml`). Do NOT create one. State in the PR body that an
  orval bump PR will go red on the drift check and must be regenerated by hand.
- Docs: one line each in `CLAUDE.md` and `apps/web/AGENTS.md`.

### D2 Checkout upload limits (#391)

- New `CHECKOUT_UPLOAD_LIMITS` in `apps/api/src/common/upload-limits.ts`:
  `fileSize: MAX_UPLOAD_SIZE_BYTES + 1`, `files: 1`, `fields: 64`, `parts: 66`,
  `fieldSize: 8192`. Why not reuse `PAYMENT_PROOF_UPLOAD_LIMITS` (`fields: 8`):
  the DTO has 11 scalar fields and the Orval client appends one `items` field
  PER item (`checkout.ts:~58`), `items` has only `@ArrayMinSize(1)`. Do NOT add
  `@ArrayMaxSize` to items.
- `FileInterceptor('file', { limits: CHECKOUT_UPLOAD_LIMITS })` at
  `checkout.controller.ts:~195`. Memory note: no `storage` option =>
  MemoryStorage; worst case ~5 MB + ~0.5 MB per request, throttled 10/min/IP.
  State in PR body. A Caddy body cap is a non-goal. No `note` field exists on
  checkout. Basis: 11 scalar fields leave room for ~50 cart lines at
  `fields: 64`; a cart above ~50 lines gets a 400 (accepted: real carts are far
  smaller; state it in the PR). Boundary tests: exactly 50 `items` passes, 60
  -> 400.
- Tests: new `checkout-upload-limits.spec.ts` modelled on
  `payment-proof-upload-limits.spec.ts` (Nest testing module + supertest):
  realistic body (11 scalars + 20 `items` + proof) passes; exactly 5 MB ok; 5
  MB+1 -> the pipe's friendly 400; 6 MB -> 413; 1000 fields -> 400; oversized
  field -> 400; second file -> 400; wrong field name -> 400.

### D3 Product image cap (#335)

- Export `MAX_PRODUCT_IMAGES = 6` from a products-module file; replace
  `ProductsService.MAX_IMAGES` (`products.service.ts:335`) and the literal in
  `reorder-images.dto.ts:16`; ADD `@ArrayMaxSize(MAX_PRODUCT_IMAGES)` to
  `images` in `create-product.dto.ts` and `update-product.dto.ts` (none today).
- Bypass probe closed: writers of `Product.images` are `products.service.ts`
  create (`:100`), update (`:204,:222`) and image endpoints; the catalog JSON
  import only exists as an artifact folder. Mention in the PR that a future
  importer must use the constant.
- OpenAPI/SDK: `maxItems` appears ->
  `pnpm --filter api generate:openapi && pnpm
  --filter @biasmarket/types generate`,
  commit. Stacked on PR 1.
- Tests: DTO test (7 invalid, 6 valid) for create + update; e2e POST and PATCH
  with 7 images -> 400.

### D4 Order ref (#339): one function, 6 characters

- Rationale: 6 chars is what buyers already see in WhatsApp; cuid tails are
  random so fewer collisions; `orderNumber` is display-only.
- `packages/utils/src/order-ref/index.ts` + `index.test.ts`: `orderRef(id)` =
  last 6 chars uppercase, no `#`. Exports map is `./*` -> `dist/*/index.js`
  (`@biasmarket/utils/order-ref`); build utils first
  (`pnpm --filter @biasmarket/utils build`) before api/web tests.
- Replace: `shortOrderRef` (`whatsapp/index.ts:190`, import
  `../order-ref/index.js`); web `getOrderNumber` becomes `#${orderRef(id)}`
  (keeps call sites); `partial-payments-card.tsx:41`; api
  `public-order.service.ts:~178` and `order.repository.ts:~141`. Update comments
  at `public-order.service.ts:176` and `assisted-link-message.ts:9`.
- Tests pinning old values (update): web `related-orders.test.tsx:45`
  (`"#1234"`), `created-order-screen.test.tsx:123` (`#CDEF`), the `AB12`
  fixtures (`public-order/test-fixtures.ts:34`, receipt-confirmation,
  public-order-page, save-invite, invite-storage, use-save-invite tests) where
  they model a real ref; api e2e `related-orders:162`,
  `assisted-order-links:394`, `buyer-claim:274`. Acceptance grep:
  `rg "slice\(-4\)" apps packages -g '!node_modules'` has no order-ref hits, and
  `rg "getOrderNumber|orderRef|shortOrderRef" apps packages -g '!node_modules'`
  shows only the single implementation and its callers.
- Also grep seeds and `whatsapp-templates` defaults/fixtures for hard-coded
  `#XXXX` refs (seller templates use placeholders; confirm). Already-sent
  WhatsApp messages keep their 6-char ref. Side effect: invite-storage keys use
  `orderNumber`; existing flags reset once.

### D5 Caddy access-log redaction (#340)

- Behavior change to disclose in PR body and docs: today there are NO access
  logs; adding a `log` directive turns on access logging (including client IPs)
  for the two site blocks. That is the only way to satisfy "token not in the
  log" while keeping useful logs; decision default = add redacted logs.
- Define a top-level snippet `(redact_log)` and `import redact_log` directly in
  the `api.biasmarket.com` and `biasmarket.com` site blocks (`log` is a
  site-level directive; not inside `handle`, not in the gitignored
  `caddy/active/*.caddy`). Use the Caddyfile form
  `format filter { wrap json
  fields { request>uri regexp ... ; request>headers>Referer delete } }`;
  verify field names/syntax against the pinned version, including query-string
  variants.
- Placement (`infra/vps/Caddyfile` read in full): keep the global options block
  (lines ~8-14) first; add `(redact_log) { log { ... } }` as its own top-level
  block after it and before `api.biasmarket.com {` (~16); add
  `import redact_log` as a site-level line in `api.biasmarket.com` (~16-44) and
  `biasmarket.com` (~46-55). Do not touch the `cdn.`/`status.` blocks. A
  site-level `log` coexists with the existing `handle` blocks.
- Hole: `reverse_proxy` runtime errors (e.g. "dial tcp ... connection refused"
  during a blue/green switch, from reading, not run) go to Caddy's default
  logger and include the request URI. Also configure the global default
  `log { format filter { wrap json fields { request>uri regexp ... } } }` INSIDE
  the existing `{ servers {...} }` global block (a second top-level `{}` is a
  Caddyfile error) and add a verification that stops the upstream, curls a
  `SECRET` path and greps the logs.
- Image pin is OPTIONAL: pin only if the human supplies the tag the VPS runs
  (`docker compose images caddy`/`caddy version` on the host). Default: leave
  `caddy:2-alpine` unchanged (an unintended proxy upgrade has no rollback
  signal), say so in the PR, and note the version
  `docker run caddy:2-alpine caddy version` reports that the snippet was
  verified against. Add `logging: json-file max-size 10m max-file 5`. Document
  retention, redaction and the recreate rule in `docs/core/deploy.md` and
  `docs/core/caddy.md`.
- Verification (local docker): `caddy validate` the full Caddyfile in a scratch
  copy with `caddy/active/*.caddy` created from the `.example` files; throwaway
  `:8080` config (`auto_https off`) using the same snippet;
  `curl
  /api/public/orders/SECRET`, `/es/store/x/pedido/SECRET?x=1` and a
  request with `Referer: .../pedido/SECRET`; assert `SECRET` absent from
  `docker logs`. Local only; cannot test against the VPS.
- Human post-merge checklist (in the PR body): merge this PR alone, after the
  others are deployed; on the VPS run
  `docker compose up -d --force-recreate
  caddy` (the bind-mounted file may be
  stale: `docker exec caddy cat
  /etc/caddy/Caddyfile`);
  `grep -E 'public/orders|pedido'` the old logs and rotate if any local config
  already logged tokens; confirm health.
- Not planned: a CI-level `caddy validate` job (local validate is a manual PR
  check); Caddy `request_body max_size`; web/Next/Sentry log changes (list in
  PR: already covered by `Referrer-Policy` and the api scrubber).

### D6 Codacy (#342)

- `.codacy.yml`: `exclude_paths: ["packages/db/prisma/migrations/**"]`. Not
  verifiable in-repo; verification happens on the next migration PR (the human
  already replied "Go ahead and PR!" on the issue). State the caveat in the PR
  and closing comment (Codacy UI settings can override the file).

### D7 next/image in vitest (#341)

- Global stub in `apps/web/vitest.setup.ts` (`React.createElement` or a `.tsx`
  sibling): `vi.mock("next/image", ...)` -> plain `<img>`; strip `fill`,
  `priority`, `unoptimized`, `placeholder`, `blurDataURL`; pass `src` unchanged
  (tests read `getAttribute("src")`; no test asserts `_next/image`/`srcset`; 24
  files import `next/image`). Run the full web suite before and after and name
  any pre-existing failure. Do not touch `next.config.ts`. Optional test
  asserting `cdn.biasmarket.com` in `images.remotePatterns`.

### D8 Landing "test" product (#356)

- Code: `product-search.service.ts`: when no `storeSlug` (marketplace-wide) add
  `images: { isEmpty: false }` (`Product.images` is `String[]`; if the Prisma
  client rejects it use `NOT: { images: { equals: [] } }`); the `where` is
  shared by count, findMany and the best-seller groupBy, so counts stay
  consistent. Also hides imageless products from the marketplace search page
  (default accepted). Store pages unchanged. No API/OpenAPI change.
- Data (human, NOT by agents): if @carlos is a test store, mark `isDemo` via the
  audit/remediation queries in
  `packages/db/scripts/2026-08-31-hide-test-stores.sql`; put the steps in the PR
  body.
- Tests: service unit test (imageless excluded without `storeSlug`, included
  with it); add a case to `product-search.e2e-spec.ts`.

### D9 Invite preconditions (#378)

- `requireOrderForToken` (`order-events.service.ts:~157`) selects no `payments`:
  do not change it; add a dedicated `loadForInvite` modelled on `loadForClaim`
  (`:~216`). In `recordInvite`, besides cancelled/claimed, silently drop (204,
  same response as a valid event: no information leak) when NOT
  `payments.some(countsTowardPaid)` (`common/payment-summary.ts:29`) or
  `paymentStatus === 'REJECTED'` (mirrors web `isInviteEligible`). "Never
  rejected" = current status.
- `RecordInviteEventDto.moment` already has `@IsOptional @IsIn(CLAIM_MOMENTS)`;
  no DTO change. Use a dedicated `loadForInvite` (like `loadForClaim`) instead
  of adding `payments` to `requireOrderForToken`, so receipt/proof callers do
  not load payments. Dedupe key `invite-clicked:${order.id}:${moment ?? ''}`
  (distinct from the SHOWN key); with `moment` undefined it matches any prior
  CLICKED, same as SHOWN today; document it.
- Dedupe `INVITE_CLICKED` per (order, moment) with the existing advisory-lock +
  findFirst technique, generalising the `INVITE_SHOWN` block. No migration.
- "Collapsed banner counts as shown": documentation only, in the PR body.
- Out of scope: PKCE/OIDC nonce, per-token throttles.
- Tests: service spec (ineligible states skip incl. rejected; rejected then a
  new counting payment once `paymentStatus` is no longer REJECTED -> eligible;
  two CLICKED same moment -> one row; different moments -> two);
  `public-orders.e2e-spec.ts` fixtures must have a counting payment.

### D10 Drop `buyerAccountId` from seller order responses (#379)

- Remove from `PUBLIC_ORDER_FIELDS` (`order.controller.ts:~109-113`; feeds
  `toOrderDto`, `toCheckoutOrderDto`, `pickPublicOrderFields`),
  `toOrderStatusDto` (`:~383`), `OrderResponseDto`
  (`order-response.dto.ts:~202`; `OrderDetail...` extends it),
  `OrderStatusResponseDto` (~379), `CheckoutOrderResponseDto`
  (`checkout-response.dto.ts:~50`). Re-grep `apps/mobile` and `apps/workers` for
  reads of the field (planner's grep found none; a `mobile` CI filter exists).
  Keep in internal row types (`order.controller.ts:~223,~267`,
  `checkout.controller.ts:~61`), the repository select
  (`order.repository.ts:~155-187`), customer-auth, order-events, create-order
  usecase, and `AddressResponseDto` (`metadata.ts` spot 2868).
- `toOrderDto` callers to cover with e2e assertions: seller orders,
  `customer-auth.controller.ts:~172` (buyer order detail),
  `stats.controller.ts:~70`, `customers.controller.ts:~70`,
  `assisted-orders.controller.ts:~125`.
- Regenerate `metadata.ts` (spots 1012, 1172, 1481), `openapi.json`, SDK (5
  generated interfaces, Address stays); remove the field from the 8 web test
  fixtures (`payments-page-client`, `orders-page-client`, `checkout-form`,
  `use-optimistic-status-change`, `order-detail-sheet`, `orders-table`,
  `order-status`, `assisted-order-section`). Stacked on D3 (same generated
  files).
- Tests: orders, assisted-create and checkout e2e assert the field is absent;
  old web tolerates absence (never read). `api/test/schema-assert.ts` reads
  Prisma directly and is unaffected.

### D11 Google login never auto-links by email (#377) + hint (#376) [human decision]

- Decision (human, 2026-10-29): never auto-link by email. `resolveGoogleAccount`
  (`customer-auth.service.ts:~348-410`) resolves by Google identity
  (`googleSub`) only; otherwise it creates a new Google-verified account. Remove
  the email-merge path, the `emailVerified` same-email `findMany`, the ambiguity
  409 (`buyer-google.controller.ts` still needs its `ambiguous` mapping only if
  still reachable; remove if dead). No migration. Probe first: is
  `BuyerAccount.email` unique or only indexed? (today an unverified same-email
  account already results in a second account, so creation must work); also
  check the claim flow (#271) still binds the order to the Google account.
- Schema facts (verified): `BuyerAccount.email` is `String?` and NOT unique
  (only `phone` and `googleSub` are `@unique`), so a second same-email account
  is creatable; login/forgot-password/resend are by phone, so there is no
  email-login ambiguity. Dead surface to remove: the
  `existing.googleSub`/`updateMany` "ya esta vinculada" ConflictExceptions in
  `resolveGoogleAccount` (~361-392), `GoogleLoginError` `'ambiguous'`
  (`buyer-google.controller.ts:~40`) and its Conflict catch (~230-232), the web
  login-error mapping and i18n key for it, and the comment at
  `customer-auth.service.ts:~211-218`. Known behavior to test and note in the
  PR: a signed-in Google account G checking out with a phone that belongs to
  account A (same email) puts the order on A, not G
  (`customer-account.service.ts:~138-146`, `phoneLessOwner` guard ~180-182).
- #376: only on the create path (never for a googleSub hit) do one `findFirst`
  (case-insensitive email, `select id`) for an existing same-email account; if
  found log with a `Logger` `{event:'google-link-skipped', buyerAccountId}` (id
  only, never email/phone). Web: static, translated hint next to the buyer
  Google sign-in / claim screen ("If you bought with your phone, sign in with
  your phone to see those orders"; es/en in `packages/i18n`). No API change, no
  resend-verification endpoint (deferred).
- Not in scope, recorded as follow-up candidates in `follow-up-issues.md`: bind
  the change-email token to the pending email, make the change-email clash check
  case-insensitive and aware of other accounts' `pendingEmail`, safe merge flow
  for same-email accounts.
- Dead-surface check: `rg "ambiguous|ya está vinculada" apps -g '!node_modules'`
  has no live reference to the removed paths.
- Tests: spec for (a) Google login with googleSub -> same account; (b) no
  googleSub + same-email verified account -> NEW account, old untouched; (c)
  same-email unverified -> new account + log; (d) claim flow binds to the Google
  account; (e) the checkout-created-account scenario from the issue does not
  link; web hint test. Update specs at `customer-auth.service.spec.ts` (~L113,
  344, 431-439) and the buyer-google controller spec/e2e.

### D12 Assisted-order idempotency (#336), simplest correct design

- Optional `Idempotency-Key` request header (UUID, `crypto.randomUUID()` per
  form mount; absent => behavior unchanged; present but not a UUID => 400).
- **CORS (blocking in round 2):** `apps/api/src/main.ts:~56-60` allows only
  `Content-Type, Authorization`; the browser preflight would reject the header
  and break every assisted-order create. Add `'Idempotency-Key'` to
  `allowedHeaders` in the API PR (with a test of the CORS config).
- **Deploy order => two PRs:** PR 12 = API only (header optional, CORS allows
  it, migration, usecase, filter); PR 13 = web only (sends the header, handles
  the replay), stacked on PR 12. The review session merges PR 12, waits for its
  deploy to finish, then rebases/merges PR 13. This removes the old-API/new-web
  preflight failure window.
- No OpenAPI change and no `@ApiHeader`: the header is read in the controller
  via `@Headers('idempotency-key')`. PR 12 therefore never regenerates the SDK.
- One additive migration: nullable `Order.idempotencyKey` +
  `@@unique([storeId, createdByUserId, idempotencyKey])` (creator column is
  `createdByUserId String?`, `onDelete: SetNull`; NULLs are distinct so existing
  rows and key-less requests are unaffected). A plain `CREATE UNIQUE INDEX`
  takes a brief SHARE lock on `"Order"` in the candidate phase (same as
  precedent `Order_accessTokenHash_key`, mostly-NULL column; no `CONCURRENTLY`,
  Prisma runs the file in a transaction); say so in the PR. Migration SQL must
  not contain `drop`/`alter column ... type` even in comments; timestamp after
  `20261028030000`.
- Flow: BEFORE the transaction (and before `lockAndValidate`/`reserveItems`,
  `create-assisted-order.usecase.ts:~54-83`), when a key is present do
  `findFirst({storeId, createdByUserId: userId, idempotencyKey})` (after
  `assertOwnership`); if found, answer the replay immediately (so a retry after
  the last unit sold still gets the replay, not a stock error, and no low-stock
  notification fires). Otherwise create inside the existing tx with the key;
  catch Prisma `P2002` OUTSIDE the tx (the tx rolled back, undoing stock) only
  for the true concurrent race: match defensively (`err.meta.target` may be a
  constraint name string, not an array, with Prisma 7 + adapter-pg; check it
  names `idempotencyKey`/the constraint, rethrow anything else; probe the real
  shape in the e2e; precedent `couriers.service.ts:~82`), then reload and answer
  the replay. A concurrent duplicate may instead fail first on the product row
  lock/stock; the race test asserts exactly one Order with that key exists
  afterwards and that the loser got a 409 or a stock/lock error, never a second
  order. Verify `NotificationsService` passed into `reserveItems` writes through
  `tx`.
- Replay response: **409** with a typed exception
  `DuplicateIdempotencyKeyException` and a branch in `AllExceptionsFilter`
  (`all-exceptions.filter.ts:~44-49` precedent:
  `DuplicateOperationCodeException`) returning
  `{statusCode, code:'IDEMPOTENT_REPLAY', orderId, message}` (the precedent
  returns only `{code, orderId}`; the filter spec pins the new shape); the plain
  filter would drop extra fields. No link (the raw token is not recoverable; the
  seller's "regenerate link" action stays the path), no token rotation, no
  request fingerprint (non-goals). Update the filter spec.
- Web (PR 13): the generated client cannot surface the body: `customFetch` in
  `packages/types/http.ts` throws `ApiError(message, status)` and discards the
  parsed body. Decision: follow the precedent in
  `apps/web/features/orders/api/orders.api.ts:~78-90` (raw `fetch` reading
  `data.code`/`data.orderId` for `DUPLICATE_OPERATION_CODE`): create the
  assisted order through a small raw-fetch function in
  `features/assisted-orders/api/` that sends `Idempotency-Key` and parses the
  409 body; web-only, no `packages/types` change. Fallback if impractical: put
  the order id in the 409 `message` and parse it.
  `assisted-order-form.tsx:~346-351,~392` swallows the error today. Add a branch
  for the replay code: show the message plus a link to the existing order (no
  auto-navigation), modelled on the `DuplicateOperationCodeError` dialog flow
  around `orders.api.ts:~78-90`. `features/assisted-orders/api/` is a new
  directory. Keep the key stable across retries of the same mount; regenerate it
  after success (`onCreated`) and after any edit of the form values, otherwise a
  corrected resubmit would get a 409 for the old order. Test both.
- Tests: unit (fake Prisma): key validation, replay pre-check, P2002 -> replay
  mapping, ownership scoping (store + user), filter branch, CORS config; e2e
  only (real DB): N>=5 rounds, each with a fresh key and `Promise.all` of two
  requests, assert DB counts (exactly one Order with that key and one stock
  reservation) and that no second order appears; other user/store same key is
  independent; missing key unchanged; sequential replay returns 409 even with
  insufficient remaining stock; web mutation tests. Model on
  `checkout-customer-race.e2e-spec.ts` (reuse its `signUp`/`seedStore` helpers
  or move them to a shared helper). Unit specs cannot exercise unique violations
  (the `@biasmarket/db` alias is a fake): say so in the spec comments.

### D13 Epic #255 follow-ups (#380)

Do (each with a test): (a) `ReceiptConfirmedResponseDto` is already the
controller return type; make `order-events.service.ts:~322` return it too (no
other change); (b) add `ambiguous_email`/`google_linked` to
`ClaimOrderError`/`ClaimFailureCode` (`customer-auth.service.ts:~30`), map in
the callback `buyer-google.controller.ts:
~236-256`, add copy under
`storefront.myPurchases.claimErrors` es/en, extend the closed `KNOWN` list in
`claim-error-banner.tsx`; note that after D11 the ConflictExceptions may be
unreachable: if so skip (b) and say why; (c)
`buyer-purchases/components/my-purchase-order.tsx:~33-45` shows a login prompt
on 401 instead of `notFound` (probe the error shape of the generated
customFetch); (d) `encodeURIComponent(orderId)` in
`buyer-purchases/queries/use-global-account.ts:~35`; (e) `publicApiBase()`
(`public-order/lib/shipping-links.ts:30`) gets the dev localhost fallback used
by `lib/api-client.ts:40-47`; (f) `public-order/lib/receipt.ts:14` mirrors the
API allow-list (`IN_TRANSIT|READY|COMPLETED`) via a shared constant; (g) typed
return instead of the cast at `global-account.controller.ts:~74`, export
`OriginLabel` from the `buyer-purchases` barrel and fix the two deep imports
(`account-order-card.tsx:5`, `account-order-detail.tsx:24`); (h)
`assisted-orders/components/buyer-notice-prompt.tsx:~54` shows a hint when the
template fetch errors; (i) `notifications/components/notification-row.tsx:~60`
guards `t.has("types.<type>")` with a generic fallback. Test files to extend or
add: (a) `order-events.service.spec.ts`; (b)
`buyer-google.controller.spec.ts:~212-221` + `claim-error-banner.test.tsx`; (c)
`my-purchase-order.test.tsx`; (d) a `use-global-account` test; (e)
`shipping-links` tests; (f) a `public-order/lib/receipt` test; (g) typecheck +
barrel import check; (h) `buyer-notice-prompt.test.tsx`; (i) a
`notification-row` test. Do NOT do: seller release-claim endpoint + claim
notification (feature, L) and the manual device checks (iOS Safari/Android
cookie hand-off, 360px, Safari private mode). The implementer writes
`follow-up-issues.md` (drafts for those two issues plus the D11 candidates); the
review session creates them and closes #380. Probe whether (a)/(g) change
OpenAPI; if so stack this PR on PR 10 and regenerate. PR 14 and PR 8 both touch
`customer-auth.service.ts` and `storefront.json` (expected trivial conflicts;
the review session rebases the later one). If time runs out, unfinished items
move into `follow-up-issues.md` and the PR body lists them.

## 3. Non-goals

Orval 8.43 upgrade; items max on checkout; Caddy body-size cap;
resend-verification; re-auth/merge flow; request-hash idempotency; token
rotation on replay; PKCE/OIDC nonce; change-email token binding (follow-up
candidate); retrofitting DDD; any production data change; any deploy or VPS
action.

## 4. PR stack (priority order = open order = merge order)

Tier A (cheap, independent): 1-6. Tier B: 7-10. Tier C: 11-14. **Checkpoint:**
after Tier B write a progress line in `implementation-log.md` and decide whether
Tier C fits; if not, stop and report. Cut order inside Tier C: 14 first, then 13
(PR 12 alone is safe but #336 stays open and the web never sends the key; report
it as pending), then 11. PR 11 does not count toward completion. **SDK rule:**
every PR that regenerates `openapi.json`/the SDK is stacked on PR 1 (on `main`
before PR 1 the lockfile's orval 8.43 would churn 33 files). Everything targets
`main` unless a base is given.

| #  | Branch                                | Base                                                                    | Issues        | Migration | SDK regen     |
| -- | ------------------------------------- | ----------------------------------------------------------------------- | ------------- | --------- | ------------- |
| 1  | `chore/pin-orval-sdk-drift`           | main                                                                    | #338 #375     | no        | none expected |
| 2  | `fix/checkout-upload-limits`          | main                                                                    | #391          | no        | no            |
| 3  | `chore/web-test-next-image`           | main                                                                    | #341          | no        | no            |
| 4  | `chore/codacy-exclude-migrations`     | main                                                                    | #342          | no        | no            |
| 5  | `refactor/order-ref-six-chars`        | main                                                                    | #339          | no        | no            |
| 6  | `fix/hide-imageless-products-home`    | main                                                                    | #356          | no        | no            |
| 7  | `fix/invite-server-preconditions`     | main                                                                    | #378          | no        | no            |
| 8  | `security/google-login-no-email-link` | main                                                                    | #377 #376     | no        | no            |
| 9  | `fix/product-image-cap-dto`           | `chore/pin-orval-sdk-drift`                                             | #335          | no        | yes           |
| 10 | `chore/drop-buyer-account-id-seller`  | `fix/product-image-cap-dto`                                             | #379          | no        | yes           |
| 11 | `fix/caddy-redact-token-logs`         | main                                                                    | #340          | no        | no            |
| 12 | `feat/assisted-order-idempotency-api` | main                                                                    | #336 (API)    | yes (one) | no            |
| 13 | `feat/assisted-order-idempotency-web` | `feat/assisted-order-idempotency-api`                                   | #336 (web)    | no        | no            |
| 14 | `chore/epic-255-followups`            | main, or `chore/drop-buyer-account-id-seller` if it regenerates the SDK | #380 (subset) | no        | maybe         |

PR bodies: repo PR format, `Closes #N` (PR 12: `Refs #336`; PR 13:
`Closes #336`; PR 14: `Refs #380`). PR 11 is opened as a **draft**, uses
`Refs #340`, and is neither merged nor closed by the review session (human
checklist; branch protection does not require approvals, so this is a convention
the handoffs must state), attribution line from the session system reminder.
Stacked PRs 9/10 and 12/13: note in the body that the base is the previous
branch and that after a squash merge they must be rebased with
`git rebase --onto origin/main <old-base-tip> <branch>` (the review session does
it). Rebase direction: after PR 10 merges, the review session rebases PR 12
(targets `main`) onto `main`; likewise for any PR overlapping a merged one.
Files overlapping among "independent" PRs: 5 vs 14 (web order files), 8 vs 14
(customer-auth), 10 vs 12 (`assisted-orders.controller.ts`, e2e, create
usecase).

## 5. Sequenced steps and completion signals

Per PR: branch from base -> failing test first where applicable -> implement ->
run the scoped commands (section 7) -> `pnpm fix` -> commit -> push -> open PR
-> append number + results to `implementation-log.md`. Completion signal per
tier: every PR in the tier is open, local verification passed (or CI-only items
labelled), PR numbers recorded. Final signal: tiers done as far as the session
allows; unfinished PRs listed in `implementation-log.md` with the reason;
`follow-up-issues.md` exists; the PR list in `review-handoff-prompt.md` is
filled in. Stop and report rather than skipping verification.

## 6. Test strategy

Unit/service specs (the vitest alias fakes `@biasmarket/db`; they cover branches
only) plus e2e on the real AppModule for locks/unique violations, tenant data
and SDK-visible responses (#336, #378, #379, #335, #377). Web component/hook
tests for UI. #340 via `caddy validate` + curl against `docker logs`. Drift
script run clean (pass) and with a touched generated file (fail).
Security/tenant: #336 lookups scoped by `storeId` and `userId` after
`assertOwnership`; #377 spec for the checkout-created-account scenario; #379
absence assertions; #378 ineligible orders create no rows.

## 7. Verification commands (planned; none run in the plan session)

- Per package: `pnpm turbo run lint typecheck test:cov --filter=<pkg>` (CI uses
  `test:cov`; floors live in the vitest configs: api 75/73/67/75, web
  48/46/43/48, utils 88/74/92/89, types lines 79). Build utils first when
  touching it.
- API e2e: needs Postgres, Redis, MinIO, workers and a build; run
  `scripts/ci/e2e.sh` locally if Docker is available, otherwise label the e2e
  specs "CI-verified only" in the PR.
- SDK:
  `pnpm --filter api generate:openapi && pnpm --filter @biasmarket/types
  generate`
  then `git diff --exit-code`; `bash scripts/ci/check-types-sdk-drift.sh`;
  `bash scripts/ci/check-openapi-drift.sh` (needs the e2e env vars from
  `scripts/ci/e2e.env.example` and `pnpm turbo run build --filter=api` first;
  probe: ~1.3s after that).
- `pnpm check:workspaces`, `shellcheck scripts/ci/*.sh`, `pnpm fix`.
- Migration PR: `bash scripts/ci/check-destructive-migrations.sh` and run the
  old release's INSERT shape (without the new column) against the new schema.

## 8. Risks

- Blue/green: PR 12's migration is additive and nullable; old release ignores
  the column. Keep it in its own deploy.
- #377 behavior change: buyers with a phone account who sign in with Google get
  a new empty account (hint + log); accepted by the human.
- #339 changes buyer-visible `#XXXX` to `#XXXXXX`.
- Stacked PRs 9/10 need `rebase --onto` after squash merges; a base change does
  not rerun CI, the force-push does; never merge on a stale green.
- #340 touches the production proxy and may not reach the running container;
  merge alone, human checklist.
- Rapid merges: `ci.yml` cancels earlier runs, so the last SHA carries all
  deploys; group merges and let each deploy finish.
- Red `hygiene`/coverage on `main` blocks CD.
- PII: #376 logs ids only; #340 adds access logs with IPs (disclosed).

## 9. Acceptance criteria

1. `pnpm --filter @biasmarket/types generate` leaves `git status` clean; the
   drift script passes on the PR and fails after editing a generated file; the
   lockfile diff touches only orval entries (#338 #375).
2. A 20-item multipart checkout with proof passes; 6 MB -> 413; 1000 fields ->
   400 (#391).
3. POST/PATCH product with 7 images -> 400 (e2e) (#335).
4. One `orderRef`; the acceptance grep (D4) has no 4-char order-ref hits; panel,
   buyer page and WhatsApp show the same code (#339).
5. `caddy validate` passes; local curl check leaves no `SECRET` in `docker logs`
   (uri, query, Referer variants); docs updated; image pinned only if the human
   supplied a tag (#340).
6. `.codacy.yml` present with the migrations exclude (#342).
7. Full `pnpm --filter web test` green (#341).
8. Marketplace search/home never returns an imageless product; store pages
   unchanged; service test + e2e case (#356).
9. `recordInvite` creates no row for ineligible orders; two CLICKED same moment
   -> one row (#378).
10. Seller/assisted responses and OpenAPI contain no `buyerAccountId` (5
    interfaces); e2e asserts absence (#379).
11. Google login never merges into a same-email account; the issue's
    checkout-created-account scenario is a test; skip is logged with ids only;
    hint shown (#377 #376).
12. Two concurrent same-key requests -> exactly one Order and one reservation,
    the other gets 409; DB-count assertions over >= 5 rounds (#336).
13. Each implemented #380 item has a named test; unimplemented items are listed
    in `follow-up-issues.md` (#380).
14. Per PR: CI green; the changed-file list
    (`git diff --name-only <base>...HEAD`) is reviewed against that PR's section
    of this plan (tests and generated outputs allowed); Prettier clean.

## 10. Decisions

Answered by the human: #377 = never auto-link by email. Defaults used without
waiting (the session proceeds on them; override by editing this plan): #356
imageless products hidden marketplace-wide, @carlos data step is a human task;
#378 "never rejected" = current status; #336 replay = 409 without link; #380
split off release-claim + manual checks into two new issues; #339 = 6 chars;
#338 = pin 8.23.0; #340 = add redacted access logs, PR 11 stays a draft for a
human to merge.
