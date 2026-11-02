# Plan: #515 COPY-1 expanded: tuteo/voseo registers, country awareness, international shipping flag

Status: round 14 revision applied (round-13 findings). Review history: rounds
1-13 each found something until the end; rounds 10-12 each had one clean
reviewer and one with small findings; two consecutive fully clean rounds were
NOT reached, so treat remaining risk as small but nonzero (see review-log.md).
Start PR 1a, PR 3 and PR 5 now (5 has no badge); PR 1b after 1a; PR 2 after 1b;
PR 4a/4a-2/4b only after re-reading sections 3.4/3.8; PR 4b merges only after PR
3 is deployed; PR 6a only after 2 and 4a-2 merge; PR 6b only if 1a's allowlist
is non-empty (no other gate). review-log.md is history (optional). Ticket:
https://github.com/bobadilla-tech/biasmarket.com/issues/515 (epic #500, labels
frontend/copy) Base: `main`. Open PR #568 (`fix/store-references-publish-ui`)
touches product/references UI: re-check collisions before the product PR.

## 1. Context and outcome

Original #515: unify Settings copy and default WhatsApp messages to neutral
tuteo (audience is Peruvian), sentence case, no exclamation marks except buyer
messages, no dev-facing strings, es + en dictionaries updated.

Expansion requested by the owner on 2026-11-02 (reference: the ChatGPT voseo
thread pasted in the session; its country table is the source for section 3.2):

1. `es` stays neutral **tuteo**; add a **voseo** variant of the translation
   files.
2. Store setting "Tratamiento para compradores" (auto / tú / vos) for
   buyer-facing flows.
3. User-level preference for the seller's own dashboard ("internal config" for
   end users).
4. Buyer flows default to voseo by **buyer country** (AR, UY, PY, CR, NI, HN,
   SV, GT).
5. Location detection for specialization (flag now; per-country prices later;
   local-vs-international products).
6. Full country dropdown with flags at account creation.
7. "Ships internationally" checkbox on products.

Success: a Lima seller sees tuteo everywhere by default; a buyer arriving from
Argentina on a store set to "auto" sees voseo; sellers can force either; the
tuteo files contain zero voseo (proved by a unicode-aware guard test); the voseo
overlay is a validated override of the tuteo files.

## 2. Current behavior (facts verified in the session)

- `packages/i18n/index.ts` imports `en/*.json` + `es/*.json` per namespace
  (admin, blog, common, dashboard, for-sellers, landing, marketing, onboarding,
  storefront, coupons) into `messages`; `Locale = "es"|"en"`; `Messages` is the
  `as const` JSON type; `getMessages(locale)`. Mobile: `packages/i18n/mobile.ts`
  has its own `getMobileMessages(locale)` and `{en,es}/mobile.json`; built with
  `tsc && tsc -p tsconfig.mobile.json`. The package has **no test script**
  (`docs/core/ci.md` row ~63 lists it as "none").
- Web: `apps/web/i18n/{routing,request}.ts` (locales es/en, default es),
  `apps/web/proxy.ts` (next-intl middleware), next-intl ^4.14.2, Next 16.3.8.
  `[locale]/layout.tsx` hosts the root `NextIntlClientProvider` and uses
  `generateStaticParams`; marketing/landing pages are static. The **dashboard
  layout `(dashboard)/layout.tsx` is `"use client"`** (uses `useRequireAuth`).
  The **storefront layout is a server component** and fetches the store with
  `cache: "no-store"` (storefront routes are already dynamic).
- Mobile: `apps/mobile/src/i18n/mobile-i18n.tsx` seeds `Locale` from device
  locale.
- Voseo in `es/*.json` (rough grep): dashboard 3, onboarding 3, marketing 7,
  storefront 2, mobile 1 (issue says 19 in dashboard.json; PR 1a re-counts with
  the final regex and records the baseline). API: voseo strings in roughly 11-16
  services (rough count; PR 1a's scan is the source of truth) (e.g.
  `whatsapp-templates.service.ts:39` "No sos dueño de esta store"). API messages
  are hard-coded Spanish.
- `Store.locale` / `User.locale` exist (default "es"); `UpdateStoreDto.locale`
  `@IsIn(["es","en"])`; Settings locale select lives in
  `features/store-settings/components/profile-section.tsx`.
- No country field anywhere. `Address` has `region/city` only.
  `Store.locationLabel` is free text. Defaults currency PEN.
- Existing list `packages/utils/src/phone-country/index.ts`: 13
  `PHONE_COUNTRIES` (`iso,name,dialCode,flag` emoji) with tests.
  `packages/utils` has vitest.
- No geolocation anywhere. Infra: Cloudflare in front of Caddy
  (`infra/vps/Caddyfile` global block: `trusted_proxies static <CF ranges>`,
  `trusted_proxies_strict`, `client_ip_headers CF-Connecting-IP`). The origin is
  **publicly reachable** (ufw allows 80/443 from anywhere,
  `infra/terraform/cloud-init.yaml.tftpl:56-57`; compose publishes 80/443). Web
  server fetches reach the API through `INTERNAL_API_URL` (docker network,
  bypassing Caddy), so no CF header reaches the API on SSR calls
  (`apps/web/lib/api-client.ts:36-44`).
- Auth: better-auth 1.7.2-ish `additionalFields` in
  `apps/api/src/auth/auth.config.ts:129-143` (`plan`, `premiumUntil`, both
  `input:false`). Fields with `input:true` are accepted by
  `/api/auth/sign-up/email` and `/update-user` **without** Nest DTO validation
  (`forbidNonWhitelisted` in `main.ts:38` does not apply to better-auth routes).
  `users.controller.ts` has only an admin endpoint: no user self-update
  endpoint.
- Seller signup: `features/onboarding/components/signup-form.tsx` +
  `schemas/signup.schema.ts` (name/email/password) via
  `authClient.signUp.email`.
- Buyer: `BuyerAccount` (global) + per-store `Customer`; no country field.
- Product: no shipping scope; form
  `features/products/components/product-sheet.tsx`
  - `schemas/product-form.schema.ts`; API `create-product.dto.ts`.
- CI (`ci.yml:3-12`) runs on `pull_request` (no `branches:` filter, so stacked
  PRs with a non-main base get the same CI, per the comment at `ci.yml:8`) and
  on `push: main`. `docs/core/ci.md` ~63 and ~117-121: a workspace with a `test`
  script must be run by a single-line `ci.yml` step; `--passWithNoTests` banned;
  vitest `coverage.include` literal and Codecov flag required. The "7-place
  list" (ci.md ~202) is only for new path-filtered jobs.

## 3. Proposed design

### 3.1 Voseo is a register, not a locale

Keep `Locale = "es"|"en"` (no `es-AR` URL segments: avoids
URL/sitemap/hreflang/mobile forks). In `packages/utils/src/register`
(types/resolver) and `packages/i18n` (messages):

```ts
export const registers = ["tuteo", "voseo"] as const; // "usted": non-goal
export type Register = (typeof registers)[number];
export type RegisterSetting = "auto" | Register;
export const VOSEO_COUNTRIES = new Set([
  "AR",
  "UY",
  "PY",
  "CR",
  "NI",
  "HN",
  "SV",
  "GT",
]);
export function resolveRegister(
  i: { locale: Locale; setting?: RegisterSetting; country?: string | null },
): Register;
// locale !== "es" -> "tuteo"; setting tuteo|voseo wins; else VOSEO_COUNTRIES has
// upper-cased valid country -> "voseo"; else "tuteo"
getMessages(locale, register = "tuteo"); // minimal merge, cached per locale+register
getMobileMessages(locale, register = "tuteo"); // same, in mobile.ts
```

`resolveRegister`, `VOSEO_COUNTRIES` and the `Register` types live in
**`packages/utils/src/register`** (decided: `apps/api` depends on
`@biasmarket/utils` but not `@biasmarket/i18n`; utils exports `./*`).
`packages/i18n` imports and re-exports them. `resolveRegister` types `locale` as
`string` (utils must not import i18n: no cycle). The merge helper lives in its
own `packages/i18n/merge.ts` (not `index.ts`) so `mobile.ts` /
`tsconfig.mobile.json` (which includes only `mobile.ts`) never pull the web JSON
or a runtime `./index.js` import into Metro; `es-voseo/mobile.json` uses
`with {type:"json"}` like the existing imports; `utils/register` stays free of
Node APIs; utils builds before i18n in turbo. PR 2 signal also includes a real
mobile bundle: `pnpm --filter mobile exec expo export --platform android` (there
is no export script; paste the output in the PR), not typecheck alone. PR 2 adds
`@biasmarket/utils: workspace:*` to `packages/i18n/package.json` (it has no
dependencies today), fixes turbo build order, and its signal includes: i18n
`dist` and the `tsconfig.mobile.json` build resolve
`@biasmarket/utils/register`. A `DeepPartial` type + a small deep-merge helper
type the overlay; `Messages` stays the base type. Check `dist/` build and
`tsconfig.mobile.json` still pass.

### 3.2 Voseo country defaults (owner's reference)

Voseo by default (frequent enough for a casual e-commerce UI): AR, UY, PY, CR,
NI, HN, SV, GT. Tuteo by default: CL, CO, BO, VE, EC, MX, PA, PE (voseo is
regional or verbal-only; reachable via the explicit setting). Rioplatense forms
used in the overlay: Iniciá, Creá, Elegí, ¿Querés…?, Podés, tenés, sos, Contá.
"Usted" and a per-user three-way choice are future work; storing the setting as
a string (`auto|tuteo|voseo`) keeps that migration-free.

### 3.3 Translation files and guards

- `packages/i18n/es/*.json` = tuteo (the #515 deliverable).
- `packages/i18n/es-voseo/*.json` = **overlay** (only keys that differ; same
  namespace layout; includes `mobile.json`), deep-merged over `es`. Full copies
  rejected (double maintenance, silent drift).
- Guard tests (vitest in `packages/i18n`):
  1. tuteo files contain no voseo forms. Use a **unicode-aware** pattern
     (`(?<![\p{L}])(vos|sos|tenés|podés|querés|sabés|hacés|decí|mirá|contá|creá|
     iniciá|elegí|acá|…full seed list below)(?![\p{L}])`
     with the `u` flag; JS `\b` is ASCII-only and would miss accented forms),
     plus a **fixture test** proving every listed form is caught. The shared
     form list and regex live in `packages/i18n/guard/voseo-patterns.ts` (single
     source reused by 1a's `rg`, guard 1 and guard 5). Seed list (extend by
     triage):
     `vos, sos, tenés, podés, querés, sabés, hacés, ponés, venís, sentís, decí, mirá, contá, creá, iniciá, elegí, ingresá, seleccioná, escribí, usá, probá, revisá, buscá, completá, cambiá, agregá, guardá, confirmá, subí, cargá, esperá, andá, vení, acá, fijate`.
     Triage candidates with
     `rg -nPi '(?<![\p{L}])\p{L}{2,}(ás|és|ís)(?![\p{L}])'` and
     `'(?<![\p{L}])\p{L}{2,}[áíé](?![\p{L}])'`; a hit that is not a voseo
     second-person-singular form/pronoun or a rioplatense register marker (e.g.
     `más`, `después`, `café`, `aquí`) goes in
     `packages/i18n/voseo-allowlist.json`; `acá` is treated as a voseo-register
     marker (tuteo uses `aquí`).
  2. every overlay key path exists in `es` (a differing value is NOT required);
  3. ICU `{placeholders}` identical between `es` and overlay per key;
  4. `en` and `es` key parity.
  5. Completeness (mechanical, unicode-aware): for the buyer-checkout/login,
     dashboard-settings and seller-signup namespaces, every `es` string
     containing a second-person marker (tú imperatives such as
     `inicia|crea|elige|ingresa|selecciona|escribe|usa|dime`, or `tu|tus|te`,
     `puedes|tienes|quieres|eres`) must have an overlay key or be listed in
     `packages/i18n/overlay-allowlist.json` (reviewed in the PR). Covered
     namespaces/keys (the "screens" of this guard): `onboarding` (all),
     `storefront` (all), `common` (all), `dashboard.settings`, `dashboard.form`,
     `dashboard.shell`, `dashboard.actions`, `dashboard.notifications`, and all
     of `mobile.json`.
- The overlay must cover every screen listed in section 4 for buyer
  checkout/login, dashboard settings and seller signup; add a "no leftover tuteo
  marker" check for those namespaces (a short list of forms like
  `puedes|tienes|quieres|eres` must not appear in overlay-covered strings).

### 3.4 Where the register is resolved

`bm_country` is set by a visible "Cambiar país" control in the storefront footer
(PR 4b) that calls the single validated route handler `POST /api/country`
(`apps/web/app/api/country/route.ts`; the `api` prefix bypasses the next-intl
proxy matcher in `apps/web/proxy.ts`, so there is no locale redirect) and
refreshes. The route takes a JSON body, runs `parseCountry`, requires `Origin`
to equal the request host (or `Sec-Fetch-Site: same-origin`), rejects a missing
Origin, never accepts GET/query input, and answers 204 with the `Set-Cookie`.
`DELETE /api/country` clears it. Tests: cross-origin 403, missing Origin 403,
bad code 400, 204 with no redirect/no locale prefix, Set-Cookie flags (HttpOnly,
Secure, SameSite=Lax, Path=/, 30d). A stale account-seeded cookie after session
expiry or a Google login (neither calls the route) is accepted: it only affects
tone and badges, and an explicit change or the next login re-seeds it. The
account tier is **not** fetched per render: on buyer login and on saving the
buyer profile, the web calls that same server route to seed `bm_country` from
the account country (client JS never writes the cookie), so later server renders
see it through the cookie tier (no extra API call, no per-render latency). SSR
precedence is therefore cookie (explicit or account-seeded) > `CF-IPCountry` >
null. Add a dynamic-rendering assertion for storefront routes (only the `pedido`
page has `force-dynamic`; the layout merely uses `no-store` fetches).

Buyer / storefront:
`resolveRegister({locale, setting: store.buyerRegister, country})` with country
precedence (single shared function, unit-tested): `bm_country` cookie >
`CF-IPCountry` > null (the resolver has no account tier; the buyer's account
country reaches it by seeding the cookie, below). Seller forcing `tuteo|voseo`
wins over any country.

Mechanics (decided, not a probe):

- The **storefront layout (server)** resolves the register and wraps its subtree
  in a nested
  `NextIntlClientProvider locale messages={getMessages(locale, register)}`;
  server `getTranslations` in storefront pages gets the same via a small helper
  (`getRegisterTranslations`). It reads `headers()` / `cookies()`; this is free
  because storefront routes are already dynamic.
- **Marketing/landing/blog (static) never read country or register.**
  Country-dependent output is never server-rendered into cacheable HTML. Verify
  no Cloudflare "Cache Everything" rule applies to `biasmarket.com` HTML (PR 3
  checklist).
- **Dashboard** (`"use client"` layout): resolves `user.uiRegister` (+
  `user.countryCode` for `auto`) client-side and provides a nested client
  `NextIntlClientProvider` with merged messages. Accepted limit: server-side
  `getTranslations` inside the dashboard does not follow `uiRegister` (PR 4b
  grep lists any such call and either moves it client-side or documents it).
  Measure the bundle delta in PR 4b; `uiRegister` is only known client-side from
  the session (the layout is `"use client"`), so a server-side merge is not
  possible: ship the voseo overlay for the dashboard namespaces only and
  lazy-import it, and record the accepted tuteo-to-voseo flash after the session
  loads (or gate first paint on the session, which `useRequireAuth` already
  does). The storefront nested provider likewise passes only the namespaces the
  storefront routes use: `common`, `storefront` and `coupons` if checkout uses
  it (implementer confirms by grepping `useTranslations(`/`getTranslations(`
  under `app/[locale]/(storefront)` and
  `features/{storefront,checkout,cart,customer-auth,public-order}`), not the
  whole catalog, to avoid re-serializing everything into the RSC payload.
- Mobile consumes `getMobileMessages(locale, register)` where it already knows
  the buyer/user country; no new mobile UI in this work.

### 3.5 Location detection (no API geo module)

Round 1 dropped `apps/api/modules/geo` and `GET /api/geo/country`: web already
receives `CF-IPCountry` behind Caddy, the API's SSR calls bypass Caddy, and a
public endpoint adds an abuse surface plus OpenAPI/SDK regen.

- `packages/utils/src/geo`: `parseCountry(value: string | null | undefined)`:
  trims, upper-cases, accepts only ISO-3166 alpha-2 from the countries list,
  rejects `XX`, `T1`, arrays/garbage, returns `string | null`. Pure,
  unit-tested.
- `apps/web/lib/geo.ts`: `getRequestCountry()` (server only) reads
  `cf-ipcountry` from `headers()` then applies the cookie override
  (`bm_country`: **HttpOnly**, SameSite=Lax, Secure, Path=/, 30 days, set only
  by one validated server route/action that runs `parseCountry` and rejects
  cross-site `Origin`; it is set either by the explicit "Cambiar país" control
  or seeded from the buyer's account country on login/profile save; re-seeded
  when the account country changes and cleared on logout so a shared device does
  not carry buyer A's country to buyer B; nothing client-side reads it). Dev
  override env `GEO_DEV_COUNTRY` is simply ignored when
  `NODE_ENV === "production"` (no startup throw).
- Privacy: country is coarse personal data. Nothing stored for anonymous
  visitors except the opt-in override cookie. Update the privacy page. Add Caddy
  log redaction in **both** copies of the redaction block (the global default
  `log` and the `(redact_log)` snippet in `infra/vps/Caddyfile`):
  `request>headers>Cf-Ipcountry delete`, `request>headers>Cookie delete`,
  `resp_headers>Set-Cookie delete`; PR 3 verification makes a request with a
  known cookie value and greps the log for it (must be absent).
- **Caddy hardening (own PR, own deploy step, own revert):** direct-to-origin
  forging is real. In the `biasmarket.com` (web) site block add
  `@notcf not remote_ip <CF ranges>` and `request_header @notcf -CF-IPCountry`,
  placed in the `biasmarket.com {}` block of `infra/vps/Caddyfile` **before**
  its `import /etc/caddy/active/web.caddy` (the blue/green-managed upstream
  file); prove ordering works with the PR 3 curl check, not by reading. Do not
  use `client_ip` (it resolves the end user). Decision: `trusted_proxies static`
  takes literal ranges, so the new `@notcf` matcher repeats the literal list and
  a drift-check script `infra/vps/bin/check-cf-ranges.sh` (or an equivalent
  test) fails if the two lists differ; tie both to the "ranges copied
  2026-10-27" refresh note. Deploy with the exact command documented in
  `docs/core/caddy.md` (the `--force-recreate caddy` path), quoted verbatim in
  the PR. Defense in depth, owner decision Q9: restrict ufw 80/443 to Cloudflare
  ranges or enable Authenticated Origin Pulls (makes the strip redundant).
  Verify with `caddy validate` plus a curl to the origin with a forged header
  and with a CF-sourced request (staging or local Caddy container).

### 3.6 Country data and dropdown

- `packages/utils/src/countries`: static ISO-3166-1 alpha-2 code list (~249, PE
  and LatAm first, rest alphabetical), emoji flag derived from the code. Names
  are **not** hand-translated: components use `Intl.DisplayNames`
  **client-only** (render the select after mount, or pin the locale) to avoid
  server/client ICU hydration drift. `PHONE_COUNTRIES` stays as is (its tests
  keep passing); a parity test asserts its `iso` values are in the new list.
- Flags: **emoji** (zero dependency, same as `PHONE_COUNTRIES`). Windows
  Chrome/Edge show letters instead of flags: accepted for now (Q4); the flag
  lives in one component so swapping to SVG (`flag-icons`, pinned) later is
  cheap.
- Web `components/shared/country-select.tsx`: shadcn Command/Popover combobox,
  search by name in the UI language, flag + name, value = alpha-2. Tests assert
  only stable names (Peru, Argentina).

### 3.7 Data model (additive; each migration ships with the PR that uses it)

Schema: `packages/db/prisma/schema.prisma`; migrations:
`packages/db/prisma/migrations/<timestamp>_<name>/migration.sql`.

PR 4a migration:

```
User:         countryCode String?, uiRegister String @default("auto")
BuyerAccount: countryCode String?
Store:        buyerRegister String @default("auto"), countryCode String?
```

PR 5 migration:

```
Product: shipsInternationally Boolean @default(true)
  (DEFAULT true keeps today's behavior for existing rows and for old-release inserts; new code always writes the value; no data backfill)
```

Strings validated with `@IsIn`/zod (like `locale`), not Postgres enums.
Everything defaulted/nullable so the old release can still INSERT.
`Store.countryCode` is set from the owner's `countryCode` at store creation; a
single shared helper `resolveStoreCountry(store, owner)` = store.countryCode ??
owner.countryCode ?? "PE" lives in `packages/utils/src/register` (PR 4a) and is
used **only server-side**: the API computes a resolved `shippingCountry` and (in
PR 5b) exposes it on the public store DTO (owner `countryCode` is never
exposed), and the web storefront and badge consume `shippingCountry`. Migration
timestamps sort after `20261030010000`.

### 3.8 Auth and write paths

- Seller `countryCode` and `uiRegister`: better-auth `additionalFields` with
  `input: true`, set at signup (`signUp.email`) and edited via
  `authClient.updateUser` (there is no Nest user self-update endpoint; do not
  add one). Because these bypass class-validator, enforce allowlists with a zod
  `validator.input` on each field (verified present in the pinned better-auth
  1.7.10, Standard Schema, `dist/db/schema.mjs:77-78`, sync-only): countryCode
  upper-cased ISO alpha-2 or rejected; uiRegister in `auto|tuteo|voseo`.
  `validator.input` only fires when the key is present, so the DB column
  defaults (`auto`, null) cover the absent case. The web auth client
  (`lib/auth-client.ts`) must declare the fields via `inferAdditionalFields` so
  `session.user.uiRegister/countryCode` are typed. `role`, `plan`,
  `premiumUntil` stay `input:false`. Negative tests post `role`, `plan`,
  `uiRegister:"x"`, `countryCode:"<script>"` to sign-up and update-user.
- Buyer `countryCode`: optional field on the per-store buyer register DTO and on
  the existing `PATCH stores/:slug/account/me`
  (`customer-auth.controller.ts:181`, `UpdateCustomerProfileDto`), persisted to
  the linked `BuyerAccount`; `global-account.controller.ts` has no PATCH and is
  not wired into the storefront, so do not add one there. DTO + SDK regen. It
  must not appear in store-owner-visible customer payloads or exports. **No
  `BuyerAccount` deletion or retention path exists today**
  (`assisted-order-identity-retention` covers assisted orders only; no
  `buyerAccount.delete` in the API): this work does not add one; the privacy
  page describes only what actually happens (country kept while the account
  exists); a deletion/retention path is a separate follow-up recorded in the PR.
  The Google buyer "ask country once" prompt is a follow-up (non-goal).
- Store `buyerRegister`/`countryCode`: existing ownership-checked update path
  (`assertOwnership`), `UpdateStoreDto` + response DTO + mapper; OpenAPI + SDK
  regen.

### 3.9 Product shipping scope (field + badge only)

Checkbox "Se envía al extranjero" (label copy via i18n; default unchecked for
new products), DTO `@IsOptional() @IsBoolean()`, response DTO, mapper, SDK
regen. The storefront badge ships in PR 5b (not PR 5). It shows a badge "Solo
envíos dentro de {país}" (rendered by a **client** component, because the
country name comes from client-only `Intl.DisplayNames`) on local-only products
when the buyer's country is known and differs from `resolveStoreCountry`. The
badge is advisory: nothing is hidden and **checkout is not blocked**, and never
will be (owner decision). Enforcement is dropped (Q5) because the signal
(cookie/header) is client-influenceable and `Address` has no country; a real
rule needs a stored shipping-address country. Public product payloads expose the
flag read-only; writes only inside the `storeId`-scoped create/update.

### 3.10 Messages built outside the dictionaries follow the same register (owner request)

Rule: store setting first, then country, **unknown -> tuteo**. Never blocks
anything.

**6a. Default WhatsApp messages (the main surface).** The defaults are pure
builders in `packages/utils/src/whatsapp/index.ts` (e.g.
`buildDefaultPaymentReminderMessage`, `buildWhatsAppOrderMessage`, assisted-link
and buyer-notice builders; greeting "¡Hola ${alias}! 💜"), called mostly from
the **web dashboard in the browser** (`payments-page-client`,
`whatsapp-messages-section`, `buyer-notice-prompt`, `assisted-link-message`;
`contact-seller-button` is a storefront component) and once from the API
(`apps/api/src/modules/orders/application/create-order.usecase.ts:144`). The API
`whatsapp-templates` module is only CRUD for seller overrides. Plan:

- Builders take `register` as an **optional field on their input object (or an
  optional trailing `opts`), never a new positional argument** (current
  signatures are `(input, template?)`, and `BuyerNotice` is
  `(type, input, template?)`), default `"tuteo"`, so existing call sites and ~60
  tests keep compiling and returning tuteo; voseo variants are small string
  tables inside the builders. Fix the existing voseo ("Todavía tenés") in PR 1a,
  which therefore includes `packages/utils/src/whatsapp` in scope and in the
  voseo scan.
- Whose register? Messages are written by the seller **to** a buyer (payment
  reminder, assisted link, buyer notice): use the **recipient buyer's** register
  = `resolveRegister({setting: store.buyerRegister, country: buyerCountry})`.
  The buyer's order message **to the seller**: the API path
  (`create-order.usecase.ts:144`) uses the **store owner's** register
  (`user.uiRegister` + `user.countryCode`, available server-side); the
  storefront `contact-seller-button` builds its own message in the browser and
  uses the register the storefront layout already resolved (cookie > CF header >
  null, then the store's `buyerRegister`; see the 6a wiring decisions); the
  public store payload must not expose owner `uiRegister`/`countryCode`.
- `buyerCountry` (resolved **server-side only**) = `BuyerAccount.countryCode` if
  linked, else the country from the buyer's **phone dial code** through the
  existing private `countryForInternational` in `phone-country`, now exported
  and wrapped with a guard so `+1` (US/CA/DO/PR) never yields a country (it
  already returns null on no match; `parsePhoneValue`'s PE fallback is not used
  for this), else null -> tuteo. The API computes a per-customer
  **`recipientRegister`** (`"tuteo"|"voseo"`: store `buyerRegister`, then buyer
  country, then dial code, then tuteo) and exposes **only that value** in
  seller-facing customer/order payloads (never `BuyerAccount.countryCode`, which
  is global across stores, so seller A must not learn a country entered for
  store B; the exposed bit is constant when the seller forced a setting, and is
  otherwise accepted as one coarse bit). Web dashboard builders just pass
  `recipientRegister`. The API order use case resolves it from the order's own
  `store` and owner (never from request input). AC12 has a named test: store A
  vs store B payloads.
- Seller-authored custom templates render exactly as written.
- `create-order.usecase.ts:38` loads the store with a bare `findUnique`: 6a
  changes it to also
  `include: { owner: { select: { uiRegister: true, countryCode: true } } }`
  (read-only, still keyed by the store being ordered from; select only those two
  fields) so the owner's register can be resolved server-side.
- **6a wiring decisions.** `recipientRegister` is added to the seller-facing
  DTOs the builders' callers already consume:
  `apps/api/src/modules/orders/dto/order-response.dto.ts` (used by
  `payments-page-client`), `assisted-order-response.dto.ts` (used by
  `buyer-notice-prompt`, `assisted-link-message`, `created-order-screen`,
  `assisted-order-section`), and the seller customer DTO consumed by
  `features/customers` (implementer locates it from the customers controller);
  each mapper computes it server-side with the shared resolver.
  `whatsapp-messages-section` previews of the built-in defaults use the store's
  `buyerRegister` with `auto` -> tuteo (no buyer country exists in a settings
  preview) and label the preview accordingly. The storefront
  `contact-seller-button` is a client component under the storefront provider:
  it gets the register the storefront layout already resolved (cookie > CF
  header > null, then store setting), passed by prop/context, not an `auto`
  special case.
- Dial codes: add to `PHONE_COUNTRIES`
  `{iso:"CR",name:"Costa Rica",dialCode:"+506",flag:"🇨🇷"}` and the same shape
  for NI +505, HN +504, SV +503, GT +502, plus `NATIONAL_LENGTH` entries (8..8
  digits each) (PR 2). Export
  `countryForInternational(e164: string): PhoneCountry | null` unchanged and add
  `countryForBuyerPhone(value: string): string | null`, which requires an
  explicit `+`/`00` prefix (bare national numbers -> null), returns the ISO
  code, and returns null for `+1`. PR 2 also asserts the new 3-digit codes do
  not change `parsePhoneValue` for numbers starting `+50`. This widens phone
  validation (previously rejected numbers become accepted): state it in the PR
  and cover it in tests. AR +54, PY +595, UY +598 already exist.

**6b. API error messages (scoped, optional).** About 303 `new XException(` sites
exist (~207 with a string literal) and many web call sites show `err.message`
verbatim or match on it (`errorMessageKey`), so a global catalog is risky. PR 6b
is limited to an **explicit allowlist** of messages containing second-person
forms (found with the unicode regex), tuteo by default; a voseo variant is
applied **only** where a user is already in scope (authenticated seller:
`user.uiRegister` + `user.countryCode`), passed explicitly by the call site.
Public/unauthenticated errors are always tuteo. No request-scoped resolver or
exception-filter magic. Consumers that match on message text are left untouched.
A guard test asserts every catalog code has a tuteo variant. If the allowlist
turns out empty after 1a's tuteo pass, drop 6b.

### 3.11 Non-goals

No `es-AR`/`es-MX` locales, no "usted", no per-country prices/currency, no geo
vendor or IP database, no API geo endpoint, no `Accept-Language` region guess,
no hiding of products, **no checkout enforcement**, no Google-buyer country
prompt, no mobile settings UI/country picker, no API message i18n (API stays
Spanish, voseo -> tuteo), no `flag-icons`. Do not touch the `packageManager`
pin.

## 4. Files and components

Add: `packages/i18n/es-voseo/*.json`, register/merge/resolve code + vitest
config + tests; `packages/utils/src/{countries,geo}` + tests;
`apps/web/lib/geo.ts`, `components/shared/country-select.tsx`, nested register
providers (storefront server, dashboard client), migrations (PR 4a, PR 5); Caddy
snippet/matcher + log redaction; a short `docs/core/` note (via `update-docs`
later).

Change: `schema.prisma`; `auth.config.ts` (additionalFields + hooks);
`signup.schema.ts`/`signup-form.tsx`; buyer register form +
`customer-auth.controller` / `UpdateCustomerProfileDto` (not `global-account`);
store DTOs/mapper/service + `profile-section.tsx` (new select next to locale) +
account settings ("Tratamiento en mi panel"); store creation (set
`countryCode`); product
DTOs/mapper/`product-sheet.tsx`/`product-form.schema.ts`/product card badge; all
`es/*.json` + API services for the tuteo pass; `docs/core/ci.md` + `ci.yml` +
`vitest.config` + Codecov flag for i18n tests; `apps/api/openapi.json` +
`packages/types/generated/**`.

Remove: nothing.

## 5. PR stack

Slices are small and dependency-ordered. Open a PR against `main` as soon as its
parent has merged; stack on a parent branch only when waiting would block
progress, and then retarget to `main` after the parent merges. CI runs on
stacked PRs too, so no extra local-only rule is needed; the per-PR commands in
the table are what to run before pushing.

| PR      | Branch                                       | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Local verification (planned)                                                                                                                                                                                                 |
| ------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a      | `feat/copy-tuteo-515`                        | Original #515 only: es copy -> tuteo, API string fixes, placeholders, dev strings removed, en parity, WhatsApp defaults; re-count baseline written into the PR body (reviewer-checkable)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `pnpm turbo run lint typecheck test build --filter=api --filter=web --filter=@biasmarket/i18n --filter=@biasmarket/utils`; unicode regex over `packages/i18n/es`, `packages/utils/src/whatsapp` and `apps/api/src` returns 0 |
| 1b      | `feat/i18n-guard-tests`                      | Add vitest to `packages/i18n` (devDeps `vitest`, `@vitest/coverage-v8`, `@types/node`; scripts `test` = `vitest run`, `test:cov` = `vitest run --coverage`; `vitest.config.ts` mirroring `packages/utils/vitest.config.ts` with `coverage.include` = `["guard/**/*.ts"]` and modest thresholds; tests in `packages/i18n/guard/*.test.ts` read the JSON with `node:fs`; `tsconfig.json` stays `include: [index.ts]` for the build, and a `tsconfig.test.json` including `guard/**` is run by `typecheck`; the guard scans `es/` + `packages/utils/src/whatsapp` + `apps/api/src` using the shared patterns; `codecov.yml` gets an `i18n` flag), guard tests 1 (voseo, unicode-aware, with fixtures) and 4 (en/es parity) only; guards 2, 3 and 5 need the overlay and ship in PR 2. Wiring: the `i18n` job already exists (`ci.yml` ~637), no new path-filtered job (7-place list N/A); add a single-line `pnpm --filter @biasmarket/i18n test:cov` step (hygiene guard ignores multi-line `run: | `),`test -f packages/i18n/coverage/lcov.info`, Codecov upload, turbo`test:cov`outputs,`coverage.include`literal, move`i18n`from the "none" row to the coverage row in`docs/core/ci.md`,`check-workspace-scripts` tests       |
| 2       | `feat/voseo-overlay-and-resolver`            | `es-voseo` overlay for exactly the namespaces/keys listed under guard 5 (3.3) incl. all of `mobile.json`, `Register`/`resolveRegister`/memoized `getMessages` + `getMobileMessages`, `countries` (+ dial codes +502..+506 and exported `countryForInternational` plus new `countryForBuyerPhone`) + `parseCountry` in utils; pure code, no consumers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | i18n + utils tests, `--filter=mobile` typecheck/test, i18n build (`dist` + mobile tsconfig)                                                                                                                                  |
| 3       | `chore/caddy-cf-ipcountry-hardening`         | Caddy matcher strip + log redaction + `caddy validate` + curl checks; Q8/Q9 verification notes; own deploy step                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `caddy validate`, forged-header curl, CF-range drift check                                                                                                                                                                   |
| 4a      | `feat/register-data-and-settings`            | Migration (3.7 first block), auth fields + `validator.input` + `inferAdditionalFields`, store setting (adds `buyerRegister` and the store's own `countryCode` to `StoreResponseDto` at `store-response.dto.ts:8`, which `StorePublicDetailResponseDto` inherits: both are store settings and public-safe; the owner's `User.countryCode`/`uiRegister` are never added to any store DTO; mapper/service/UI), user setting, store creation sets country (`StoresService.create(ownerId, dto)` has no user object: look up `User.countryCode` by `ownerId` or pass it from `session.user` in the controller), `resolveStoreCountry` helper only (the public-DTO `shippingCountry` field is added in PR 5b, not here), SDK regen. Signal: negative signUp AND updateUser tests fail before the validator and pass after                                                                                                                                                                             | api unit + e2e, web tests, migration-safety, `check-types-sdk-drift.sh`                                                                                                                                                      |
| 4a-2    | `feat/buyer-country-and-scrub`               | Needs 4a: buyer `countryCode` on `PATCH stores/:slug/account/me` + register DTO, no-leak tests (absent from seller-facing payloads/exports), a **new key-based pass** in the shared `packages/utils/src/sentry-scrub` (today it only scrubs order-token URLs; it has no key/header redaction) that redacts `request.cookies`, `request.headers.cookie`, `cf-ipcountry` and `set-cookie` case-insensitively and strips any `countryCode` in user/extra, with table-driven tests on a fixture event (tests live in the shared package, not the app copies; web `instrumentation*.ts`, api and workers `error-tracking.ts` already consume it), SDK regen                                                                                                                                                                                                                                                                                                                                          | api tests, SDK drift                                                                                                                                                                                                         |
| 4b      | `feat/register-providers-and-signup-country` | Needs 4a-2 and PR 3 deployed: `lib/geo.ts`, storefront + dashboard providers, `country-select`, seller signup + buyer register country field, privacy page update, dashboard/storefront `getTranslations` audit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | web tests, web-e2e (cookie-driven), static-pages-still-static check                                                                                                                                                          |
| 5       | `feat/product-ships-internationally`         | Migration `ADD COLUMN "shipsInternationally" BOOLEAN NOT NULL DEFAULT true` (existing rows and old-release inserts become `true` = current "sells anywhere" behavior; no backfill, no race); new API/web always write the flag explicitly (form default unchecked); DTOs (seller `ProductResponseDto`, create/update DTOs, and read-only `shipsInternationally` on the public shapes `PublicProductWithVariantsResponseDto` in `apps/api/src/modules/stores/dto/store-response.dto.ts` and `apps/api/src/modules/products/dto/product-search-response.dto.ts`; mappers updated), checkbox, SDK regen. **No badge here** (it needs buyer country from 4b and store country from 4a). Independent: only needs `main`. Record in the PR body that old releases/mobile/API clients read `true` while new web writes `false`                                                                                                                                                                         | api tests incl. tenant isolation (`shipsInternationally` update with another store's productId -> 404), web tests, SDK drift, migration on populated DB                                                                      |
| 5b      | `feat/product-country-badge`                 | Needs 4a, 4b and 5: badge "Solo envíos dentro de {país}" (client component), public store DTO `StorePublicDetailResponseDto` (`apps/api/src/modules/stores/dto/store-response.dto.ts:412`, `extends StoreResponseDto`; the shape the storefront layout fetches) gains API-computed `shippingCountry`; the badge reads `shipsInternationally` from the public product payloads added in PR 5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | web tests incl. `product-badge.test.tsx`, api test that the public store payload exposes `shippingCountry` but not owner `countryCode`/`uiRegister`                                                                          |
| 6a      | `feat/whatsapp-register`                     | Section 3.10 6a: optional `register` on `packages/utils/src/whatsapp` builder inputs, `recipientRegister` DTO + mapper + SDK regen + drift check on seller-facing customer/order payloads, web call sites, API order use case; needs PR 2 (resolver, dial codes) and 4a-2 (`BuyerAccount.countryCode` populated; it is nullable otherwise) merged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | utils + web + api tests, SDK drift, section 9 items 11-13                                                                                                                                                                    |
| 6b      | `feat/api-error-register`                    | Section 3.10 6b allowlist only (optional)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | api unit tests, catalog guard                                                                                                                                                                                                |
| dropped | (never)                                      | Checkout enforcement: owner decided never to block sellers or buyers by country                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | n/a                                                                                                                                                                                                                          |

Dependency graph: 1a -> 1b -> 2 (PR 2's guards need PR 1b's vitest setup); 2 ->
4a -> 4a-2 -> 4b -> 5b (5b also needs 5; 4b also needs PR 3 deployed); 2 + 4a-2
-> 6a; 6b has no code dependency on 6a (only on 1a's non-empty allowlist); 3 and
5 are independent (5 only needs main, and ships no badge; 3 only needs Q8
evidence). Independent PRs (3, 5) may be developed in parallel; open stacked PRs
as **drafts** on the parent branch and retarget to `main` after the parent
merges. PRs 3, 4a and 6a/6b touch security-relevant or API code: wait for green
CI before merge.

## 6. Sequenced steps and completion signals

1. PR 1a: baseline counted, regex recorded. Signal: zero matches, `en`/`es`
   parity ok.
2. PR 1b: guards 1 and 4 green; a deliberately seeded voseo string and a
   deliberately missing `en` key each fail them.
3. PR 2 (also ships guards 2, 3, 5): `getMessages("es","voseo")` returns overlay
   value for an overlay key and the tuteo value for a non-overlay key; same for
   mobile; builds green.
4. Before PR 3: prove `CF-IPCountry` reaches the origin (it is a REQUEST header
   Cloudflare adds toward the origin, so a response `curl -I` can never show
   it): deploy a temporary Caddy
   `respond /__geo "{http.request.header.CF-IPCountry}"` test path (or a
   temporary Next route logging the header), `curl https://biasmarket.com/__geo`
   from two countries/VPN, then remove it; and check
   `curl -sI https://biasmarket.com/` for `cf-cache-status` (must be
   `DYNAMIC`/absent on HTML) (Q8; owner will enable Cloudflare IP Geolocation,
   which should be free on all plans: confirm the toggle in the dashboard) and
   no Cache Everything rule on HTML; paste the output in the PR 3 description
   (if `cf-ipcountry` is absent: drop IP geo, keep cookie/account country, tell
   the owner). Signal for PR 3: forged header from a non-CF source is not
   visible to web; CF-sourced is.
5. PR 4a/4a-2: settings round-trip with ownership checks; (the audit of
   storefront pages calling `getTranslations` directly and of the dashboard
   belongs to PR 4b, see step 7); `inferAdditionalFields` added to
   `lib/auth-client.ts`; negative auth tests green; dashboard
   server-`getTranslations` audit recorded.
6. PR 5: additive migration with `DEFAULT true` on a populated throwaway DB
   (old-release insert check:
   `INSERT INTO "Product" (<required columns, omitting shipsInternationally>) ...; SELECT "shipsInternationally"`
   returns `true`): existing rows read `true`, an old-release insert (omits the
   column) reads `true`, and new-code inserts write the flag explicitly (form
   default unchecked -> `false`). Optional later contract migration
   `SET DEFAULT false` after the old release is retired (not required, new code
   always writes the value).

7. PR 4b: matrix e2e (cookie AR + store `auto` -> voseo; cookie AR + store
   `tuteo` -> tuteo; PE -> tuteo; dashboard follows `uiRegister`), static
   marketing routes still static in build output, bundle delta recorded in the
   PR.
8. PR 6a: AC11-13 green; `rg` over all builder call sites
   (`payments-page-client.tsx`, `whatsapp-messages-section.tsx`,
   `buyer-notice-prompt.tsx`, `assisted-link-message.ts`,
   `create-order.usecase.ts:144`) shows none passes a positional register; all
   ~60 existing builder tests pass unmodified (tuteo default).
9. PR 6b (only if non-empty after 1a): allowlist listed in the PR; `rg` shows
   none of the changed message literals is matched by web code (`message ===`,
   `includes(`, `errorMessageKey` maps).
10. PR 5b: badge appears only when buyer country is known and differs from
    `shippingCountry` (`product-badge.test.tsx`); public store payload has
    `shippingCountry` and no owner fields.

## 7. Test strategy

- Unit (pure): `resolveRegister` full matrix (en, forced, auto x 8 voseo
  countries, non-voseo, null, lower/garbage codes), country precedence order
  (cookie > CF > null; account-seeded cookie re-seeded on change and cleared on
  logout), `parseCountry` (valid, lowercase, `XX`, `T1`, array, empty),
  `resolveStoreCountry`, countries list integrity (unique codes, flag
  derivation, `PHONE_COUNTRIES` parity), overlay guards, unicode regex fixture.
- Tenant isolation (named): seller A PATCHing store B's
  `buyerRegister`/`countryCode` -> 403; one `BuyerAccount` linked to two stores'
  `Customer` rows, seller A's customer/order payloads never contain the buyer's
  country and `recipientRegister` follows store A's setting, differing from
  store B's; `shipsInternationally` update with another store's productId -> 404
  under `storeId` scoping; public store payload contains neither `uiRegister`
  nor owner `countryCode`; seller exports/CSV contain no `countryCode`.
- API: store PATCH new fields (invalid value 400; non-owner 403; owner ok);
  product create/update with `shipsInternationally` under `storeId` isolation
  (foreign store product 404/403); auth hook negatives
  (role/plan/uiRegister/countryCode); buyer account country PATCH + not leaked
  in seller customer payloads; new web tolerates old API without new fields
  (defaults `auto`/false).
- Web: country-select (search, selection, keyboard, client-only names;
  `Intl.DisplayNames` output depends on the ICU build, so pin the locale and
  assert only stable fragments like `/Per/` and `/Argentina/`, or inject a
  name-resolver fake), signup submits `countryCode`, providers render voseo vs
  tuteo for the same component, store setting form, product checkbox default
  off, badge logic (named unit test `product-badge.test.tsx`: shown only when
  buyer country is known and differs from `resolveStoreCountry`).
- E2E cap: at most 2-3 flows (ci.md rate limits ~10/min; each test creates its
  own store via the seller API with a unique phone, per ci.md); set `bm_country`
  with `context.addCookies` for the host in `apps/web/playwright.config.ts`
  `baseURL` (`localhost:3001`, so cookie domain `localhost`, not `127.0.0.1`;
  the cookie is HttpOnly and is set through `POST /api/country`, so set it via
  that route in the test, not `addCookies`, unless Chromium accepts the `Secure`
  flag over http there, else `secure:false` in e2e only). The "dashboard follows
  `uiRegister`" flow creates its own throwaway seller (the shared
  `e2e/.auth/seller.json` seller must not be mutated; `workers: 1`). (kept
  small; Playwright cannot set CF headers on Next SSR fetches): drive via the
  `bm_country` cookie and the store setting only: AR cookie + `auto` -> voseo;
  AR cookie + store `tuteo` -> tuteo; PE -> tuteo; dashboard follows
  `uiRegister`. Header parsing is covered by unit tests.
- Migration: populated DB apply + old-release insert; existing rows read `true`;
  explicit writes honored.
- Infra: `caddy validate`, forged-header curl.
- Failure/boundary/security additions: `parseCountry` rejects
  `bm_country=<script>` and junk on the cookie read path; storefront responses
  that depend on the cookie are dynamic/`private`; static marketing pages still
  build as static (build output check that they are not marked dynamic);
  old-API/new-web and new-API/old-web payload tolerance;
  `BuyerAccount.countryCode` absent from seller-facing payloads/exports;
  countryForInternational never returns a country for `+1` or bare national
  numbers.
- Security: forged `CF-IPCountry` ignored at origin; no raw IP stored/logged;
  cookie flags asserted.

## 8. Risks and edge cases

- Cache poisoning: country-dependent output must never be in cacheable HTML (3.4
  rule).
- Header spoofing: Caddy matcher + Q9 firewall option; strip lives in a separate
  deploy step. Per `docs/core/caddy.md` and `docs/core/deploy.md` a merged
  Caddyfile change does NOT take effect on `reload` (single-file bind mount
  keeps the old inode): PR 3 must run
  `docker compose up -d --force-recreate caddy` (through the documented path),
  confirm with `docker exec ... cat /etc/caddy/Caddyfile`, merge the Caddyfile
  change alone after other pending deploys, and its completion signal is a
  forged-header curl against production. Revert = revert commit +
  force-recreate. `request_header` runs before `reverse_proxy` by Caddy's
  directive order wherever it sits in the block; keep the matcher before the
  `import` for readability and prove the web upstream really sees no header with
  a local echo upstream. `trusted_proxies` takes a literal list, so "define CF
  ranges once" = a snippet used by the new matcher plus a drift check against
  the global block.
- VPN/travelers/expats: override cookie; country only picks tone/badges, never
  blocks.
- Blue/green: additive migrations; real order per
  `docs/core/deploy.md`/`blue-green-migrations.md` (migrate in the candidate
  phase, candidate color up, then Caddy switch), new web must work against the
  old API and the reverse during the color overlap (deploy.sh brings both colors
  up together; do not rely on "api first"); new web defaults missing fields
  (`buyerRegister`, `uiRegister`, `countryCode`, `shipsInternationally`) and new
  web `register` args must work against an old API; `inferAdditionalFields` must
  tolerate a session lacking the fields. Rollback: columns can stay; revert
  Caddy separately.
- Backfill race: a product created by the old release between migration and
  deploy gets `true`, which is today's behavior (no race; no post-cutover
  backfill step; optional later `SET DEFAULT false` contract migration).
- `resolveStoreCountry` fallback to "PE" is an assumption (matches default
  currency PEN).
- Mixed register on a screen if overlay is incomplete: guard 3.3 + reviewer
  screen list.
- `en` UI ignores register.
- Impersonation: `session.user` is the target user, so the target's
  `uiRegister`/`countryCode` apply to the impersonated UI; decision: block
  `updateUser` writes of these two fields while impersonating (an admin must not
  change the target's preferences by accident); add a negative test.
  Admin-plugin create/update-user calls take free-form `data`: add one negative
  test that a bad `countryCode`/`uiRegister` is rejected there too (or record
  the admin path as trusted).
- Access logs would otherwise record `CF-IPCountry` and `bm_country`: redaction
  in PR 3.
- PII: country on `User`/`BuyerAccount`; privacy page states country is kept
  while the account exists (no buyer deletion path exists; follow-up).
- Hydration: `Intl.DisplayNames` client-only; never render different text server
  vs client.

## 9. Acceptance criteria

PR mapping (exact): AC1 -> 1a (signal: the `rg` command; guard lands in 1b);
AC2, AC3 -> 2; AC4, AC5 -> 4a; AC6 -> 4a (signUp/updateUser negatives), 4a-2
(buyer PATCH negative) and 4b (dropdown count test); AC7a (forged header, log
redaction; manual evidence pasted in the PR, no CI) -> 3; AC7b (cookie flags,
Sentry scrub, no IP column) -> 4a-2/4b; AC8a (field persisted/returned, default
semantics) -> 5; AC8b (badge) -> 5b; AC9 -> 4a, 4a-2, 5 (SDK regen + drift) and
the old-release insert check; AC10 is a standing rule for every PR; AC11-13 ->
6a; AC14a -> 2; AC14b -> 6b.

1. Zero voseo matches, checked case-insensitively with
   `rg -nPi --glob '!**/*.{spec,test}.ts' '<unicode regex from 3.3>' packages/i18n/es packages/utils/src/whatsapp apps/api/src`
   (comments count; legitimate hits go in a reviewed allowlist file at
   `packages/i18n/voseo-allowlist.json`); 1a's signal is that command returning
   nothing, the guard test lands in 1b. Scope: in `packages/i18n/es/**`,
   `packages/utils/src/whatsapp/**` and `apps/api/src/**/*.ts` text (comments
   included) (exact scan: the guard's regex run with `rg -nP` over those paths,
   excluding `*.spec.ts`/`*.test.ts`); guard test fails on seeded voseo.
2. `es-voseo` overlay exists, each key resolves in `es`, placeholders match;
   `getMessages`/`getMobileMessages` accept `register`; `en` unaffected.
3. `resolveRegister` returns voseo for AR/UY/PY/CR/NI/HN/SV/GT under `auto`,
   tuteo for others/null, forced wins.
4. Store owner sets buyer register (Auto/Tú/Vos); non-owner 403; stored via
   ownership-checked update.
5. Seller sets panel register independently (`updateUser`), validated by hook.
6. Seller signup and buyer account creation include a searchable country
   dropdown with flags listing exactly every code in `COUNTRIES` (a test asserts
   the rendered option count equals the list length); invalid codes rejected
   server-side.
7. `CF-IPCountry` is read only in web, only trusted behind Caddy (forged origin
   header proved ignored); `bm_country` cookie flags correct; `CF-IPCountry`
   header and `Cookie` are redacted in Caddy logs (existing client-IP logging is
   unchanged); the shared Sentry scrub tests (fixture event with cookie,
   `cf-ipcountry`, `set-cookie`, `countryCode`) pass;
   `rg -n -i "ipaddress|remote_?ip|\bip\b"` over the PR's migration diff returns
   nothing; Sentry scrub tests cover `apps/web/instrumentation*.ts`,
   `apps/api/src/common/error-tracking.ts` and the workers copy via the shared
   `packages/utils/src/sentry-scrub`.
8. (8a, PR 5) Product form has "ships internationally" (unchecked for new
   products which are written `false` explicitly; existing products read `true`
   via the migration default); persisted/returned; no checkout blocking. (8b, PR
   5b) the badge shows only when the buyer country is known and differs from
   `shippingCountry`.
9. Migrations additive, old-release INSERT works, openapi + SDK regenerated,
   drift script green.
10. i18n package test wiring passes the workspace-scripts guard; for every PR,
    `pnpm turbo run lint typecheck test build` is green for the packages it
    touches (`@biasmarket/i18n`, `@biasmarket/utils`, `api`, `web`, `mobile`, as
    applicable).
11. (6a) Builders given `register: "voseo"` return voseo for every default
    template, given nothing return tuteo; custom seller templates are
    byte-identical to input.
12. (6a) Unknown country, missing phone, bare national number, and `+1` numbers
    all resolve to tuteo; `+54...` resolves to voseo under `auto`; store
    `buyerRegister: "tuteo"` overrides `+54`; store A's setting never affects
    store B's messages.
13. (6a) The order message to the seller built by the API uses the owner's
    register (the storefront `contact-seller-button` uses the layout-resolved
    register: cookie > CF header > null, then the store's `buyerRegister`);
    payment reminders, assisted links and buyer notices use the recipient
    buyer's register. 14a. (PR 2) The new dial codes (+502..+506) validate in
    `validatePhone`, existing PE/AR/etc. cases still pass, `parsePhoneValue` for
    `+50...` numbers is unchanged. 14b. (6b) every catalog code has a tuteo
    variant, and the section 6 step 9 `rg` check shows no consumer matching on
    the changed message text.

## 10. Open questions (each has a safe default)

- Q1. ANSWERED (owner): seller self-service `uiRegister`; admin table may
  display it.
- Q2. Default `uiRegister`: `auto` (from `User.countryCode`; unset -> tuteo).
- Q3. Ship copy-only PR 1a first and alone. Default yes.
- Q4. Flags: emoji (default) vs `flag-icons`.
- Q5. ANSWERED (owner): never block sellers or buyers. Badge only; enforcement
  dropped, not just deferred.
- Q6. Hide local-only products from foreign buyers: default no.
- Q7. `en` users: register ignored. Default yes.
- Q8. ANSWERED (owner): will enable Cloudflare IP Geolocation and wants a
  fallback. Fallback is already in the design (web: cookie > CF header > null;
  API-side messages: account country > phone dial code > tuteo). Still verify
  before PR 3: Cloudflare IP Geolocation active (`cf-ipcountry` reaches origin)
  and no Cache Everything rule. Default: assume yes, verify with the temporary
  echo path above; if absent, web geo degrades to the `bm_country` cookie
  (explicit or account-seeded) only.
- Q9. Restrict ufw 80/443 to Cloudflare ranges or Authenticated Origin Pulls
  (default: Caddy strip now, firewall follow-up).
