# Plan: #277 F1 — assisted-order QA end to end (CI-only)

Status: ready-with-caveats (v5; rounds 1–4 + readiness applied; see §11). See
`review-log.md`. Ticket: #277 (child of epic #256). Date: 2026-10-30. Written
for: the implementer of a fresh session.

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

### 2.1 UI flow facts the golden path must follow (verified in code, round 3)

- **Order of operations is forced by the UI.** The buyer proof form ("Sube tu
  comprobante") exists only while fulfillment is `ORDERING` (`canSubmitProof`).
  So: buyer uploads → seller approves → seller advances. After "Marcar En
  camino" the form is gone. The buyer page must be reloaded to see "Tu pago está
  validado", "¿Ya te llegó tu pedido?" / "Ya lo recibí", then "¡Gracias por
  confirmar!". Receipt needs exactly VERIFIED + not cancelled +
  IN_TRANSIT/READY/COMPLETED (`lib/receipt.ts`).
- **Buyer proof form** (`storefront.json` `publicOrder.upload`,
  `proof-upload-form.tsx`): `#proof-amount` ("Monto pagado (PEN)", pre-filled
  with the full balance — leave it), method select "Elige un método", "Número de
  operación (opcional)", file button "Elegir captura del pago", submit "Enviar
  comprobante", success "¡Listo! Recibimos tu comprobante…". JPEG/PNG ≤ 5 MB;
  `apps/web/public/og-image.png` is a 99,012-byte PNG (fine). The upload is a
  cross-origin `POST <api>/api/public/orders/:token/payments`,
  `credentials:
"omit"`; CORS takes a single origin, so API `WEB_URL` must
  equal the page origin exactly.
- **Seller approves a buyer proof** with the per-proof **"Aprobar"** inside the
  "Historial de pagos" container (`payment-history-list.tsx`; shown for
  `BUYER_SUBMITTED` + `PENDING_REVIEW`, next to "Rechazar"). A full-balance
  proof auto-advances the order to VERIFIED (`order.controller.ts:898-1010`).
  The sheet footer also has an order-level "Aprobar" (disabled while paid ≤ 0),
  so **scope the locator to the "Historial de pagos" container** (strict mode).
  Partial proofs end at PARTIALLY_PAID and then need the footer "Aprobar".
- **Seller advances fulfillment from the orders table row, not the detail
  sheet** (`order-detail-sheet.tsx:45` ignores `onAdvance`; `orders-table.tsx`
  ~205-219; only when `paymentStatus==="VERIFIED"`). Labels: "Marcar En camino",
  "Marcar Listo para entrega", "Marcar Completado" (`orders.markAs` +
  `fulfillmentLabels`). IN_TRANSIT/READY are optimistic with an **8 s undo
  window** (`use-optimistic-status-change.ts:12,68`): the PATCH fires after the
  timer, so the test must `waitForResponse(PATCH …/fulfillment)` before moving
  on; clicking again early schedules READY against a server still at ORDERING.
  COMPLETED opens "Confirmar cambio de estado" → "Sí, marcar". **The web golden
  path only needs IN_TRANSIT** (budget ~10 s); READY/COMPLETED are API e2e.
- **At 375 px the table row has no readable order identity** (`#`/customer cells
  are `hidden md:table-cell`; only the chevron `button` with
  `aria-label=<order
number>` carries it). Locate rows via
  `getByRole('button',{name:<number>})` or open the sheet directly with
  `/orders?order=<id>` (get `<id>` from the seller API list filtered by the
  generated phone).
- **Seller-registered payment** (detail sheet, heading "Registrar pago"):
  `#payment-amount` ("Monto pagado"), `#payment-date` ("Fecha del pago",
  required), method select (aria-label "Selecciona un método de pago"),
  operation code input (aria-label "Número de operación (opcional)"), file input
  (aria-label "Subir comprobante de pago"; required for non-CASH, optional for
  CASH), submit "Guardar pago", duplicate dialog "Registrar igual". Inputs are
  RHF-registered: use `fill`. Locked orders show "Este pedido no permite
  registrar más pagos."
- **Create form:** click "Crear pedido" exactly once (the UI sends an
  `Idempotency-Key`; a replay 409 loses the link text). Per store+seller at most
  5 distinct phones per 10 min (`enforceRecipientLimit`): keep ≤ 5 orders per
  throwaway store. Assisted creation has no plan/onboarding/flag gate.
- **Host move extras:** `BETTER_AUTH_URL` is placed in `GITHUB_ENV` by
  `load-e2e-env.sh`; override it **on the API exec line** (do not edit
  `e2e.env.example`). MinIO is unaffected (proofs stream through the API; `S3_*`
  stay at `127.0.0.1:9000`); `next.config.ts:16` `remotePatterns` only allows
  `localhost:9000`, so keep throwaway products **imageless**.
- Selectors for anything not listed here (login form ids, products form) are
  found in PR-B's first commit; use roles/labels, the only test id is
  `public-order-invalid`.

### 2.2 Web assertion rules from round 4 (these override looser wording elsewhere)

Everything in §2.1/§2.2 is read from code, not executed; the first PR-B commit
(spike) must confirm items marked ⚑ before the specs are written.

- **Cookies.** `bm_claim` is set and cleared with `path=/api/account/google`
  (`claim-ticket.ts` `CLAIM_TICKET_PATH`), so `context.cookies(<api origin>)`
  (path `/`) never returns it. Call `context.cookies()` **unfiltered** and
  filter by name+domain. Assert `bm_claim` present inside the
  `accounts.google.com` route handler (after the claim-ticket 204) and absent
  after the final page loads. The buyer session cookie is `bm_customer_session`
  (httpOnly, path `/`, host-only on the API host, `SameSite=Lax`); assert it
  exists after the claim. Both depend on the §3.2 single-host move. ⚑
- **Claim assertions** (golden path): register the `accounts.google.com` route
  **before** the click; assert final URL `…/my-purchases/orders/<id>?claimed=1`
  **and** the text "¡Listo! Guardamos este pedido en tu cuenta…"
  (`storefront.myPurchases.detail.claimed`) and the `#<id.slice(0,8)>` header
  (the URL alone can pass while the session fetch fails). Do not re-assert
  "Guardar con Google" after the click (it becomes a disabled "Abriendo
  Google…"). A new stub identity **creates** a `BuyerAccount`
  (`customer-auth.service.ts:363` `resolveGoogleAccount`: find by `googleSub`,
  else create with `emailVerified:true`; it never links by email); unique
  `e2e-<runid>-<n>@example.test` addresses avoid collisions. Fresh-context
  check: assert "Pedido guardado en tu cuenta" (`claim.saved`; token-based, no
  cookie needed).
- **Seller "Reclamado"** (`dashboard.assistedOrder.detail.claimedBadge`,
  `assisted-order-section.tsx:153`, shown when `claimedAt` is set; verified in
  `packages/i18n/es/dashboard.json:1005`). Open `/orders?order=<id>` after a
  fresh navigation (the sheet's data is stale otherwise). Reachable at 375 px.
- **Only one "Guardar con Google" exists at a time.** Before receipt the
  `pago_validado` block shows it; after "Ya lo recibí" the `entrega` moment
  replaces it.
- **Hydration.** `useSaveInvite` renders null first and fills in a `useEffect`;
  `ClaimOrderButton` sets `inApp` in a `useEffect`. So negative assertions
  (`toHaveCount(0)`, no `/api/account/google` request) pass instantly if made
  early. Always wait for a positive marker first (the `role=note` "Ábrelo en tu
  navegador" for in-app; the order header + the order GET response + a settle
  for "no invite"). Never click "Guardar con Google" before that.
- **Invites need a validated payment** (`hasValidatedPayment` = APPROVED or
  SELLER_RECORDED, `countsTowardPaid`) and the upload form needs
  `canSubmitProof` (ORDERING and balance > 0). So the in-app test uses a
  **partial validated payment** (throwaway store with `depositPercent`, or a
  seller-registered partial) so both the invite and the upload section show. A
  fresh PENDING order shows neither.
- **Invite seeding (PR-C).** `pickInviteMoment`:
  `pago_validado = !firstSeen &&
!dismissed`;
  `banner = !dismissed && firstSeen`. So "dismissedAt = now−8d → banner"
  requires also seeding `bm-invite:{slug}:{N}:firstSeen="1"`; the banner is a
  collapsed `<details>` ("Guarda este pedido en tu cuenta"): click the summary
  first. `dismissedAt = now−6d` yields the `adelanto_linea_de_tiempo` teaser (+
  a button in the history section), not "nothing": assert the invite section is
  absent and the teaser present. `{N}` = `orderRef(id)` =
  `id.slice(-N).toUpperCase()` (`packages/utils/src/order-ref`), taken from the
  **seller API/UI, never from a public GET** (a public GET stamps
  `linkFirstOpenedAt` and disables "Corregir número"). `addInitScript` reruns on
  every navigation: guard with `if(!localStorage.getItem(k))` and do not use it
  in the "Ahora no writes the key, then reload" test.
- **Regenerate** (edge-cases): detail sheet → "Enlace del comprador" → button
  `getByRole('button',{name:'Regenerar enlace',exact:true})` → dialog
  "¿Regenerar el enlace?" → "Sí, regenerar". The sibling "Enviar o copiar
  enlace" rotates the link too, with no confirmation: do not click it by
  accident. The new link is not an anchor: parse it with a regex out of textarea
  `#assisted-link-message` ("Enlace nuevo listo"). The old link renders
  `data-testid="public-order-invalid"` / "Pedido no encontrado".
- **G1 notice.** The raw link exists only on the created screen, and
  `BuyerNoticePrompt` offers appear after a seller action (approve/advance) on
  `/orders|/payments|/shipping`, in memory only. So the PR-C test asserts: the
  offer appears after an advance, "Avisar al comprador" opens the WhatsApp
  message, and the **old link still loads in a second context**. Do not assert
  "link text identical".
- **Clipboard** permissions exist only in Chromium; pin that in the `flows`
  project. "Copiar enlace" writes `window.location.href` and is inside the
  invite block (exists at 375 px once the invite shows).
- **Unobserved assumptions to verify in the spike ⚑:** (a) dashboard auth gate
  is client-side and works with the storageState on the chosen host; (b) the
  `--import` preload actually intercepts the token call in the built Nest app
  (one real claim through the stub) and the API boots with it under Node 24; (c)
  `trustedOrigins`/CORS accept the `127.0.0.1` origin for login and the public
  upload; (d) a full-balance buyer proof auto-VERIFIES
  (`apps/api/src/modules/orders/infrastructure/order.controller.ts:898-1010`);
  (e) a foreign `orderId` under own `storeId` returns 404 (PR-A; if it returns
  403/200, **stop and ask**, production is frozen); (f) per-IP throttle caps as
  tabulated in §8.

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
`trustedOrigins` (derived from `WEB_URL`; the comment at
`scripts/ci/web-e2e.sh:93-99` explains why `127.0.0.1`). Fallback: everything on
`localhost` if better-auth objects. Cookie names have no `__Secure-` prefix
(http). Only after the host is chosen write `auth.setup.ts` against that API
base. Verify with: UI login at `/es/login` then a dashboard page load; then
claim-ticket cookie present via unfiltered `context.cookies()` (§2.2). Existing
a11y specs must stay green. Record the outcome in the PR description. If a
production-code fix turns out to be needed, **stop and ask**. Add the spike's
touched paths to the `web_e2e` filter so the spike itself runs in CI.

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
  published). ("No payment methods" is API-only, PR-A; no web test.) Assert in
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
  `bm_claim` present before the Google hop and cleared after,
  `bm_customer_session` present (read per §2.2); plus the §2.2 claim texts. A
  stub-only self-test is not enough.
- Wiring checks: add `scripts/ci/google-stub.mjs` and the OAuth/auth source dirs
  (`apps/api/src/modules/customer-auth/**`, `apps/api/src/modules/orders/**`,
  `apps/api/src/auth/**`) to the `web_e2e` filter so stub drift is caught on the
  PR that causes it (not `api_e2e`); lint coverage for the `.mjs` (neither
  `shellcheck` nor the web ESLint config covers `scripts/ci/*.mjs`): add
  `node --check` plus a tiny `node:test` self-test to Hygiene following the
  existing `check-workspace-scripts.test.mjs` pattern; add a Hygiene guard
  `! git grep -n "google-stub\|E2E_GOOGLE_STUB" -- . ':!scripts/ci' ':!apps/web/e2e' ':!docs' ':!.github/workflows/ci.yml' ':!.artifacts'`
  (deploy workflows stay scanned; run it locally before pushing; repo has no
  Dockerfiles) plus a second guard that `GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET`
  do not appear in `scripts/ci/e2e.env.example`. Hygiene steps go after "Guard
  script tests" and before "Install actionlint" (`ci.yml` ~1102, 5-min job):
  `node --check scripts/ci/google-stub.mjs`,
  `node --test
scripts/ci/google-stub.test.mjs` (two cases only: non-Google
  URL passes through unchanged; no-op without `E2E_GOOGLE_STUB=1`), then the
  greps. Env is added to the existing `exec env PORT=3000 WEB_URL=… node …` line
  in `web-e2e.sh` (define the run id with a default; `set -u` is on).

### 3.5 In-app browsers

Parametrized `test.use({userAgent})` for Instagram, Twitter, Facebook. WhatsApp
is **not** tested (it opens real browsers — Chrome Custom Tabs /
SFSafariViewController — and is absent from the detection list); it is listed
under "not covered". Per UA assert: an order-specific value (generated order
number and total) is visible; "Ábrelo en tu navegador" note shown; no request to
`/api/account/google` is made; "Copiar enlace" writes the exact private URL
(grant `clipboard-read/write`, read back via `navigator.clipboard.readText()`);
proof upload section still visible (needs the partial validated payment from
§2.2). State in the traceability table that this covers the detection branch
only, not real in-app engines.

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
  receipt-confirmation invite moment; **no invite moment for cancelled and
  expired orders** (the issue's "nunca en reclamados/cancelados/vencidos";
  claimed is also covered in PR-C); second seller gets **403** using another
  store's `storeId` (as `assisted-orders:278,710` already assert) and **404**
  using own `storeId` with the other store's `orderId` (new assertion); public
  DTO has no seller email/other buyers' phones.
- New spec files use `.js` import specifiers (NodeNext rule for `apps/api`).
- Local run: `bash scripts/ci/e2e.sh` brings up PG/Redis/MinIO (needs Docker)
  and runs the suite; plain `pnpm --filter api test:e2e` needs those services
  already running with `scripts/ci/e2e.env.example` loaded.
- Sign in once per file (better-auth 3/10 s); unique phone per `it`.
- Unit: add phone spacing/`+51` cases to `packages/utils/src/phone-country`
  tests only if absent (check first).
- Verify: `pnpm --filter api test:e2e` (via `scripts/ci/e2e.sh` stack),
  `pnpm --filter api test`, typecheck, lint. Must not change `apps/api/src`
  (`git diff --stat origin/main -- apps/api/src` is empty).

**PR-B `test/f1-web-foundation-golden-path`** — base `main` (not PR-A).

- Spike (§3.2), config, setup, helpers, stub + `web-e2e.sh`, ci.yml, docs.
- `golden-path.spec.ts`: (1) full path with **buyer proof**, in the order forced
  by §2.1: seller creates order (one click) → reads link text → buyer context
  opens link, uploads `og-image.png` → seller approves in "Historial de pagos" →
  seller "Marcar En camino" (wait for PATCH) → buyer reloads, "Ya lo recibí" →
  "Guardar con Google" (stub; enabled-before-click assert) → assertions in §3.4
  → a **fresh context** loads the same link and shows the claimed state and the
  full timeline (other device + timeline full). Before claim, the buyer page
  shows the summary only (assert once, early). (2) **seller-registered payment**
  path (shorter): "Registrar pago" with TRANSFER + operation code + file → order
  VERIFIED. axe (`critical|serious`) on created screen and buyer page.
- `edge-cases.spec.ts` (3 tests + 1 tenant negative): invalid phone shows the
  Spanish error summary; regenerated link → old link "Pedido no encontrado" in a
  fresh context while the new link works; expired-order **render-only** check
  (take a real public GET response, mutate only status fields via `page.route`;
  real expiry is PR-A). Plus tenant negative: seller1 cannot open
  `/es/dashboard/demo-kpop-corner/orders`.
- Hard gate: baseline Web E2E duration recorded before and after; headroom ≥ 5
  min under the new 35 min timeout.
- Verify: `pnpm --filter web exec playwright test --list` (a11y projects list
  zero new tests);
  `git diff --stat origin/main -- apps/api/src packages/db apps/web/app apps/web/features apps/web/components`
  is empty; update the stale `workers: 1` header comment in
  `playwright.config.ts`; CI run (or `bash scripts/ci/web-e2e.sh` with Docker);
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
  notice offer appears after an advance and the old link still loads in a second
  context. Claim error redirect: navigate directly to
  `/es/my-purchases?claim=already_claimed` and assert the message (no API
  calls).

## 6. Sequenced steps and completion signals

1. `git pull`; baseline `playwright test --list` and a green Web E2E; record
   duration. Signal: duration number in PR-B description.
2. PR-A and PR-B can proceed in parallel worktrees. PR-B step 1 = spike; signal:
   a UI login + dashboard load green in CI.
3. PR-B rest; signal: golden path green, `repeat-each=3` green.
4. PR-C; signal: green, request-budget table (§8) still holds.
5. Done when all three PRs are green and the §7 table has verified file:line
   cites.

## 7. Test strategy / traceability

Every row must cite exact `file:line` of the assertion in the PR description
(verified by reading it, not by title).

| #277 criterion                                                                                         | Layer                       | Where                                                                                             |
| ------------------------------------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------- |
| Golden path                                                                                            | web + API                   | `golden-path.spec.ts` (1); `assisted-order-journey`                                               |
| Both payment paths                                                                                     | web + API                   | `golden-path.spec.ts` (1)(2); `seller-payments`, `public-proof-upload`                            |
| Repeated code / validate uploaded                                                                      | API                         | `seller-payments:257/:402`                                                                        |
| Advance / PARTIALLY_PAID, void                                                                         | API                         | PR-A new `it`s                                                                                    |
| Number formats, invalid, duplicate, corrected                                                          | API (+ web invalid message) | PR-A; existing `assisted-orders*`; `edge-cases`                                                   |
| Regenerated / revoked                                                                                  | API + web (regenerated)     | existing; `edge-cases`                                                                            |
| No payment methods / no alias                                                                          | API                         | PR-A; unit `public-order.service.spec.ts:235,254`                                                 |
| No stock                                                                                               | API                         | `assisted-orders:309`                                                                             |
| Expired                                                                                                | API real; web render-only   | PR-A; `edge-cases`                                                                                |
| WhatsApp/IG/Twitter links                                                                              | web UA emulation            | `in-app-browsers`                                                                                 |
| Google in in-app browsers                                                                              | web, detection branch only  | `in-app-browsers`                                                                                 |
| Invitations (not before payment, after, "Ahora no", receipt reminder, never claimed/cancelled/expired) | web + API                   | `invitations` (claimed); PR-A (cancelled, expired, receipt moment); `public-orders:246/:287/:502` |
| Other device                                                                                           | API + web                   | `buyer-claim:228`; `edge-cases`/golden path                                                       |
| G1 notices without token change                                                                        | API + web                   | `assisted-orders:657`; PR-C test                                                                  |
| Timeline summary vs full                                                                               | API (+web golden path)      | `public-orders:449`; PR-A                                                                         |
| DoD ES + mobile                                                                                        | web                         | Spanish selectors + axe at 375                                                                    |
| DoD isolation (403 foreign storeId, 404 foreign orderId) / no sensitive data                           | API + 1 web negative        | PR-A; `edge-cases`                                                                                |

**Not covered (state this in every PR description):** real Google; real phones
and real in-app browser engines; WhatsApp links (not in the detection list; not
tested); the KoreaLexa pilot and pilot issue triage; seller-side Google login;
iOS Safari same-site behavior; `INVITE_*` dedupe gaps already known.

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

(Paths in this plan are repo-relative; `public-order.service.spec.ts`,
`order-creation.core.ts` live under `apps/api/src/modules/orders/application/`,
`in-app-browser.ts` under `apps/web/features/public-order/lib/`. Before any
`git diff --stat origin/main …` check, run `git fetch origin`. The "≥5 min
headroom" criterion is relative to the baseline measured in step 1; "install +
build budget" in the §3.3 invariant is that measured value.)

1. Close #277? **No** (pilot + real-phone need users).
2. Add WhatsApp to the in-app list? **No change**, no test; listed as not
   covered.
3. Host for the CI stack? **Decided: `127.0.0.1` everywhere (fallback
   `localhost`), verified in PR-B step 0.**
4. Throwaway store per test vs seed store2: **throwaway via seller API**
   (decided; no seed mutation).

## 11. Review status and residual risk

Rounds 1–4 plus a final readiness review were run (see `review-log.md`). The
readiness reviewer found no blockers. **Two consecutive clean rounds were not
reached**: each round kept surfacing selector/assertion-level details (rounds 3
and 4 each had "blocking" items that were test-script details, not design
changes). The design (layers, PR stack, stub, single-host move, data isolation)
has been stable since round 2. Residual uncertainty is concentrated in the ⚑
items of §2.2, which the implementer must verify in PR-B's first commit; the
plan says what to do when one fails (stop and ask where production would need to
change).

The checkout was observed on branch `fix/402-e2e-configurable-postgres-port`
(not `main`) when the readiness review ran; cites were checked against that
tree. Base each PR on `origin/main` after `git fetch origin`.
