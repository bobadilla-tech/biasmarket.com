# Plan: Pedido asistido, buyer page (#268) and leftovers

Status: draft v8 (rounds 1-7 findings applied; see review-log.md for review
state)

Date: 2026-10-28. Planned against `origin/main` @ `d88be078` (includes #343,
#345, #347, #321, #344). Re-check `git log origin/main` before starting; main
moved four times during planning.

Written for: the implementation session (a fresh agent), not the user.

Legend: PR names are PR1, PR-S, PR4, PR-A, PR3, PR5, PR6 (no PR2: it was folded
into PR-A/PR3). Section 5 is **merge order**; section 6 is **build order**. "E1"
= issue #279 (security review); "D3"/"F2" = issues #276/#278; "D-12" = the wiki
decision for the route; open questions Q1-Q8 and Q10 are in section 10 (Q9 was
resolved by main).

## 0. Hard rules (CLAUDE.md, restated)

- pnpm only. TypeScript, ESM only. `apps/api` relative imports use `.js`.
- `web` never imports `packages/db` / `@prisma/client`; it talks to the API over
  HTTP only (generated `apiClient`).
- Every tenant query filters by `storeId`; mutations verify store ownership in
  the service layer (`assertOwnership`). Money is `Decimal`, never `Float`.
- `apps/api/openapi.json`, `apps/api/src/metadata.ts` and
  `packages/types/generated/**` are committed. After any DTO change run
  `pnpm --filter api generate:openapi && pnpm --filter @biasmarket/types generate`
  (both scripts exist) and commit the diff. CI's
  `scripts/ci/check-openapi-drift.sh` fails (and fails E2E (API), which runs it
  first) on drift. Run it with the env from `scripts/ci/e2e.env.example` after
  `pnpm turbo run build --filter=api` and `pnpm db:generate`.
- Read `apps/web/AGENTS.md` and the guides in `node_modules/next/dist/docs/`
  before writing Next.js code (Next 16.3.8: `params` is a Promise, `proxy.ts`
  replaces middleware).
- Do not run `prettier --write` on directories; format only touched files.
- No push, merge, or GitHub write (comment, close, edit, resolve) without the
  user's explicit approval; when approved, gh writes need
  `env -u GITHUB_TOKEN gh ...` (the shell's token is read-only). Review comments
  get a reply + resolve referencing the fixing commit.
- Auth rate limiter: sign-ups need a distinct `X-Forwarded-For`, and reusing an
  email label silently sends no verification mail. The planned e2e seed rows
  through prisma where possible and use distinct emails/IPs per round.
- Start every PR from a clean worktree off `origin/main`. The planning scratch
  worktree contained probe leftovers (stub page, `headers()` rule, probe e2e);
  none of that is to be copied.

### Path table (all under the repo root)

| Thing                          | Path                                                                                                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| checkout customer logic        | `apps/api/src/modules/orders/application/customer-account.service.ts` (`findOrCreateCustomer` 104-217, `change-phone` confirm ~387-405)                                                                                                     |
| assisted Customer helper       | `apps/api/src/modules/orders/application/assisted-customer.ts`                                                                                                                                                                              |
| customers service              | `apps/api/src/modules/orders/application/customers.service.ts` (`findAllForStore` 52-209, `upsertStoreContact` 304-313, `lookupByPhone` 322-)                                                                                               |
| checkout use case / lock order | `.../application/create-order.usecase.ts:48`, `.../application/order-creation.core.ts:17-20`                                                                                                                                                |
| public order                   | `.../application/public-order.service.ts`, `.../application/order-events.service.ts:129-145`, `.../infrastructure/public-order-events.controller.ts`, `.../dto/public-order-response.dto.ts`                                                |
| SDK mutator (hand-written)     | `packages/types/http.ts` (`credentials` at line 93), test `packages/types/http.test.ts`                                                                                                                                                     |
| generated SDK                  | `packages/types/generated/public-order-events/public-order-events.ts`, `apps/api/openapi.json`, `apps/api/src/metadata.ts`                                                                                                                  |
| web error tracking             | `apps/web/instrumentation.ts`, `apps/web/instrumentation-client.ts`                                                                                                                                                                         |
| web storefront                 | `apps/web/app/[locale]/(storefront)/store/[slug]/layout.tsx`, `apps/web/app/[locale]/error.tsx`, `loading.tsx`, `apps/web/proxy.ts`, `apps/web/next.config.ts`, `apps/web/app/robots.ts`, `apps/web/__tests__/canonical-regression.test.ts` |
| web reuse                      | `apps/web/features/orders/components/fulfillment-timeline.tsx`, `apps/web/features/orders/lib/order-format.ts`, `apps/web/test-utils/render-with-providers.tsx`                                                                             |
| CI                             | `.github/workflows/ci.yml`, `scripts/ci/web-e2e.sh`, `scripts/ci/e2e.sh`, `scripts/ci/check-openapi-drift.sh`                                                                                                                               |

## 1. Context, and what is stale in the handoff

Outcome: the link `/es/store/{slug}/pedido/{token}` that sellers already send
(PRs #324-#331) opens a working, private, mobile-first buyer page, plus the
leftover items from the seller stack.

Facts verified on `origin/main` (not trusted from the handoff):

- **main moved repeatedly during planning.** Landed since the handoff: #344
  (first-open fail-closed: a failed stamp returns 500 and the page is not
  served), #321 (storefront redesign), #343 (`trust proxy` 1 + Caddy
  `CF-Connecting-IP` trusted ranges + API-side token scrub; verified:
  `main.ts:29` sets `trust proxy` 1), #345 (B5 tracking number/URL + private
  package photo; the public DTO now carries `trackingNumber`, `trackingUrl`,
  `packedPhotoAvailable`, and `GET /public/orders/:token/packed-photo` exists),
  #347 (A4 payment rules and voids: public payments now carry `voidedAt`). The
  previous "wait for #343/#345" prerequisites are therefore **done on main**;
  see the deploy caveat below for #343.
- **Hosted CI runs only for PRs whose base is `main`**
  (`.github/workflows/ci.yml:10-11` `pull_request: branches: [main]`). The
  handoff's "stack PRs do get hosted CI" is not true for a PR based on another
  feature branch. This plan therefore avoids stacked branches (section 5).
- **#258 is already closed** (completed, 2026-10-27T23:45Z, by another account
  with a comment listing `validatePhone`, the store-isolated upsert without
  `BuyerAccount`, and `GET /stores/:storeId/customers/lookup`). The handoff's
  "post the leftovers map and close #258" is moot; nothing is posted. The only
  remnant is a possible missing store-isolation e2e for the lookup, which PR5
  adds only if absent (check first). Epic #253 stays open.
- Open issues: #268, #333, #337, #336, #339, #340, #269-#271 (#334 closed by
  #343).
- **#321** (`ContactSellerButton` gained `label`/`message`/`icon` props, the
  storefront header and `store/[slug]/page.tsx` padding `pt-24 sm:pt-24`
  changed, `packages/i18n/{es,en}/storefront.json` + `dashboard.json` edited).
  PR3 adds a `storefront.publicOrder` namespace to the same i18n files.
- The wiki repo has only Roadmap, Documentacion funcional, Home and
  CATALOGO-VISUAL. "Mapa del codigo", "Decisiones y ajustes" (D-12) and "Indice"
  are not in the wiki git repo; D-12's route comes from the issue body.
- **Caddy has no `log` directive**, so there are no access logs (#340's literal
  premise is wrong), but a probe proved that Caddy's default _error_ logger
  writes the token (request URI and `Referer`) whenever an upstream is
  unavailable. Also, a changed single-file-mounted Caddyfile may not reach the
  container on deploy (contested, see 4.3): **#343's Caddyfile change may not be
  live in production**, which would leave the public throttle bucketed by the
  proxy IP. This is for the user to check on the VPS now (Q10).

### Current behavior (file refs on origin/main)

- `GET /public/orders/:token` (`public-order-events.controller.ts:26-39`):
  `@Public`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`,
  throttle. `getByToken` (`public-order.service.ts`) looks up by token hash, 404
  `Pedido
no encontrado` for unknown AND revoked
  (`order-events.service.ts:129-145`, no oracle), stamps `linkFirstOpenedAt` +
  `LINK_OPENED` once keyed by token hash. Cancelled orders return 200 with
  `payable=false`. `paymentMethods[].details` is passed through as stored.
  `hashOrderAccessToken(token ?? '')` accepts any length.
- DTO has no alias, order number, `createdAt` or id; masked phone only.
- SDK already has `apiClient.publicOrders.getByToken(token, options?)`
  (`packages/types/generated/public-order-events/public-order-events.ts:19-27`);
  the mutator (`packages/types/http.ts:93`) sets
  `credentials: config.credentials
?? "include"` **after** spreading the
  per-call init, so a per-call `credentials` is silently overwritten (verified);
  it does not encode the token, and throws `ApiError(message, status)` for
  non-2xx (plain `Error` / `TypeError` for network or bad JSON).
- No `/pedido/` web route; `app/robots.ts` has no entry; `next.config.ts` has no
  `headers()`; `proxy.ts` is next-intl only (matcher
  `/((?!api|_next|.*\..*).*)`; tokens are base64url, no dot).
- `[slug]/layout.tsx` fetches `/stores/:slug/public` server-side (`no-store`)
  and renders `{store && <StorefrontHeader/>}{children}`. It does **not** call
  `notFound` (an unknown slug still renders the page) and does not pass the
  store to children. `findPublicBySlug` returns the store regardless of
  `isPublic`. `StorefrontHeader` is fixed with a cart link and `AccountNavLink`
  (calls buyer `account/me` with cookies; no token involved).
- Web error tracking has **no scrubbing**: `instrumentation-client.ts:8-18`,
  `instrumentation.ts:25-28,48-56` (`onRequestError` sends
  `pathname: request.path.split("?")[0]`, which contains the token).
- Checkout race: see probes P1/P2. The failing constraints are
  `BuyerAccount_phone_key` and `CustomerStoreLink_buyerAccountId_storeId_key`,
  not `Customer_storeId_phone_key` as #333 says.

## 2. Probes (throwaway; nothing committed)

Scratch worktree `<scratchpad>/wt` (detached `origin/main`), own Postgres 17 on
:55432 and Redis on :56379 (containers `pl-pg`, `pl-redis`). Probe code:
`<scratchpad>/probe-333.keep.ts` (absolute path in review-log).

| #  | What ran                                                                                                                                        | Result                                                                                                                                                                                                                                                  | Changed in plan                                                     |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| P1 | vitest e2e on the real AppModule (rows seeded via prisma): 5 rounds of 2 parallel `POST /stores/:slug/checkout`, same brand-new phone and email | every round `201` + `500`; `BuyerAccount_phone_key` (P2002)                                                                                                                                                                                             | fix covers BuyerAccount                                             |
| P2 | same file: verified BuyerAccount (same email) exists, no Customer/link, 2 parallel checkouts x5                                                 | every round `201` + `500`; `CustomerStoreLink_buyerAccountId_storeId_key` from `customerStoreLink.upsert`                                                                                                                                               | fix covers link + Customer; Prisma `upsert` is not race-safe here   |
| P3 | stub page + `headers()` rule `/:locale/store/:slug/pedido/:token` + `next dev` + curl                                                           | 200; `Referrer-Policy: no-referrer` applied; `noindex, nofollow` and `referrer` meta from `generateMetadata`; next-intl adds `Link: hreflang` (contains the token) and `NEXT_LOCALE` cookie. **`Cache-Control` was `no-cache, must-revalidate` in dev** | prod verification is a CI-asserted test (4.2), route forced dynamic |
| P4 | `grep`/diff of Caddyfile on main and #343                                                                                                       | no `log` directive                                                                                                                                                                                                                                      | PR4 fixes the proven leak and the deploy guard                      |

Not probed (covered by verification steps): production `Cache-Control` and the
RSC variant; the real shape of a browser Sentry event; Caddy error-log content.

## 3. Decisions made in this plan

D1. **First-open stamping vs link-preview bots: keep the API contract; the
browser fetches the order, the server never does.** `page.tsx` makes **no API
call at all** (static guard test, 7); the store contact comes from
`ContactSellerButton`'s own token-free client query (D3). Link-preview crawlers
do not run JS, so they never call `GET /public/orders/:token`, never stamp
`linkFirstOpenedAt`, never lock "Corregir numero". OG/Twitter metadata is
generic ("Tu pedido"), no order data. Residual: JS-running crawlers stamp; a
tampered slug still stamps because the API does not know the slug; the seller
opening their own link stamps (the created screen deliberately shows it as
text). Alternative (SSR + separate `POST .../opened` beacon) rejected: changes
#262's contract. (Q1.)

D2. **Revoked / regenerated / unknown / wrong-slug links: one state.** The API's
404 is identical for unknown and revoked; the page cannot tell and must not try.
Invalid state: "Este enlace no es valido o fue reemplazado. Pidele a la tienda
uno nuevo" + WhatsApp button via `ContactSellerButton slug={slug}` (its
token-free `usePublicStore` query; public data, attacker-chosen slug is fine)
which renders nothing when the store or its number is missing, leaving the text.
A token valid for a different store than the URL slug
(`dto.store.slug !==
params.slug`) renders the same invalid state. This is a
**UX guard, not an access control**: the browser already received the JSON, and
anyone holding the token can read it by design. Slugs are immutable
(`update-store.dto.ts` has no `slug`). For an unknown slug (no store) the page
renders the same invalid state without the WhatsApp button, still HTTP 200 (no
slug oracle, no `notFound()`). Closes the revoked-link gap #331 deferred.

D3. **Reuse** (updated after #321): reuse `FulfillmentTimeline`
(`features/orders/components`, props `{ fulfillmentStatus }`,
`storefront.fulfillmentTimeline` copy), `formatOrderDate`,
`components/shared/*`, and `ContactSellerButton` with the props #321 added
(`slug`, `message`, `label`, `icon`): `message` carries the "no es mi numero"
text and bypasses the `orderId.slice(0, 8)` default; it costs one extra
token-free client request (`stores.findPublic(slug)`) and no store number has to
be threaded from the server. **Not reused**: `AccountOrderDetail` (session buyer
DTO; #345 edits neighbours) and `OrderStatusBadge`/`getOrderStatus` (seller copy
from `dashboard.orders`). Build a small buyer-facing status banner in the new
feature with `storefront.publicOrder.*` copy mapped from (`status`,
`paymentStatus`, `fulfillmentStatus`). The PR body states the deviation from the
issue's "reutilizar" for the account detail. Check `pnpm --filter web lint` for
cross-feature import rules when importing from `features/orders` /
`features/customer-auth`.

D4. **Order number**: API computes `orderNumber` = last 4 chars of the id,
uppercase (no `#`; the UI adds it), same rule as web `getOrderNumber`
(`features/orders/lib/order-format.ts:4`). No new `packages/utils` module (it
would widen every CI filter for one line). PR-A pins the API ref with a unit
test on a fixture id; PR3 renders `#${dto.orderNumber}` (it does not import
`getOrderNumber`: the page has no order id) and pins the web side with a test
asserting `getOrderNumber(fixtureId) === "#" + apiRef`; comment points at #339
(4 -> 6) so both change together. It is never a lookup key.

D5. **Optional items**: IN, as a separate Phase 2 that can be cut: related
orders (PR5), #337 (PR6), and the lookup store-isolation e2e if missing. OUT:
`trust
proxy` (done by #343; effectiveness is a deploy question, see Q10), #336
idempotency (needs a product answer), #339 itself, seller-side first-open
locking, API-side allow-list of `paymentMethods[].details` (existing #262
behavior; recorded as a follow-up risk).

D6. **Scope limits**: no proof upload (#269), no rejection reason, tracking, or
package photo UI (#270; the DTO already carries `trackingNumber`, `trackingUrl`,
`packedPhotoAvailable` after #345: PR3 renders none of them, no DTO-sourced
href), and per-payment source + status + a plain "Anulado" label when `voidedAt`
is set (#347) plus a cancelled banner, no account invitation (D3/#276), no
Google (#271).

D7. **Merge order is a security requirement for PR3**, not a preference: the
first production buyer open must not (a) fall into one global throttle bucket
(#343 is merged; confirm it is **live**, Q10), (b) put the token in GlitchTip
(PR-S), (c) put it in Caddy error logs (PR4 merged **and deployed**: post-deploy
check passes). PR3's body carries a "Blocked by" list (PR-S, PR4 deployed, PR-A,
Q10 answer) and step 0 checks `gh pr view <n> --json state`.

## 4. Design

### 4.1 PR-A: public order API additions (DTO + hardening, `Refs #268`)

`PublicOrderResponseDto` gains, all allow-listed:

- `customerAlias: string | null` from `Order.customerName`, sanitised in the
  service by code point, not UTF-16 unit: `normalize('NFC')`, remove
  `/[\p{Cc}\u200B\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069\u2028\u2029\uFEFF]/gu`,
  collapse whitespace, trim, `Array.from(...).slice(0, 40).join('').trim()`,
  empty -> null. ZWJ/ZWNJ are kept on purpose (blanket `\p{Cf}` stripping breaks
  emoji sequences and Persian/Indic text). Tests: emoji at the cut, bidi marks,
  zero-width characters, control characters, all-whitespace.
- `orderNumber: string` (D4).
- `createdAt: string` (ISO).

`requireOrderForToken` (`order-events.service.ts:129`): before hashing, reject
tokens not matching `/^[A-Za-z0-9_-]{20,128}$/` with the **same** 404 body
(avoids hashing megabyte params; confirm the generator yields 43 chars). Also
affects `recordInvite` (same 404). Nothing else on the controller changes.
Verify and, if missing, test that the 404/429/500 responses also carry
`Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

Regenerate openapi + metadata + SDK. Tests: `public-order.service.spec.ts`
(alias sanitising, exact response key set, `JSON.stringify(response)` contains
neither the order id nor `accessTokenHash`), extend
`assisted-order-links.e2e-spec.ts` ("stamps the first open once...") to assert
the new fields and that `id`, `createdByName`, `linkFirstOpenedAt`, `claimedAt`,
`customerId` stay absent; malformed token -> same 404.

### 4.2 PR3: web page (`Refs #268`; see Q8 for who closes it)

All new unless noted:

- `app/[locale]/(storefront)/store/[slug]/pedido/[token]/loading.tsx` and
  `error.tsx` (route-level): a fixed-dimension skeleton (no layout shift; the
  `[locale]` `loading.tsx` is a full-page state) and an `error.tsx` that shows
  **only generic copy** and an in-page retry, never `error.message` (the
  `[locale]/error.tsx` renders it and calls `Sentry.captureException`). Test: a
  render exception inside the view lands in it and shows no message.
- `app/[locale]/(storefront)/store/[slug]/pedido/[token]/page.tsx`: server
  component, **no fetch/API call**. `export const dynamic = "force-dynamic"`.
  `export async function generateMetadata()` (literal form
  `canonical-regression.test.ts` greps) with generic title,
  `robots: { index: false,
follow: false }`, `referrer: "no-referrer"`, generic
  openGraph/twitter. Awaits `params`; renders `<PublicOrderPage slug token />`.
- `features/public-order/`:
  - `queries/use-public-order.ts`: `useQuery` over
    `apiClient.publicOrders.getByToken(token, { credentials: "omit" })`. This
    requires a one-line, backward-compatible mutator change in
    `packages/types/http.ts`:
    `credentials: init.credentials ?? config.credentials
?? "include"` (no
    caller passes it today; mobile keeps `config.credentials`), plus a
    `http.test.ts` case. Component test with the **real** `customFetch` (only
    global `fetch` stubbed) asserting `init.credentials === "omit"`.
    `retry: false`, `staleTime: 30_000`, `refetchOnWindowFocus: true`. Classify
    by `error instanceof ApiError`: status 404 -> `invalid`, 429 ->
    `rateLimited` (status only, never the message), anything else (incl. 500
    from a failed first-open stamp, network errors) -> `error` with retry and
    copy that does not say "invalid link". No persisted query cache (confirm
    `QueryProvider`).
  - `components/public-order-page.tsx` (client): skeleton (`role="status"`,
    `aria-live="polite"`), invalid state (D2), rate-limited, error + retry,
    view; moves focus to the state heading on change. The fixed storefront
    header stays (accepted; no token reaches it): the page wrapper needs the
    same top padding as `store/[slug]/page.tsx` (currently `pt-24 sm:pt-24`). A
    `<noscript>` block says "Activa JavaScript para ver tu pedido, o escribele a
    la tienda" (text only; no-JS visitors and preview bots otherwise see only
    the skeleton).
  - `components/public-order-view.tsx`: greeting ("Hola {alias}" or generic),
    buyer-facing status banner + `FulfillmentTimeline`, items, total, adelanto
    (`requiredAmount`), pagado (`paidAmount`) and "falta del adelanto"
    (`pendingAmount`; measured against the adelanto, not the total, so it is 0
    once the adelanto is paid), delivery summary, store header, payments list
    (source "Enviado por ti"/"Registrado por la tienda", amount, "Anulado" when
    `voidedAt` is set, date, status), "Pedido para {customerPhone}", disclosure
    "No es tu numero? Avisale a la tienda" with explanation and
    `ContactSellerButton`.
  - Payments and totals: use the API's `paidAmount` and `pendingAmount` as given
    and **never sum the `payments` list client-side** (`computePaymentSummary`
    counts a payment only when `voidedAt` is null and it is `SELLER_RECORDED` or
    an `APPROVED` buyer submission). Label each row from `voidedAt` first
    ("Anulado", no review label), then `reviewStatus` ("En revision" /
    "Rechazado" / recorded or approved). The order-level banner derives from
    `paymentStatus`/`fulfillmentStatus`/ `status` only.
  - Dates: `formatOrderDate(createdAt, locale, t)` needs
    `date.today`/`date.yesterday` keys that exist only in `dashboard.json`; add
    `storefront.publicOrder.date.*` and pass
    `useTranslations("storefront.publicOrder")` (tests use a fixed clock). Pass
    i18n labels to `ErrorState` (`retryLabel`, default "Retry") and
    `LoadingState` (`label`, default "Loading").
  - `components/how-to-pay.tsx`: only when the API returned methods/instructions
    (it nulls them when cancelled). **Render allow-list**: per method render
    only string/number values as plain text with fixed labels; no `href` from
    data, no auto-link, no recursive JSON dump; `paymentInstructions` in
    `whitespace-pre-wrap` plain text. If none configured and no instructions:
    "La tienda aun no configuro metodos de pago, escribele".
  - Contact: `<ContactSellerButton slug message=... label=... />` with `message`
    = "Hola, el pedido #XXXX no es para mi numero" (**only the order ref, never
    the page URL or token**; the order number comes from `dto.orderNumber`, so
    only the valid state passes `message`; the invalid state passes none and its
    copy does not reuse the numeric text; the component builds the `wa.me` link
    via `buildWhatsAppUrl`). Add a test where the `stores.findPublic` query
    fails or is rate-limited: the button renders nothing and the page still
    shows the text. Test that the rendered href has no token and keeps
    `noopener noreferrer` (read the component after #321). No "share/copy link"
    controls.
  - `index.ts` barrel.
- `app/robots.ts`: add `"/*/store/*/pedido"` and `"/*/store/*/pedido/*"`
  (anchored, literal; see the comment at lines 12-16). Note: Disallow stops
  crawlers from reading the noindex meta/`X-Robots-Tag`; acceptable because the
  URL is never linked publicly. Land with the page (the canonical regression
  test skips disallowed routes). Add a robots assertion; confirm no sitemap
  source lists it.
- `next.config.ts` `headers()` for **both** `/:locale/store/:slug/pedido/:token`
  and the unprefixed `/store/:slug/pedido/:token` (`localePrefix` is "always",
  so the proxy redirects the unprefixed form to `/es/...` with the token in
  `Location`): `Referrer-Policy: no-referrer`, `Cache-Control: no-store`,
  `X-Robots-Tag: noindex, nofollow`, `X-Frame-Options: DENY` and
  `Content-Security-Policy: frame-ancestors 'none'`. **CI-asserted**: a curl
  block in `scripts/ci/web-e2e.sh` between `wait_for_http "$WEB_URL_LOCAL/es"`
  and the Playwright step (works with no seeded store: the layout renders
  children for an unknown slug), using `curl -sS -D- -o /dev/null`,
  case-insensitive header matches, `-H 'RSC: 1'` for the RSC variant (`?_rsc=`
  alone is not an RSC response) and `curl -sI --max-redirs 0` for the unprefixed
  form expecting a 307 that carries the headers (if absent, apply the `proxy.ts`
  fallback). Expect this to bite: Next runs config `headers()` before redirects
  and the proxy, so the intl response can override `Cache-Control`; the planned
  fallback is to set the headers in `proxy.ts` on the intl response for that
  path. Cloudflare: ask the user whether a "bypass cache" rule for `*/pedido/*`
  and `*/public/orders/*` exists (Q7); `no-store` should already prevent
  caching.
- i18n: `packages/i18n/{es,en}/storefront.json` namespace `publicOrder` (parity
  and message-format tests). The next-intl `Link: hreflang` header contains the
  token; not disabled because `alternateLinks` is global (would change SEO for
  the whole site) and response headers are not logged by Caddy by default.
- No third-party script/request on the route (root layout: self-hosted
  `next/font`, inline JSON-LD, sonner only).
- Not done on purpose: stripping the token from the address bar
  (`history.replaceState`), because reload must keep working.

### 4.3 PR-S (web error-tracking scrub) and PR4 (Caddy)

**PR-S** (`Refs #268, #279`): web uses `@sentry/react` 10.76.2 (client) and
`@sentry/node` 10.76.2 (server), no `@sentry/nextjs`. Both `Sentry.init` calls
are inline in `instrumentation-client.ts` (module top level, gated on
`NEXT_PUBLIC_SENTRY_DSN`) and `instrumentation.ts` (`register()`, gated on
`WEB_SENTRY_DSN`), so extract `buildSentryOptions()` (hooks + scrub) into `lib/`
for each runtime so a test can call `Sentry.init({ ...opts, transport })`;
`Sentry.close()` in `afterEach` (global singleton); the server test runs in the
node environment. `apps/web/lib/scrub-order-token.ts`: a **deep-walk** scrub
(serialize the event, replace
`/(\/pedido\/|\/public\/orders\/)[A-Za-z0-9_-]+/gi` with `$1[redacted]`, parse
back; return the scrubbed event, never `null`). **Do not `JSON.stringify` the
event as is:** transaction events hold `sdkProcessingMetadata` with a circular
structure, the SDK swallows the throw and silently sends a TypeError error event
instead of the transaction (the test would pass vacuously). Stringify a copy
without `sdkProcessingMetadata` and reattach it, or use a `WeakSet` replacer;
the test must positively assert that a `transaction` envelope item arrived).
Wire it into `instrumentation-client.ts` (`beforeSend`, `beforeBreadcrumb`;
client transactions do not exist today because there is no
`browserTracingIntegration`, so `beforeSendTransaction` is added but untestable:
say so) and `instrumentation.ts` (server `beforeSend`, `beforeBreadcrumb` and
**`beforeSendTransaction`**: tracing is 0.01 and those `http.server`
transactions carry `url.full`/`http.target`; `onRequestError` scrubbing
`pathname`, `message` and `digest`; it must keep not reading `request.headers`,
which holds `referer`/`cookie`: assert that). Tests: regex unit cases (mixed
case, query/hash, nested); **a test that builds a real event through the SDK
with a fake transport** (client `captureException` + a fetch breadcrumb to
`.../public/orders/<token>` and a transaction named
`/es/store/x/pedido/<token>`) and asserts `JSON.stringify(sentEvent)` does not
contain the token. Independent of PR3 (can merge before it, must merge before
it).

**PR4** (`Refs #340`; the user closes it, Q3): **leak proven by a probe** (a
code PR, not docs-only) (round-5 reviewer, `caddy:2-alpine` with the repo
Caddyfile and stand-in upstreams). Access logs are off (no `logging` in
`caddy adapt`), but with the upstream down (503 "no upstreams available" because
of `health_uri`, or a 502 dial failure) Caddy's default logger
(`http.log.error`, stderr) writes `request.uri` containing
`/api/public/orders/<token>` or `/es/store/x/pedido/<token>`, **and**
`request.headers.Referer` carrying the page URL. This happens on every
blue/green cutover blip. Fix, verified with the same probes (token count 0,
output stays JSON):

```
{
	log {
		format filter {
			wrap json
			request>uri regexp (/pedido/|/public/orders/)[A-Za-z0-9_-]+ $1[redacted]
			request>headers>Referer regexp (/pedido/|/public/orders/)[A-Za-z0-9_-]+ $1[redacted]
		}
	}
}
```

inside the global options block at the top of `infra/vps/Caddyfile` (#343 added
one with `servers { trusted_proxies ... }`; extend it, keep a single block). A
future per-site `log` directive does not inherit it: document that in
`docs/core/deploy.md` together with the retention of the stderr logs.

**Deploy mechanics (in scope for PR4; contested evidence):**
`docker-compose.yml:132` bind-mounts the single file
`./Caddyfile:/etc/caddy/Caddyfile:ro` and `cd.yml:195` rsyncs with
`--delay-updates` (a rename onto a new inode). On Linux a single-file bind mount
keeps the old inode, so the container may keep the old file while `caddy reload`
exits 0. One reviewer reproduced it on a Linux VM; another could not on Docker
Desktop (macOS resolves by path). Step 1 of section 6 reproduces it on a Linux
runner first. #343's `trusted_proxies` change merged on 2026-10-28 and may
therefore not be live (Q10). PR4 adds to `infra/vps/deploy.sh`, in `cmd_deploy`
right after `assert_production_topology` (under the deploy lock, before
migrations, candidate start and any `active/*.caddy` write; **never inside the
canary window or `cmd_rollback`**, where a Caddy restart would drop in-flight
traffic and break the `compose exec` calls under `set -e`): compare `sha256sum`
of the host Caddyfile with the file in the container
(`compose exec -T caddy
sha256sum`, written as `if ! ...; then die`),
`caddy validate` the new file, and only if the hashes differ run
`compose up -d --no-deps --force-recreate caddy` (1-5 s on 80/443; named volumes
keep certificates; never `down -v`), then re-run the topology check.
Post-deploy: `compose exec -T caddy caddy adapt
--config /etc/caddy/Caddyfile`
must contain the filter (match the stable substring `request>uri`, retry up to 3
times, treat an unreachable admin API as a warning when the hashes match).
Alternative: move the file to `infra/vps/caddy/Caddyfile` and mount the
directory (a one-time recreate is still needed); keep the hash guard as a
backstop. This changes production deploy tooling: needs the supervised path in
`docs/core/deploy.md` and the user's explicit approval before merge and deploy
(Q10). No tests exist for `infra/vps` scripts: paste `caddy validate`/`adapt`
output and the probe logs in the PR body and shellcheck the changed scripts;
hosted CI for an `infra/**`-only PR runs nothing meaningful. Do not edit
`caddy.sh`'s generated `active/*.caddy` logic. Rollback: revert + a supervised
deploy.

### 4.4 PR1: checkout race (`Closes #333`)

In `CustomerAccountService.findOrCreateCustomer`
(`customer-account.service.ts:104-217`), inside the existing transaction, **no
try/catch around statements** (Postgres aborts the tx, 25P02; Prisma has no
savepoints). Raw statements are parameterised `$executeRaw`/`$queryRaw` tagged
templates (never `Prisma.raw` or string-built) and **supply `id` explicitly**
(`randomUUID()`, as `assisted-customer.ts` does: imported line 1, used ~27):
`id` has no DB default in the migrated tables (Prisma's `@default(cuid())` is
client-side); `createdAt` and `emailVerified`/`passwordVersion` have DB
defaults; none of the three tables has `updatedAt`. Every statement on
Customer/CustomerStoreLink includes `storeId`.

Restructure into a re-entrant resolve step: find BuyerAccount by phone -> if
none: `INSERT ... ON CONFLICT ("phone") DO NOTHING` -> re-find -> then run the
**existing branch logic on the row that was found** (Google-owner/phone-less
account branch, email mismatch -> guest result, same email verified -> reuse,
same email unverified -> update + send verification). `needsVerificationEmail`
derives from the found row, not from "we inserted". A loser whose found account
has a different or no email returns the guest result (null customer/account) and
touches nothing; it never gets the winner's account in its response.

Serialise first, constrain second. **Take a per-phone advisory lock as the first
statement inside `findOrCreateCustomer`** (it only runs
`if (dto.customerEmail)`, `create-order.usecase.ts:49-62`; the guest path never
enters it), before the first BuyerAccount read, with `$executeRaw` (void result;
`recordInvite` does the same):
`SELECT pg_advisory_xact_lock(hashtext(${'buyer-phone:' + normalizedPhone}))`
(the same technique `recordInvite` uses). Probed: a guarded
`UPDATE ... WHERE phone IS NULL AND NOT EXISTS (...)` is **not** race-safe under
READ COMMITTED (two sessions both pass `NOT EXISTS`, the loser gets 23505), so
no conditional-UPDATE trick; the lock makes the Google-attach and the insert
path mutually exclusive per phone. `ON CONFLICT DO NOTHING` + re-find stays as
defence in depth and is what covers the writers that do not take the lock (the
assisted flow for `Customer`). Probed with two psql-style sessions: when the
winner commits, the loser's insert returns 0 rows and the re-read sees the
winner's row; when the winner rolls back, the loser's insert proceeds and it
becomes the creator. Deadlocks: one advisory lock per transaction, taken after
the pickup/courier locks; no cycle with seller phone correction (it locks the
Order, then inserts/reads Customer).

Five writers of `BuyerAccount.phone` / link / Customer, plus
`upsertStoreContact` below, all fixed:

1. `buyerAccount.create` (`:161-164`):
   `INSERT ... ON CONFLICT ("phone") DO NOTHING`, re-find, then the **existing
   branch logic on the found row**.
2. The Google-session attach `buyerAccount.update({ data: { phone } })`
   (`~:129-148`): runs under the advisory lock, **and** is guarded on its own
   row:
   `UPDATE "BuyerAccount" SET phone = ..., name = COALESCE(name, ...) WHERE id = ...
AND phone IS NULL RETURNING *`;
   0 rows (the session lost the attach) -> return the **guest result**
   `{ customer: null, buyerAccount: null, needsVerificationEmail: false }`;
   never fall through to the create path (the account now holds the other phone,
   so `phoneLessOwner` would miss it and a second BuyerAccount with the same
   email would be minted: `BuyerAccount.email` is not unique). `RETURNING *` via
   `$queryRaw` is untyped: select the columns the branch code reads
   (`id, phone, email, name,
   emailVerified, passwordVersion, pendingPhone`)
   and map them to that shape. Needed because the same Google session posting
   two checkouts with phones P and Q takes two different advisory locks and
   would otherwise lose an update (probed: final phone P while Q's order is
   linked to the account). Lock order inside the step is always advisory lock
   first, then the row; never the reverse.
3. `customerStoreLink.upsert` (`:190-196`):
   `INSERT ... ON CONFLICT
("buyerAccountId","storeId") DO NOTHING` (new id).
4. Customer find-or-create (`:198-214`): the pattern of
   `assisted-customer.ts:17-49`
   (`INSERT ... ON CONFLICT ("storeId","phone") DO
NOTHING`, `findUnique`, one
   retry, else `ConflictException`), then keep the existing unconditional
   `customer.update({ email, name, emailVerified })` (checkout overwrites today;
   not the assisted `name: null`-only update).
5. The `change-phone` confirm (`customer-account.service.ts:~387-405`:
   `findUnique` then `buyerAccount.update({ phone })`, outside the checkout tx):
   wrap in `$transaction`, take the same advisory lock for the new phone,
   re-check, then update guarded by `AND "pendingPhone" IS NOT NULL` (a
   double-clicked confirm must not misapply); a conflict still maps to the
   existing 409.

Raw SQL gotchas (probed against the DB): `BuyerAccount`, `Customer` and
`CustomerStoreLink` have no `updatedAt`/`role` columns and no id default;
coalesce `name` to `null` explicitly (`${name ?? null}::text`), `undefined`
throws in tagged templates. Statements verified to run: BuyerAccount
`(id,phone,email,name,emailVerified)
ON CONFLICT (phone) DO NOTHING`,
CustomerStoreLink
`(id,buyerAccountId,storeId) ON
CONFLICT (buyerAccountId,storeId) DO NOTHING`,
Customer
`(id,storeId,phone,email,name,
emailVerified) ON CONFLICT (storeId,phone) DO NOTHING`.
`hashtext` (32-bit) is fine: a collision only costs a spurious wait.

Out of scope, listed under Risks: the Google create path in
`customer-auth.service.ts:~215-222` (check-then-create by email) racing a
checkout for the same email.

Also `CustomersService.upsertStoreContact` (`customers.service.ts:~300`, plain
`prisma.customer.upsert`, no tx): reuse `upsertAssistedCustomer` and keep a
follow-up update where it sets a given name. Not "decide later".

Lock order stays pickup point -> courier -> [phone advisory lock] -> Customer
step (BuyerAccount, link, Customer) -> stock -> Order insert; no `FOR UPDATE` on
the Customer row (it would block the Order FK insert, see
`assisted-customer.ts:11-16`). Reviewed: READ COMMITTED (no isolationLevel in
`apps/api/src`) so the re-read sees the winner's commit; no deadlock cycle found
(assisted orders never touch BuyerAccount/link; pickup/courier locks serialise
same-pickup racers first). Two same-email racers both reach the "same email
unverified" branch and each queue a verification email (existing behavior for
repeat checkouts); say so in the PR.

### 4.5 PR5: related orders in order detail (no close)

- API `GET /stores/:storeId/orders/:orderId/related` (`order.controller.ts`,
  mirror `findOne` at `:377-386`: `AuthGuard`, `assertOwnership`,
  `findRowByIdForStore`; foreign/missing -> same 404). Phone =
  `customerPhoneNormalized` else `normalizePhone(customerPhone)`. Indexed query
  `{ storeId, customerPhoneNormalized: phone, id: { not: orderId } }` ordered
  `createdAt desc`, `take: 10`, plus a separate `count`; legacy rows
  (`customerPhoneNormalized: null`, **with `storeId` in the where**,
  `orderBy
createdAt desc`, new cap 500 (main has none), documented: `total` is
  a lower bound beyond it) are normalised in memory as
  `customers.service.ts:328-342` does, **excluding `orderId`** (the current
  order can itself be a legacy row), and merged: sort desc, slice 10,
  `total = indexedCount + legacyMatches`. The items query and the count are two
  statements without a shared snapshot; a concurrent insert can make them differ
  by one (accepted). With the 500 cap, an older matching legacy row beyond it
  can be newer than an indexed item in the top 10, so for legacy rows both items
  and `total` are best-effort (say so in the PR). Include cancelled/expired
  (labelled). Response allow-list:
  `{ items: [{ id, orderNumber, createdAt, status, paymentStatus,
fulfillmentStatus, totalAmount, currency, source }], total }`
  (no phone, name, payments). `total` excludes the current order, so it can
  differ by one from `lookupByPhone.previousOrders` shown on the new-order
  screen (state this in the UI copy/PR).
- Web: "Otros pedidos de este numero" inside `AssistedOrderSection` (assisted
  orders only, matching #265's deferral); rows open that order if the orders
  page supports it by query param, else read-only. es/en dashboard i18n.
- Regenerate openapi/metadata/SDK on the then-current main (#345 and #347 have
  merged).
- #258 gap: e2e that seller B calling `customers/lookup?phone=` for a phone that
  exists only in store A sees `previousOrders: 0`/no alias for store B and gets
  403/404 when passing store A's id.

### 4.6 PR6: #337 ghost customers (`Closes #337`)

`CustomersService.findAllForStore` (`customers.service.ts:52-209`): after guest
folding drop a `Customer` when `orderCount === 0` and no `email`,
`passwordHash`, `pendingEmail`, `pendingPhone` and `!emailVerified` (in memory;
a Prisma `where` alone would miss customers whose only orders are guest orders
folded by phone). Key the filter on the post-fold `row.orderCount`, not the
by-customer count. A name-only zero-order contact (`upsertStoreContact` creates
one from the new-order screen) is hidden too, per #337's text (no email, no
passwordHash); say so in the PR. `findOneForStore` unchanged (still store-scoped
by id). Unit + e2e: orphan hidden, registered-no-orders kept, only-guest-orders
kept, a same-phone customer in another store does not affect the result.

### 4.7 #258 housekeeping

#258 was closed by another account on 2026-10-27 (see section 1); do not post
anything. In PR5, grep `apps/api/test/*.e2e-spec.ts` and the lookup unit specs
for a cross-store isolation case on `customers/lookup`; add the e2e only if none
exists. Epic #253 stays open until the buyer side lands.

## 5. PR stack (no stacked branches; every PR targets `main`)

Recommended merge order (give it to the user):

1. **Check #343 is live in production** (Q10; user action, no PR needed).
2. **PR4** (Caddy log filter + deploy-mechanics guard). Independent of the
   others; ships first because it also decides whether Caddyfile changes
   (including #343's) reach production.
3. **PR-S** (web scrub), **PR-A** (API fields). Independent of each other.
4. **PR3** (the page), after PR-S, PR4 (deployed) and PR-A.
5. **PR1** (#333) anywhere: independent.
6. Phase 2 (can be cut, independent of the buyer page): **PR5**, **PR6**.

PR-A and PR5 regenerate openapi/metadata/SDK on top of the then-current main:
whoever merges second rebases and **regenerates** (never hand-merges generated
files). The implementer may build PR3 locally on a branch containing PR-A's
commits and open it as a draft only after PR-A lands (PR3 typechecks against
PR-A's generated DTO fields).

| PR   | Branch                         | Base | Scope                                              | Closes/Refs             |
| ---- | ------------------------------ | ---- | -------------------------------------------------- | ----------------------- |
| PR4  | `fix/caddy-token-logs`         | main | 4.3 PR4 (Caddyfile + deploy scripts + docs)        | Refs #340 (user closes) |
| PR-S | `fix/web-scrub-order-token`    | main | 4.3 PR-S                                           | Refs #268, #279         |
| PR-A | `feat/public-order-dto-fields` | main | 4.1                                                | Refs #268               |
| PR3  | `feat/public-order-page`       | main | 4.2 + `packages/types/http.ts` one-liner + CI curl | Refs #268               |
| PR1  | `fix/checkout-customer-race`   | main | 4.4                                                | Closes #333             |
| PR5  | `feat/order-related-orders`    | main | 4.5 (Phase 2)                                      | Refs #265 (closed)      |
| PR6  | `fix/hide-ghost-customers`     | main | 4.6 (Phase 2)                                      | Closes #337             |

PR3's body carries a "Blocked by" list and a table mapping each #268 checkbox to
its evidence (PR-S for the Sentry one, #343 for the throttle, tests for the
rest), and states that the checkbox "Sin login ni datos personales" is satisfied
in the sense "no login, only a masked phone, the seller's alias and the delivery
line". `Closes #268` is deliberately **not** used: the valid state has no
browser e2e in CI and the manual phone-width check is the proof, so the user
closes #268 after it (Q8). No schema/migration in any of these PRs. Each PR
contains only its files and tests and is green on its own; `ci.yml` path filters
decide which jobs run (`infra/**` runs none), so each PR body lists what was run
locally.

## 6. Steps and completion signals (build order)

Refs marked `~` in this plan were not checked by every reviewer: re-verify them
rather than trust them.

0. Fresh worktree off `origin/main` under the scratchpad;
   `pnpm install
   --frozen-lockfile`; own Postgres/Redis on non-default ports;
   workers app with `MAIL_DRIVER=file` on its own `PORT` (only specs that sign
   up users need it); `pnpm turbo run build --filter=api` (workspace packages
   must be built before vitest/e2e: `@biasmarket/queue` etc. resolve to `dist`).
   Re-read the "Path table" refs and `git log origin/main`. Signal: build green,
   `prisma migrate
   deploy` ok, `git status` clean, no `pedido` directory and
   no `headers()` block in `apps/web` before PR3 starts.
1. PR4. First reproduce the stale single-file-mount behaviour on a Linux runner
   or VM (reviewers disagreed: one reproduced it on a Linux VM, one could not on
   Docker Desktop macOS); the remedy below is safe either way. Signals:
   `caddy
   validate`/`adapt` output with the filter; the 503/502 probe shows
   no token in the container logs; shellcheck clean on changed scripts;
   post-deploy, `caddy adapt --config /etc/caddy/Caddyfile` inside the container
   contains the filter and the host/container `sha256sum` match, and a provoked
   503 leaves no token in `docker logs`.
2. PR-S. Signal: fake-transport test green (the server test forces
   `tracesSampleRate: 1`); `pnpm --filter web test`, `lint`, `typecheck` as
   separate invocations.
3. PR-A. Signal: regenerate with
   `pnpm --filter api generate:openapi && pnpm
   --filter @biasmarket/types generate`,
   then `bash scripts/ci/check-openapi-drift.sh` exits 0 (read the script first:
   it changed on main to ignore key ordering and it only diffs `openapi.json`,
   so also confirm `metadata.ts` and the SDK diffs are committed); api unit +
   e2e; `pnpm --filter api test`, then `lint`, then `typecheck` (separate
   invocations; api `pretypecheck` regenerates `apps/api/src/metadata.ts`;
   `lint` diffs against `origin/main`, so keep it fetched).
4. PR3 (rebase onto main after PR-A has merged; signal: `git log` shows PR-A's
   commit). After editing `packages/i18n/**` run
   `pnpm turbo run build
   --filter=@biasmarket/i18n` before the web typecheck
   (it reads `dist`). The `packages/types` change also fans CI out to mobile
   lint/typecheck and the api jobs; say so in the PR body. Signal: web
   unit/component tests, `pnpm --filter
   @biasmarket/types test` (mutator),
   lint, typecheck, `next build`; the `next
   start` header curl block green in
   `scripts/ci/web-e2e.sh` (it runs in the `web-e2e` job, gated on
   `detect-changes` output `web_e2e`, `ci.yml:~1046`; confirm the filter near
   `ci.yml:~173` covers `apps/web/**` and the script so a web-only PR triggers
   it); Playwright invalid-state spec (reuse the seeded slug
   `demo-tienda-de-camila` via `WEB_E2E_STORE_SLUG`; the API is up on :3000 in
   that job, so the 404 assertion is real); manual: seed a real assisted order
   (reuse the assisted-order e2e seed or `/run`), open the page URL with `curl`
   (no JS) and confirm `linkFirstOpenedAt` stays null, then open it in a
   phone-width browser and confirm it stamps once.
5. PR1. Signal: the new e2e fails on the base commit (paste output in the PR)
   and passes after; `pnpm --filter api test`, `lint`, `typecheck` ok.
6. Phase 2. PR5: unit + e2e (isolation matrix in section 7), drift script exits
   0, lint, typecheck. PR6: unit + e2e `customers.e2e-spec.ts` orphan case,
   lint, typecheck.
7. After the last merge run `bash scripts/ci/check-openapi-drift.sh` on a clean
   checkout of main (exit 0) and hand the PR list back for the review session.

## 7. Test strategy

- **PR1** (real AppModule; seed rows; cleanup BuyerAccount/link/Customer rows
  via `schema-assert.ts` helpers): (a) new phone, same email, 2 parallel x 5
  rounds -> 201/201, exactly 1 BuyerAccount, 1 link, 1 Customer; (b)
  BuyerAccount exists, no Customer/link, 2 parallel -> 201/201, 1 link, 1
  Customer; (c) new phone, **different** emails (same case each, since email
  comparison is case-sensitive), 2 parallel -> 201/201, exactly 1 BuyerAccount
  whose email is the winner's, loser's order is a guest order (`buyerAccountId`
  null) and the account's email/verification state is unchanged, loser's
  response carries no account data; (d) checkout || assisted for a new phone,
  **no pre-seed**, x5 (keep the existing pre-seeded loop too); (e)
  Google-session phone attach racing a checkout (0 failures over x5; seed a
  BuyerAccount via prisma with email set, phone null, `emailVerified` true, sign
  it with `createCustomerSessionToken`
  (`packages/utils/src/customer-account-token/index.ts:89`, secret
  `CUSTOMER_ACCOUNT_TOKEN_SECRET`), send it as Bearer with `customerEmail` = the
  account email); (f) `change-phone` confirm
  (`GET /stores/:slug/account/confirm?token=` with a token from
  `createCustomerAccountToken` (`:27`), `purpose: 'change-phone'`, and
  `pendingPhone` set via prisma) racing a checkout for the same new phone: the
  loser is 409 or guest, never 500; (g) the same Google session with two
  different phones in parallel: the account's phone equals exactly one phone,
  the other order is a guest order, there is exactly **one** BuyerAccount with
  that email and no second verification mail. `Promise.all` x rounds (it
  reproduced 5/5 in P1/P2); do **not** add a `pg_stat_activity` sync point.
  Unit: each branch after a conflict, "insert returned nothing and re-find is
  empty -> ConflictException", every raw statement includes `storeId` where
  applicable.
- **PR-A** (API only): sanitising (4.1 cases), exact key set, `JSON.stringify`
  negatives, malformed-token 404 including a 1 MB token, and a test that the
  404/429 responses carry `no-store`/`no-referrer` (`AllExceptionsFilter`
  already sets them for `/public/orders` paths and scrubs the path: test, do not
  rebuild). Add `apps/api/src/common/filters/all-exceptions.filter.ts` to your
  reading list.
- **PR3** (web, plus the `packages/types/http.ts` one-liner and the curl block
  in `scripts/ci/web-e2e.sh`): web component tests (jsdom, mocked
  `apiClient.publicOrders`; a fresh QueryClient per test (`renderWithProviders`
  already creates one with `retry: false,
  gcTime: Infinity` but does not
  return it: use it or a small local wrapper); use the **real `ApiError` class**
  for 404/429/500/TypeError mapping; negative control proving the token reaches
  the mocked call): alias/no alias, partial payment, cancelled -> no pay
  section, no methods -> notice, no store number -> no button, slug mismatch ->
  invalid, hostile strings (`<img onerror>`, `javascript:alert(1)`, very long,
  RTL override) in alias/details/instructions render as inert text, no `<a>`
  whose href contains the token, wa.me href has no token/URL and is
  `encodeURIComponent`-ed, no account invitation markup; the view renders **no
  `<a>` with an href taken from the DTO** other than the fixed wa.me link
  (covers `trackingUrl`, already in the public DTO after #345) and no `<img>`
  for the packed photo (`packedPhotoAvailable`); the logo goes through
  `StoreLogo` (`next/image`, restricted `remotePatterns`), never a raw
  `<img src={store.logoUrl}>`, asserted by a
  `vi.mock("@/components/store-logo")` spy or a source grep for `<img` in
  `features/public-order`. Static guard test (`readFileSync` like
  `canonical-regression.test.ts`): assert the file exists, strip comments, then
  no `\bfetch\s*\(`, no `apiClient|@/lib/api-client`, and imports limited to
  `@/features/public-order`, `next`, `next-intl`, `react` (a fetch hidden in a
  helper would otherwise slip through). The `refetchOnWindowFocus` behavior is
  tested with fake timers + a `focus` event or not claimed. Robots/i18n
  parity/canonical-regression tests. Playwright axe spec (follow
  `apps/web/e2e/responsive.spec.ts` and `axe-helper.ts`; use the existing
  3-viewport projects, do not add viewports) on a never-issued token: assert the
  invalid-state heading/testid **and** that the `/public/orders/<token>`
  response was 404 (so it cannot pass on any 404 page); keep `retry: false`.
  Valid-state has **no browser e2e in CI** (`web-e2e.sh` only seeds base data):
  covered by component tests plus a manual check on a phone-width browser with a
  real seeded link (`/run`). Do not claim otherwise.
- **PR-S/PR4/PR5/PR6**: as in 4.3, 4.5, 4.6; PR5 e2e matrix: seller B asks store
  A's order via B's storeId (404), via A's storeId (403), B's storeId + A's
  orderId (404); a unit test that fails if `storeId` is missing from the related
  query's `where`; allow-list response test; legacy null-normalised rows
  included, bounded.
- Security cases across PRs: no id/seller fields publicly; identical 404 for
  unknown/revoked/malformed; token absent from Sentry events (PR-S) and Caddy
  logs (PR4).

Local verification (labelled planned until run): `pnpm --filter api test`,
`pnpm --filter api test:e2e` (or `scripts/ci/e2e.sh` for CI parity; storage
specs need MinIO and fail locally with ECONNREFUSED :9000, which is
environmental), `pnpm --filter web test`, `pnpm --filter web test:e2e`,
`pnpm lint`, `pnpm typecheck`, `bash scripts/ci/check-openapi-drift.sh`.

## 8. Risks and edge cases

- **Throttle behind Caddy** (D7): PR3 depends on #343. CGNAT: many mobile buyers
  share an IP; 30/min/IP can bite (after #343 the key is `CF-Connecting-IP`).
  Mitigation: `staleTime` 30s, no polling; limit unchanged (Q6).
- **500 on stamp failure** (#344 design): error state with retry, copy must not
  say "invalid link".
- **Concurrent regeneration of generated files**: regenerate on the current
  main, never hand-merge.
- **Cache layers**: route forced dynamic, headers asserted in CI on a production
  server; Cloudflare behavior is Q7.
- **`credentials`**: pass `omit` for this query only; never change the shared
  mutator. CORS stays the single `WEB_URL` origin.
- **SDK path does not encode the token**: tokens are base64url; the API rejects
  anything else with the same 404.
- **Raw SQL ids** are UUIDs while other ids are cuids (harmless).
- **PII**: masked phone, sanitised alias, delivery address line (already in the
  DTO allow-list) and store payment details; the seller-controlled free text is
  rendered as inert text. `paymentMethods[].details` is passed through by the
  API (existing); a future secret-ish key would leak: follow-up.
- **Rollback**: PR1/3/5/6 revert cleanly (PR1's revert restores the known 500
  race); PR3 is a blue/green redeploy with no stateful change; PR4 per 4.3.
- **Locale**: seller links are `/es/...`; `/en/...` works on the same route.
- **Pre-existing, not fixed here**: email comparison in `findOrCreateCustomer`
  is case-sensitive (a differently-cased email silently becomes a guest order);
  the Google create path races a checkout for the same email.
- **Throttle exhaustion is exploitable until #343 is live in production (Q10)**
  (checkout 10/min and the public GET 30/min are each one global bucket behind
  Caddy): #343's Caddy `trusted_proxies` must be limited to Cloudflare ranges so
  a direct-to-origin client cannot pick its own bucket; the token-bearing GET
  stays browser-side so it is throttled per visitor, never per web-container IP.
- **Advisory-lock stalls** are bounded by the checkout transaction timeout
  (Prisma default 5s) and only happen when `customerEmail` is present; optional
  hardening `SET LOCAL lock_timeout = '3s'` mapped to a guest result.
- **Pre-existing, out of scope**: phone squat (checkout with the victim's phone
  and the attacker's email creates the account the attacker can then verify;
  only an OTP proof of the phone fixes it); `POST /public/orders/:token/events`
  does not dedupe `INVITE_CLICKED`/`INVITE_DISMISSED` (a forwarded link can
  inflate funnel metrics; follow-up for D3/F2).
- **Token in the HTML / RSC payload**: `token` is a prop of the client
  component, so it lands in the document and `__next_f` payload; `no-store` +
  `no-referrer` keep that between the buyer and the server.
- **#345/#347 interplay**: the public DTO now carries `trackingNumber`,
  `trackingUrl`, a packed-photo flag and per-payment `voidedAt`; PR3 must not
  render the photo or any DTO-sourced href (tests in 7) until #270 designs it.
- **Hidden/unpublished stores**: the storefront still renders for them
  (`findPublicBySlug` ignores `isPublic`); the buyer page works for them too.

## 9. Acceptance criteria

1. [CI: component tests; manual: phone-width browser]
   `GET /es/store/{slug}/pedido/{validToken}` shows greeting/alias, status +
   timeline, items, total/adelanto/pagado/falta del adelanto, store data,
   "Pedido para +51 9** *** 321", the "no es tu numero" disclosure with contact
   button, how to pay or the no-methods notice, per-payment
   source/amount/date/status.
2. Unknown, revoked/regenerated, malformed and wrong-slug tokens render the
   identical invalid state with a contact path (locale-prefixed URLs; an
   unprefixed token containing a dot skips the intl proxy and gets Next's 404, a
   known edge: generated tokens never contain dots). [CI: component +
   Playwright]
3. Page responses (HTML, RSC, redirect) carry `Referrer-Policy: no-referrer`,
   `Cache-Control: no-store`, noindex (`X-Robots-Tag` + meta), frame denial,
   asserted against a production build in CI; `robots.txt` disallows
   `/*/store/*/pedido/*` [CI]; the route is in no sitemap [manual check of the
   sitemap sources, or add a sitemap test].
4. No third-party script/request from the route; no account invitation; no
   control that exposes the link; wa.me text has no token.
5. A no-JS fetch of the page URL does not stamp `linkFirstOpenedAt`. [CI: static
   guard that `page.tsx` has no fetch; manual: curl against a seeded link]
6. The token never appears in a Sentry/GlitchTip event produced by web (fake
   transport test) nor in Caddy logs (PR4 probe).
7. Two parallel checkouts for the same new phone (with and without an existing
   BuyerAccount, same and different emails) return 201/201 and leave one
   Customer, one BuyerAccount, one link; no account data crosses between the
   two.
8. Seller order detail lists the other orders of the same number, store-scoped,
   correct `total`.
9. `findAllForStore` hides orphan zero-order contacts, keeps registered ones.
10. Lint, typecheck, unit and e2e for the touched packages green locally and in
    hosted CI for every PR that has it; openapi drift script clean.

## 10. Open questions (each has a safe default)

- **Q1** Link-preview bots / first-open: default D1 (browser-only fetch, no API
  change).
- **Q2** Merge order: default as in section 5 (security requirement for PR3).
- **Q3** Closing #340 after PR4 is deployed and verified: default **do not close
  or comment on any issue without explicit approval** (#258 is already closed by
  someone else; nothing to post).
- **Q4** Open a tracking issue for "other orders of the same number"? Default
  no.
- **Q5** Keep #337 (PR6) and related orders (PR5)? Default: yes, as a Phase 2
  that is independent of the buyer page and is the first thing to cut if the
  user wants fewer PRs.
- **Q6** Raise the public GET throttle for CGNAT? Default no (revisit with
  traffic).
- **Q7** Is there a Cloudflare cache rule for `/pedido/*` and
  `/public/orders/*`? Default: rely on `no-store`; ask the user to confirm no
  "cache everything" rule.
- **Q8** Who closes #268? Default: PR3 uses `Refs #268`; the user closes it
  after the manual phone-width check and once PR-S/#343 are live (its acceptance
  list includes E1 coordination).
- **Q10** Is #343's Caddyfile change actually live in production? On the VPS
  compare `docker compose exec caddy sha256sum /etc/caddy/Caddyfile` with
  `sha256sum ~/biasmarket/Caddyfile` (and `caddy adapt` for `trusted_proxies`).
  If they differ the public throttle is bucketing by the proxy IP today. PR4
  changes production deploy tooling (a pre-cutover guard in `deploy.sh`, placed
  in `cmd_deploy` right after `assert_production_topology`, never inside canary
  or rollback: compare the host and container Caddyfile hash, `caddy validate`
  the new file, then `compose up -d --no-deps --force-recreate caddy` only if
  they differ, a 1-5 s blip on 80/443; named volumes `caddy_data`/`caddy_config`
  keep the certificates). Alternative: move the file to
  `infra/vps/caddy/Caddyfile` and mount the directory (needs a one-time recreate
  anyway, so keep the hash guard as a backstop). Default: implement the guard;
  **do not merge or deploy PR4 without the user's explicit approval** (deploy is
  supervised per `docs/core/deploy.md`). No existing tests cover `infra/vps`
  scripts: do not imply they do.
