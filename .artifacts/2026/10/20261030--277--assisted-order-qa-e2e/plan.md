# Plan: #277 F1 — assisted-order QA end to end (CI-only)

Status: draft v3 (rounds 1–2 applied; round 3 pending). See `review-log.md`.
Ticket: #277 (child of epic #256). Date: 2026-10-30. Written for: the
implementer of a fresh session.

## 1. Context and outcome

#277 asks for a Playwright golden path, payment/edge-case coverage, invitation
and timeline checks, manual in-app-browser checks, and a pilot with 5–10 real
KoreaLexa orders.

**Scope decision from the user:** there are no users yet. Everything must be
unit tests, e2e tests, or other checks that run in CI.

| #277 item                                                                                                      | Disposition                                                                                               |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Playwright golden path (create → open → proof → validate → advance → receipt → Google claim, Google simulated) | **In scope**: one web golden path + one API HTTP chain                                                    |
| Both payment paths                                                                                             | **In scope**: two short web tests (buyer proof, seller-registered); rest in API e2e                       |
| Payment cases, edge cases, invitations, G1 notices, timeline, other-device                                     | **API e2e is authoritative** (fill gaps). Web gets 1–3 render checks per area, not a re-run of every case |
| Links from WhatsApp / Instagram / Twitter on a phone                                                           | **Replaced** by UA-emulation tests of the detection branch. Real-phone check stays undone                 |
| Google inside in-app browsers                                                                                  | UI-only: fallback note shows, Google navigation never starts, order stays usable                          |
| DoD: Spanish UI, mobile, store isolation, no sensitive data                                                    | axe at mobile-375 on two buyer/seller screens; API allow-list + second-seller asserts; one web negative   |
| Pilot with real KoreaLexa orders; issues from the pilot                                                        | **Out of scope.** PRs say `Refs #277`, never `Closes`. #277 stays open                                    |

Success = green `Web E2E (a11y)` and `E2E (API)` CI runs where every automatable
criterion maps to a named test (§7), and the "not covered" list in §7 is honest.

### What already shipped (facts, verified 2026-10-30)

All dependency issues (#265, #266, #269, #270, #279, #272, #274, #273, #275,
#276) are CLOSED/merged. Local `main` is behind `origin/main` (623c61fc):
`git pull` first.

API e2e (`apps/api/test`; some verdicts title-based — **verify by reading the
assertions before relying on a row**):

- Covered: repeated operation code (`seller-payments.e2e-spec.ts:257`),
  validating an uploaded proof (`:402`), invalid phone (`assisted-orders:253`),
  duplicate phone/store (`:352`), phone corrected before open
  (`assisted-order-links:266`), regenerated/revoked (`:171`,
  `public-orders:190`), no stock (`assisted-orders:309`), invitations
  (`public-orders:246/:287/:502`), claim + other device (`buyer-claim:228`), G1
  notices (`assisted-orders:657`), timeline gating (`public-orders:449`),
  isolation + DTO leaks (many).
- **Gaps to fill:** chained HTTP golden path incl. seller fulfillment advance
  (today `public-orders.e2e-spec.ts:346-351` sets `IN_TRANSIT` via Prisma); void
  endpoint e2e; PARTIALLY_PAID on an assisted order; phone with spaces at
  create; public view of a store with no payment methods; public view of an
  expired order via the real expiry sweep; receipt-confirmation invite moment.
  (Dropped: "server behavior after dismiss" — dismissal is client-side
  localStorage, nothing server-side to test.)

Web e2e (`apps/web/e2e`): only unauthenticated a11y/responsive specs. No login,
no `storageState`, no dashboard or `pedido` coverage (`smoke.spec.ts:5-8`).

## 2. Current behavior relevant to design (facts)

- `scripts/ci/web-e2e.sh`: PG/Redis/MinIO, `migrate deploy`, build api+web with
  `NEXT_PUBLIC_API_URL=http://localhost:3000` (baked at build), `seed:base`, API
  on :3000 with `WEB_URL=http://127.0.0.1:3001`, web on :3001
  (`INTERNAL_API_URL` localhost:3000), then `playwright test`. No `GOOGLE_*`.
  Job timeout 25 min (`ci.yml:1254`). API env comes from `e2e.env.example`
  (`NODE_ENV=test`, `BETTER_AUTH_URL` localhost:3000,
  `INTERNAL_JOBS_SECRET=e2e-internal-jobs-secret`). **Do not add `GOOGLE_*` to
  `e2e.env.example`** (it feeds the API e2e job).
- Seed: seller1 `seed-seller1@biasmarket.dev` / `seedpassword123`
  (`helpers.ts:25`), slug `demo-tienda-de-camila` (`isPublic:false`, reachable),
  YAPE/PLIN/TRANSFER/CASH on, 3 pickup points. Seller2 `demo-kpop-corner`,
  TRANSFER with `depositPercent: 20`. better-auth rate limit 3 req/10 s on
  sign-in (`auth.config.ts:170-185`): log in once per run.
- Seller UI strings (verified in i18n): "Nuevo pedido", form ids
  `assisted-phone`…, "Crear pedido", created screen shows the link as **text,
  not an anchor** ("Enlace privado del comprador"), detail sheet via
  `/orders?order=<id>` with "Regenerar enlace", "Corregir número", "Avisar al
  comprador"/"Ahora no".
- Buyer page `/es/store/[slug]/pedido/[token]`; only test id
  `public-order-invalid`. Strings: "Pedido no encontrado", "Ya lo recibí", "Tu
  pago está validado", "Guardar con Google", "Ábrelo en tu navegador", "Copiar
  enlace".
- Claim: `ClaimOrderButton` POSTs `claim-ticket` (OriginGuard + JSON; sets
  httpOnly `SameSite=Lax` `bm_claim` on the API host; 10/min), then
  `window.location.assign(<api>/api/account/google?claim=1&locale=es)` (10/min,
  sets `bm_buyer_google_state`, path `/api/account/google`) →
  `accounts.google.com` → callback `<api>/api/account/google/callback` (10/min)
  → server-side `fetch('https://oauth2.googleapis.com/token')`
  (`buyer-google-oauth.ts:140`, default arg `fetchImpl = fetch`, resolved at
  call time) → redirect `/es/my-purchases/orders/:id?claimed=1`. The id_token is
  claims-checked only: `iss` in Google set, `aud === GOOGLE_CLIENT_ID`, `exp`
  (seconds, future), `sub`, `email`, `email_verified` true. No nonce in the
  token. The auth URL's `redirect_uri` is built from `BETTER_AUTH_URL` and is
  not validated on return.
- Detection list (`lib/in-app-browser.ts`): Instagram, FB*, Twitter, TikTok,
  Line, Snapchat, WeChat. **WhatsApp is absent.**
- Invites: `dismissDays = 7`; key `bm-invite:{slug}:{orderNumber}:dismissedAt`
  (ms timestamp); moments entrega > pago_validado > banner >
  adelanto_linea_de_tiempo.
- Routes: `PATCH :orderId/fulfillment`, `/payments/:id/review`,
  `/payments/:id/void`, `POST :orderId/payments`, `PATCH :orderId/cancel`
  (order.controller); `POST assisted`, `access-link`, `PATCH buyer-phone`,
  `POST buyer-notices` (assisted-orders.controller). Public: `GET :token`,
  `POST :token/{events,receipt,payments,claim-ticket}`. Expiry:
  `POST /internal/orders/expire-sweep` (outside `/api`, header
  `INTERNAL_JOBS_SECRET_HEADER` = `INTERNAL_JOBS_SECRET`, 5/min) and it only
  cancels orders whose `expiresAt` is past.
- The proof fixture `payment-proof-fixture.png` is only a MinIO object
  (`minio-e2e.sh:59-60` copies `apps/web/public/og-image.png`): upload
  `apps/web/public/og-image.png` or add a small PNG under
  `apps/web/e2e/fixtures/`.
- CI: `pull_request` has no branch filter → stacked PRs get CI, but
  `web-e2e`/`e2e` run only when the PR touches their path filters.

## 3. Proposed design

### 3.1 Two layers

1. **API e2e (vitest, real AppModule)**: authoritative for state machine,
   payments, expiry, DTO leaks, isolation.
2. **Web e2e (Playwright, built web + real API + DB)**: user-visible journeys in
   Spanish at 375 px. Assert what the user sees; do not re-prove API rules.

### 3.2 Step 0: one host for the whole CI stack (PR-B first commit)

Facts: the dashboard auth gate is client-side (`useRequireAuth`/`useSession`),
and the browser calls better-auth at `NEXT_PUBLIC_API_URL`
(`apps/web/lib/auth-client.ts:5`, baked at build = `http://localhost:3000`) from
a page on `127.0.0.1:3001`. That is cross-site, and better-auth/`bm_claim`
cookies are `SameSite=Lax` (no override in `auth.config.ts`), so they are not
sent. A storageState minted against `localhost:3000` is equally unusable from a
`127.0.0.1` page. (Analysis, not observed: no spec has ever logged in.)

**Decision (not conditional):** move the whole stack to one host, default
`127.0.0.1`: `NEXT_PUBLIC_API_URL` (build step **and** `next start` step),
`INTERNAL_API_URL`, `BETTER_AUTH_URL`, `WEB_URL`, health URLs, and
`trustedOrigins` (derived from `WEB_URL`; the comment at `web-e2e.sh:22-23`
explains why `127.0.0.1`). Fallback: everything on `localhost` if better-auth
objects. Cookie names have no `__Secure-` prefix (http). Only after the host is
chosen write `auth.setup.ts` against that API base. Verify with: UI login at
`/es/login` then a dashboard page load; then claim-ticket cookie present via
`context.cookies(<api url>)`. Existing a11y specs must stay green. Record the
outcome in the PR description. If a production-code fix turns out to be needed,
**stop and ask**. Add the spike's touched paths to the `web_e2e` filter so the
spike itself runs in CI.

### 3.3 Web plumbing

- `playwright.config.ts`: add `setup` (explicit `testMatch: /auth\.setup\.ts/`)
  and `flows` projects. Declaration order is a convenience only; correctness
  never depends on flows running before or after the a11y projects (each owns
  its state), and `--project=mobile-375` alone must keep working (a11y projects
  do not depend on `setup`). `flows`: viewport 375×812,
  `dependencies:['setup']`, `testMatch: /flows\/.*\.spec\.ts/`, `retries: 0`
  (flows create non-idempotent data), `timeout: 120_000`,
  `use.reducedMotion: 'reduce'`, `trace: 'retain-on-failure'` (see §8 on
  artifact exposure). The three a11y projects get `testIgnore: [/flows\//]`
  (default `testMatch` already skips `auth.setup.ts` and helpers). Top-level
  `globalTimeout` of ~20 min so a slow run fails with a report instead of being
  cancelled. Invariant to state in PR-B: install+build+migrate+seed budget +
  `globalTimeout`
  - 5 min ≤ job `timeout-minutes` (35); record per-phase durations and fix the
    stale "25" comment near `ci.yml:1254`.
- `auth.setup.ts`: log in once as seed-seller1 (own constants, copied from
  `apps/api/scripts/seed/helpers.ts:25`/`fixtures.ts:200`; assert login success
  so seed drift fails loudly) via the API request context
  (`POST <api>/api/auth/sign-in/email` with `Origin` = web URL, on the chosen
  host) and save `e2e/.auth/seller.json` (gitignored, anchored `/e2e/.auth/`;
  confirm with `git check-ignore -v`; keep it outside `outputDir`). If that
  state isn't accepted by the dashboard, use the UI form. `setup` gets
  `retries: 1` and must not sign in twice inside the 3/10 s limit. Also warm the
  routes used by flows.
- Helpers under `apps/web/e2e/flows/helpers/`: `phones.ts` (unique number from
  `workerIndex`, `retry`, `Date.now()`, random suffix), `seller-api.ts` (create
  throwaway store/product via the seller API using the stored session),
  `assisted-order.ts` (UI create + read link text), `pace.ts` (rate-limit
  pacing, §8, only if needed), `google.ts`. **Helpers must not import
  `@biasmarket/db`/Prisma**: seed via the seller API only (hard rule: web never
  talks to Postgres). (ESLint rule only if trivial.)
- `seller-api.ts` contract (verified): `POST /stores` needs `name`, `slug`,
  `whatsappNumber` (min 6), has no per-user cap/verification; it creates PICKUP
  delivery and YAPE/PLIN/TRANSFER/CASH enabled with `details: {}` and no pickup
  points (PICKUP assisted orders work without a pickup point,
  `order-creation.core.ts:156-163`; `isPublic` defaults true). The helper then
  `POST /stores/:id/payment-config` to give TRANSFER (and YAPE) an alias/number
  (and a deposit % for advance cases) and `POST /products` (price, stock;
  published). A "no payment methods" variant disables them all (PR-A). Assert in
  the golden path that "Guardar con Google" is enabled before clicking (the
  `unavailable` state hides/disables it when the API lacks `GOOGLE_*`).
- Test data: each test creates its own throwaway store + products via the seller
  API (slug from a run id), never mutating seeded stores or consuming the seed
  Lightstick stock. Rows are located by their generated phone/order number,
  never by position or count.

### 3.4 Simulating Google (no production code change)

- `scripts/ci/google-stub.mjs`: Node preload loaded only on the API exec line in
  `web-e2e.sh`
  (`E2E_GOOGLE_STUB=1 NODE_OPTIONS="--import <abs path>" node
  apps/api/dist/main.js`;
  not on build/pnpm). It no-ops unless `E2E_GOOGLE_STUB=1`. It wraps
  `globalThis.fetch`: POST to `https://oauth2.googleapis.com/token` returns
  `{id_token}` (unsigned JWT) with `iss=https://accounts.google.com`,
  `aud=process.env.GOOGLE_CLIENT_ID`, `exp` in seconds (+1 h), `sub`/`email`
  derived from the form `code` (`e2e-<runid>-<n>` →
  `e2e-<runid>-<n>@example.test`), `email_verified:true`. Everything else passes
  through. Fake env (set in `web-e2e.sh` on the API process only):
  `GOOGLE_CLIENT_ID=e2e-fake-client-id.invalid`,
  `GOOGLE_CLIENT_SECRET=e2e-fake-secret.invalid`. This also enables the seller
  Google provider in the ephemeral CI stack; the stub answers only token
  requests whose `code` starts with `e2e-`, everything else passes through.
- Playwright: `page.route('https://accounts.google.com/**')` fulfills with 302
  to
  `<API base used by the browser>/api/account/google/callback?code=<unique>&state=<state
  from the intercepted URL>`.
  **Take only `state`; build the host from the e2e API base — never reuse the
  intercepted `redirect_uri`/host** (the state cookie lives on the API host).
- The golden path must assert the real outcome: final URL
  `/my-purchases/orders/<id>?claimed=1`; the seller detail shows "Reclamado";
  the `bm_claim` cookie is cleared (read via `context.cookies(<api url>)`, not
  the web URL). A stub-only self-test is not enough.
- Wiring checks: add `scripts/ci/google-stub.mjs` and the OAuth/auth source dirs
  (`apps/api/src/modules/customer-auth/**`, `apps/api/src/auth/**`) to the
  `web_e2e` filter so stub drift is caught on the PR that causes it (not
  `api_e2e`); lint coverage for the `.mjs` (neither `shellcheck` nor the web
  ESLint config covers `scripts/ci/*.mjs`): add `node --check` plus a tiny
  `node:test` self-test to Hygiene following the existing
  `check-workspace-scripts.test.mjs` pattern; add a Hygiene guard
  `! git grep -n "google-stub\|E2E_GOOGLE_STUB" -- . ':!scripts/ci' ':!apps/web/e2e' ':!docs' ':!.github/workflows/ci.yml' ':!.artifacts'`
  (deploy workflows stay scanned; run it locally before pushing; repo has no
  Dockerfiles) plus a second guard that `GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET`
  do not appear in `scripts/ci/e2e.env.example`. Hygiene steps go after "Guard
  script tests" and before "Install actionlint" (`ci.yml` ~1102, 5-min job):
  `node --check scripts/ci/google-stub.mjs`,
  `node --test
  scripts/ci/google-stub.test.mjs` (includes: non-Google URL
  passes through unchanged; no-op without `E2E_GOOGLE_STUB=1`), then the greps.
  Env is added to the existing `exec env PORT=3000 WEB_URL=… node …` line in
  `web-e2e.sh` (define the run id with a default; `set -u` is on).

### 3.5 In-app browsers

Parametrized `test.use({userAgent})` for Instagram, Twitter, Facebook (+ a
`[characterization]` WhatsApp test: Google button _is_ shown today; Android/iOS
WhatsApp open real browsers). Per UA assert: an order-specific value (generated
order number and total) is visible; "Ábrelo en tu navegador" note shown; no
request to `/api/account/google` is made; "Copiar enlace" writes the exact
private URL (grant `clipboard-read/write`, read back via
`navigator.clipboard.readText()`); proof upload section still visible. State in
the traceability table that this covers the detection branch only, not real
in-app engines.

### 3.6 Non-goals

No production code, schema or migration change. No real Google. No pilot, no F2
metrics, no mobile app, no load tests, no test-only API endpoints, no
`page.clock` (use `addInitScript` to seed localStorage).

## 4. Files

Add: `scripts/ci/google-stub.mjs` (+ Hygiene self-test);
`apps/web/e2e/auth.setup.ts`;
`apps/web/e2e/flows/{golden-path,edge-cases,in-app-browsers,invitations}.spec.ts`;
`apps/web/e2e/flows/helpers/*`; `apps/web/e2e/fixtures/*` if needed;
`apps/api/test/assisted-order-journey.e2e-spec.ts`. Change:
`apps/web/playwright.config.ts`; `scripts/ci/web-e2e.sh`;
`.github/workflows/ci.yml` (`web_e2e` filter, timeout → 35 min, Hygiene steps);
`apps/web/.gitignore` (`/e2e/.auth/`); `docs/core/ci.md` (add a Web E2E section:
it has none today; keep the job name `Web E2E (a11y)` to avoid touching
`check-ci-success.sh`); existing API specs only extended. No
openapi/`packages/types` regeneration.

## 5. PR stack (3 PRs)

**PR-A `test/f1-api-e2e-gaps`** — base `main`, independent.

- New `assisted-order-journey.e2e-spec.ts`: HTTP chain create → open → proof
  upload → approve → `PATCH fulfillment` IN_TRANSIT → READY → COMPLETED →
  receipt → claim (stub identity like `buyer-claim.e2e-spec.ts:233`) → other
  device read; asserts timeline summary (unclaimed) vs full (claimed) and that
  `buyer-notices` never changes the token.
- Extra `it`s: void endpoint; PARTIALLY_PAID; phone `987 654 321` /
  `+51 987 654 321` normalized at create; public view of a store with no payment
  methods; expired order: backdate `expiresAt` via Prisma, call `expire-sweep`
  **once per file** with `INTERNAL_JOBS_SECRET_HEADER`, then public GET;
  receipt-confirmation invite moment; second seller gets **403** using another
  store's `storeId` (as `assisted-orders:278,710` already assert) and **404**
  using own `storeId` with the other store's `orderId` (new assertion); public
  DTO has no seller email/other buyers' phones.
- Sign in once per file (better-auth 3/10 s); unique phone per `it`.
- Unit: add phone spacing/`+51` cases to `packages/utils/src/phone-country`
  tests only if absent (check first).
- Verify: `pnpm --filter api test:e2e` (via `scripts/ci/e2e.sh` stack),
  `pnpm --filter api test`, typecheck, lint. Must not change `apps/api/src`.

**PR-B `test/f1-web-foundation-golden-path`** — base `main` (not PR-A).

- Spike (§3.2), config, setup, helpers, stub + `web-e2e.sh`, ci.yml, docs.
- `golden-path.spec.ts`: (1) full path with **buyer proof**: seller creates
  order → reads link text → buyer context uploads proof → seller approves →
  advances fulfillment → buyer "Ya lo recibí" → "Guardar con Google" (stub) →
  assertions in §3.4. (2) **seller-registered payment** path (shorter). axe
  (`critical|serious`) on created screen and buyer page.
- `edge-cases.spec.ts` (3 tests): invalid phone shows the Spanish error summary;
  regenerated link → old link "Pedido no encontrado" in a fresh context while
  the new link works; expired-order **render-only** check (take a real public
  GET response, mutate only status fields via `page.route`; real expiry is
  PR-A). Plus tenant negative: seller1 cannot open
  `/es/dashboard/demo-kpop-corner/orders`.
- Hard gate: baseline Web E2E duration recorded before and after; headroom ≥ 5
  min under the new 35 min timeout.
- Verify: `playwright test --list`; `bash scripts/ci/web-e2e.sh` or CI run;
  once, `--repeat-each=3 --workers=1 --project=flows` to prove no number/stock
  collisions (record in PR).

**PR-C `test/f1-web-invites-in-app`** — base PR-B.

- `invitations.spec.ts`: positive control then negatives (see §8): none before
  payment validated (then appears after approval: "Tu pago está validado");
  "Ahora no" writes the localStorage key and the DOM stays dismissed after
  reload; `addInitScript`-seeded `dismissedAt` of now−6d stays dismissed, now−8d
  shows the banner; `adelanto_linea_de_tiempo` after dismissal; delivery invite
  after receipt; none on a claimed order (reuses golden-path-style setup, kept
  to a single claim).
- `in-app-browsers.spec.ts` (§3.5). One G1 test: "Avisar al comprador" sends a
  notice and the link text read before/after is identical and the old link still
  loads in a second context. Claim error redirect: navigate directly to
  `/es/my-purchases?claim=already_claimed` and assert the message (no API
  calls).

## 6. Sequenced steps and completion signals

1. `git pull`; baseline `playwright test --list` and a green Web E2E; record
   duration. Signal: duration number in PR-B description.
2. PR-A and PR-B can proceed in parallel worktrees. PR-B step 1 = spike; signal:
   a UI login + dashboard load green in CI.
3. PR-B rest; signal: golden path green, `repeat-each=3` green.
4. PR-C; signal: green, request-budget table (§8) still holds.
5. `docs/core/ci.md` updated in PR-B.

## 7. Test strategy / traceability

Every row must cite exact `file:line` of the assertion in the PR description
(verified by reading it, not by title).

| #277 criterion                                                               | Layer                       | Where                                                                  |
| ---------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------- |
| Golden path                                                                  | web + API                   | `golden-path.spec.ts` (1); `assisted-order-journey`                    |
| Both payment paths                                                           | web + API                   | `golden-path.spec.ts` (1)(2); `seller-payments`, `public-proof-upload` |
| Repeated code / validate uploaded                                            | API                         | `seller-payments:257/:402`                                             |
| Advance / PARTIALLY_PAID, void                                               | API                         | PR-A new `it`s                                                         |
| Number formats, invalid, duplicate, corrected                                | API (+ web invalid message) | PR-A; existing `assisted-orders*`; `edge-cases`                        |
| Regenerated / revoked                                                        | API + web (regenerated)     | existing; `edge-cases`                                                 |
| No payment methods / no alias                                                | API                         | PR-A; unit `public-order.service.spec.ts:235,254`                      |
| No stock                                                                     | API                         | `assisted-orders:309`                                                  |
| Expired                                                                      | API real; web render-only   | PR-A; `edge-cases`                                                     |
| WhatsApp/IG/Twitter links                                                    | web UA emulation            | `in-app-browsers`                                                      |
| Google in in-app browsers                                                    | web, detection branch only  | `in-app-browsers`                                                      |
| Invitations                                                                  | web + API                   | `invitations`; `public-orders:246/:287/:502`; PR-A                     |
| Other device                                                                 | API + web                   | `buyer-claim:228`; `edge-cases`/golden path                            |
| G1 notices without token change                                              | API + web                   | `assisted-orders:657`; PR-C test                                       |
| Timeline summary vs full                                                     | API (+web golden path)      | `public-orders:449`; PR-A                                              |
| DoD ES + mobile                                                              | web                         | Spanish selectors + axe at 375                                         |
| DoD isolation (403 foreign storeId, 404 foreign orderId) / no sensitive data | API + 1 web negative        | PR-A; `edge-cases`                                                     |

**Not covered (state this in every PR description):** real Google; real phones
and real in-app browser engines; WhatsApp as a requirement (characterization
only); the KoreaLexa pilot and pilot issue triage; seller-side Google login; iOS
Safari same-site behavior; `INVITE_*` dedupe gaps already known.

## 8. Risks and edge cases

- **Rate limits** (one IP 127.0.0.1 for all browser contexts; the buyer page
  shell makes no API call, so SSR is not a source; in-memory throttler, 60 s
  windows, a 429 leaks into the next spec). Per-IP caps: `GET
  :token` 30,
  `events` 20, `receipt` 20, `payments` 10, `claim-ticket` 10,
  `GET account/google` 10, callback 10, `expire-sweep` 5, seller `addPayment` /
  packed photo 20 (plain ThrottlerGuard = per IP). Seller routes with user
  throttles are fine. Explicit `@Throttle` routes don't use the module default.
  Count the golden path's `GET :token` requests once with `page.on('request')`
  (expected 5–8) and record it in PR-B. Mitigation: `pace.ts` (keep only if that
  table exceeds ~70% of a cap; otherwise "one claim per spec + request table"
  suffices) counts requests per bucket from `page.on('request')` and waits for
  the window to roll when a test would exceed ~70% of a cap (explicit wait, no
  arbitrary sleep); claims happen in **one** test in PR-B and ≤1 in PR-C; each
  PR states a per-spec request budget table.
- **Retries:** flows run `retries:0`; every test is self-contained (own store,
  products, phone, Google code). Setup is the only retried step.
- **Absence assertions** always follow a positive control in the same test
  (invite appears in the legal state first) and a visible order-specific
  heading/value plus waiting on the specific GET response.
- **Runtime:** timeout 25 → 35 min up front; `globalTimeout`; golden path
  `timeout: 120_000`; first `next start` hits warmed in setup.
- **Artifacts:** CI uploads `apps/web/playwright-report` and `test-results`.
  Traces/screenshots can contain cookies, the seed password (`seedpassword123`),
  private link tokens and signed MinIO URLs. Acceptable **only** because all of
  it is disposable (ephemeral DB/MinIO, seed creds, 3-day retention). Keep
  `.auth/seller.json` out of the upload paths; no `trace:'on'`/`video:'on'`. Do
  not claim traces hold "only" synthetic numbers.
- **Stub drift:** if the OAuth code starts verifying signatures/JWKS the flows
  fail loudly; the stub header comment says how to update.
- **Seed drift:** preconditions asserted at the start of each test.
- **Stub leakage:** guard is solely `E2E_GOOGLE_STUB=1` (CI runs
  `NODE_ENV=test`, so a production check is moot); Hygiene grep guard (§3.4).
- **Rollback:** tests/CI/docs only; revert the PR. A flaky required job blocks
  `CI Success`: `test.fixme` + an issue rather than weakening assertions.

## 9. Acceptance criteria

1. `CI Success` green on the stack top and each PR's run shows `Web E2E` /
   `E2E (API)` **not skipped** where its paths changed.
2. `playwright test --list` count before/after in PR-B: the three original
   projects run exactly the original specs; `setup` + `flows` added.
3. Every row in §7 marked web/API has a named test with verified `file:line`.
4. Production code untouched (`apps/api/src`, `packages/db`, web app/features/
   components) unless the spike proves a fix is needed → stop and ask.
5. `google-stub.mjs` inert without `E2E_GOOGLE_STUB=1`; no `GOOGLE_*` in any env
   example or deploy file; Hygiene guard in place.
6. `docs/core/ci.md` gains a Web E2E/flows section.
7. `--repeat-each=3` on flows passes once (recorded in the PR, not enforced in
   CI); Web E2E has ≥5 min of headroom.
8. #277 stays open; PR descriptions use `Refs #277` and list the §7 "not
   covered".

## 10. Open questions (defaults)

1. Close #277? **No** (pilot + real-phone need users).
2. Add WhatsApp to the in-app list? **No change**; characterization test only.
3. Host for the CI stack? **Decided by the spike; default `127.0.0.1`
   everywhere.**
4. Throwaway store per test vs seed store2: **throwaway via seller API**
   (decided; no seed mutation).
