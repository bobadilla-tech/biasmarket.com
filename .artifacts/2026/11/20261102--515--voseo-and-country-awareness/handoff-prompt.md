# Implementation handoff: #515 tuteo copy + voseo register + country awareness + international shipping flag

## Mission

Implement the reviewed plan at
`.artifacts/2026/11/20261102--515--voseo-and-country-awareness/plan.md` as a
series of small PRs. Read the plan fully first; it is the source of truth
(review-log.md is history, optional). The review log in the same folder is
history (optional). Read the repo `CLAUDE.md` hard rules (pnpm only, ESM, `.js`
imports in `apps/api`, web never imports `packages/db`, every tenant query
filters by `storeId` with ownership checks).

## Context

- Ticket: https://github.com/bobadilla-tech/biasmarket.com/issues/515 (epic
  #500). Original scope: unify Settings and WhatsApp default copy to neutral
  tuteo (Peruvian audience), sentence case, no dev strings, es + en updated.
- Expansion (owner): voseo variant of translations, store setting for buyer
  register, user setting for own dashboard register, voseo by buyer country (AR,
  UY, PY, CR, NI, HN, SV, GT), country detection, country dropdown with flags at
  signup, "ships internationally" on products.
- Base branch: `main`. Open PR #568 touches product/references UI (check before
  PR 5).
- Key paths: `packages/i18n/{index.ts,mobile.ts,es,en}`,
  `apps/web/{i18n,proxy.ts,app/[locale]}`, `apps/web/lib/auth-client.ts`,
  `apps/api/src/auth/auth.config.ts`, `packages/utils/src/phone-country`,
  `infra/vps/Caddyfile`, `packages/db/prisma`.

## Decisions already made

- Voseo is a **register** (`auto|tuteo|voseo`), not a locale: no `es-AR` URLs.
- `es/` stays tuteo; `es-voseo/` is an **overlay** deep-merged over `es`.
- Geo: **no API geo endpoint**. Web reads `cf-ipcountry` itself; web precedence
  cookie `bm_country` (explicit or account-seeded via one validated server
  route, HttpOnly) > CF header > null. No `Accept-Language` guessing.
- Flags are emoji. Country names via `Intl.DisplayNames`, client-only.
- Seller `countryCode`/`uiRegister` are better-auth additionalFields
  (`input:true`) validated with zod `validator.input`; no new user endpoint.
- Product flag is badge-only; **no checkout enforcement** in this work.
- `shipsInternationally` column `DEFAULT true` (existing rows and old-release
  inserts stay today's behavior); new code writes the flag explicitly; no
  backfill.
- Seller-facing payloads carry only a computed `recipientRegister`, never the
  buyer's country.
- Country-dependent output never goes in cacheable/static HTML.

## Reviewed plan (one PR per slice; branches and scope in plan section 5)

1. PR 1a `feat/copy-tuteo-515` (base `main`): copy pass, API strings, baseline
   count in PR body.
2. PR 1b `feat/i18n-guard-tests`: vitest in `@biasmarket/i18n`, unicode-aware
   voseo guard (1) + en/es parity (4) + fixtures,
   `ci.yml`/`docs/core/ci.md`/coverage/Codecov wiring.
3. PR 2 (after 1b) `feat/voseo-overlay-and-resolver`: overlay + guards 2/3/5,
   `resolveRegister`, memoized `getMessages`/`getMobileMessages`, `countries` +
   `parseCountry`.
4. PR 3 `chore/caddy-cf-ipcountry-hardening`: Caddy `@notcf` strip + log
   redaction in BOTH redaction blocks (global log and `(redact_log)`), own
   deploy step with `--force-recreate caddy` (see `docs/core/caddy.md`) and a
   production forged-header curl as the completion signal. The Q8 proof is a
   temporary Caddy echo of the `CF-IPCountry` REQUEST header (response `curl -I`
   cannot show it), plus a `cf-cache-status` check on the HTML. Do the Q8 proof
   (temporary echo route) and the `cf-cache-status` `curl -I` check first, and
   paste both outputs in the PR.
5. PR 4a `feat/register-data-and-settings`, then 4a-2
   `feat/buyer-country-and-scrub`, then PR 4b
   `feat/register-providers-and-signup-country` (scopes in plan section 5; 4b
   merges only after PR 3 is deployed; 4a and 4a-2 are not gated on it). Re-read
   plan 3.4/3.8 first; PR 4 is gated on that.
6. PR 5 `feat/product-ships-internationally`: migration with DEFAULT true (no
   backfill), DTOs, checkbox (no badge); then PR 5b `feat/product-country-badge`
   (needs 4a, 4b, 5): badge + public-DTO `shippingCountry`.
7. PR 6a `feat/whatsapp-register` (default WhatsApp builders in
   `packages/utils/src/whatsapp` take `register`; plan 3.10) after PR 2 and 4a-2
   merge; PR 6b `feat/api-error-register` only if the post-1a allowlist is
   non-empty. No buyer deletion path exists: do not add one. Buyer country goes
   through `PATCH stores/:slug/account/me`. Never block sellers or buyers by
   country (owner decision, Q5).

## Review findings to preserve

Country cookie: only via `POST /api/country` (Origin-checked, HttpOnly; DELETE
clears). Sentry: add a key-based redaction pass to
`packages/utils/src/sentry-scrub` (it only scrubs order-token URLs today).
Mobile: keep the merge helper in `packages/i18n/merge.ts`; PR 2 must pass a real
`pnpm --filter mobile` bundle/export.

Unicode regex for voseo (JS `\b` misses accented forms); dashboard layout is
`"use client"` so its provider is client-side (server `getTranslations` there
will not follow `uiRegister`; audit and record); Caddy strip must use
`not remote_ip <CF ranges>` (not `client_ip`), placed before the blue/green
`import`; web SSR to API bypasses Caddy; `input:true` auth fields bypass Nest
validation; `BuyerAccount.countryCode` must not leak into seller payloads and is
kept only while the account exists; do not add a deletion/retention path;
migrations must be additive and sort after `20261030010000`; new web must
tolerate old API (missing fields -> `auto`/false).

## Verification (planned, none run yet)

- Per PR: `pnpm turbo run lint typecheck test build --filter=<pkg>` (PR 1a:
  include `@biasmarket/utils`) for each touched package (`@biasmarket/i18n`,
  `@biasmarket/utils`, `api`, `web`, `mobile`).
- PR 1a: the shared unicode voseo regex (plan 3.3) over `packages/i18n/es`,
  `packages/utils/src/whatsapp` and `apps/api/src` returns 0.
- PR 3: `caddy validate`; curl with forged `CF-IPCountry` from a non-CF source
  ignored.
- PR 4/5: `pnpm db:generate`, migration on a populated throwaway DB (own
  Postgres on a non-default port, delete afterwards), old-release INSERT check,
  `pnpm --filter api
  generate:openapi && pnpm --filter @biasmarket/types generate`,
  `check-types-sdk-drift.sh`, api unit + e2e, web tests/e2e.
- Never claim a test passed unless you ran it.

## Acceptance criteria

Plan section 9, items 1-14b (verbatim), with the PR mapping at the top of that
section. Each PR meets its slice's share.

## Constraints and blockers

- Do not touch the `packageManager` pin. No `npm`/`yarn`.
- Stop and ask if: `cf-ipcountry` is absent at origin (Q8) and you want to keep
  IP geo; better-auth `validator.input` does not fire on `updateUser`; the
  dashboard relies on server translations extensively; any change would require
  checkout blocking.
- Open questions and defaults to use if unanswered: Q1 ANSWERED self-service
  `uiRegister`; Q2 `auto` default; Q4 emoji; Q5 ANSWERED badge only, never
  block; Q6 do not hide products; Q7 `en` ignores register; Q9 Caddy strip now,
  firewall restriction as a follow-up.
- Owner will enable Cloudflare IP Geolocation; still verify `cf-ipcountry`
  before PR 3 and keep the fallback chain.
- Do not edit production code in unrelated areas; do not merge PRs.

## Stack base policy

Open each PR against `main` once its parent has merged. If you must stack, base
on the parent branch, never push to `main`, and retarget with
`gh pr edit <n> --base main` after the parent merges. CI also runs on stacked
PRs (`ci.yml:8` comment: no `branches:` filter); wait for green CI before merge.
Dependency graph and draft-PR rule are in plan section 5.

## PR instructions

Open PRs in order using the repo PR format, titles like `feat(i18n): ...`, body
with summary, verification actually run, and the baseline count for 1a. End PR
descriptions with the attribution line the harness gives. Do not merge.

## First action

Run `git status` and confirm branch; read the plan; create `feat/copy-tuteo-515`
from `main`; re-count voseo with the unicode regex and start PR 1a.
