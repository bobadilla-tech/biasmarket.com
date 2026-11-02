# Review log: #515 voseo / country plan

Reviewer reports are model output, treated as claims; the ones below were
checked against the files each cites (repo fit and security reviewers read the
repo; their file:line cites are carried into the plan as facts only where listed
in plan section 2).

## Round 1 (draft -> revision 1)

| #  | Lens                             | Sev          | Finding                                                                                                                                   | Decision | Plan change                                                                                                       |
| -- | -------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| 1  | repo fit                         | blocking     | `\b` is ASCII-only: accented voseo forms (tenés, podés) are not matched, guard would pass with voseo present                              | fix      | 3.3 unicode lookaround + `u` flag + fixture test; AC1                                                             |
| 2  | repo fit                         | blocking     | Dashboard layout is `"use client"`; cannot host a server provider                                                                         | fix      | 3.4 explicit client-side provider for dashboard; limit documented; audit step in PR 4                             |
| 3  | repo fit + security              | blocking     | No user self-update endpoint; `input:true` additionalFields bypass DTO validation; "PATCH, not signup" contradictory                      | fix      | 3.8 additionalFields + `databaseHooks` validation, `updateUser`; negative tests                                   |
| 4  | repo fit + simplicity + security | blocking     | `shipsInternationally=false` default plus checkout enforcement breaks existing stores; signal is client-forgeable; Address has no country | fix      | 3.9 badge only, enforcement deferred (Q5); backfill existing products true                                        |
| 5  | security                         | blocking     | Caddy strip under-specified: bare `request_header -` strips CF traffic too; origin is publicly reachable (ufw 80/443 open)                | fix      | 3.5 `@notcf not remote_ip`, don't use `client_ip`, single range list, Q9 firewall option, own PR/deploy step      |
| 6  | security + repo fit              | blocking     | Web SSR to API uses `INTERNAL_API_URL`, bypasses Caddy; header not forwarded; API cannot tell it came via Caddy                           | fix      | 3.5 geo endpoint dropped; web reads header itself; `parseCountry` shared util                                     |
| 7  | simplicity                       | blocking     | PR 1 mixes copy fix with a new test runner and CI wiring                                                                                  | fix      | split 1a / 1b                                                                                                     |
| 8  | simplicity                       | blocking     | Playwright cannot set CF header on Next SSR fetches; e2e mechanism undefined                                                              | fix      | 7 e2e via `bm_country` cookie + store setting; header parsing unit-tested                                         |
| 9  | simplicity + security + repo fit | blocking     | SSR vs client country/hydration/cache left as a "probe"                                                                                   | fix      | 3.4 decided: storefront server (already dynamic), static pages never read country, no cacheable HTML with country |
| 10 | security                         | important    | `Vary: CF-IPCountry` is ignored by Cloudflare                                                                                             | fix      | endpoint removed; cache rule check in step 4 / Q8                                                                 |
| 11 | security                         | important    | Country in access logs and cookie flags                                                                                                   | fix      | 3.5 log redaction, cookie SameSite/Secure/30d, privacy page                                                       |
| 12 | security                         | important    | `BuyerAccount.countryCode` exposure to sellers/exports and retention path                                                                 | fix      | 3.8 buyer notes, 7 test                                                                                           |
| 13 | security                         | important    | CI wiring for i18n tests: ci.md rules, coverage.include, Codecov flag, workspace-scripts guard                                            | fix      | PR 1b scope; plan section 2 cites the right rule (not 7-place list)                                               |
| 14 | security                         | important    | Stacked PRs lack CI; security PRs unchecked                                                                                               | fix      | 5 stack policy: PR 3/4 need CI on main base before merge                                                          |
| 15 | simplicity                       | important    | 7-PR stack; dead code PRs; migrations away from consumers                                                                                 | fix      | 5 slices re-cut: migrations ship with consumers; drop standalone DB PR                                            |
| 16 | simplicity                       | important    | Drop `Accept-Language` fallback                                                                                                           | fix      | 3.5 chain now cookie > account > CF > null                                                                        |
| 17 | simplicity                       | important    | `flag-icons` dependency for a Windows-only issue                                                                                          | fix      | 3.6 emoji default, swap is one component; Q4                                                                      |
| 18 | repo fit                         | important    | `getMessages` typing (DeepPartial), mobile `getMobileMessages`, `resolveRegister` location                                                | fix      | 3.1                                                                                                               |
| 19 | repo fit                         | important    | Country names via `Intl.DisplayNames` risk hydration mismatch; plan contradicted itself                                                   | fix      | 3.6 client-only                                                                                                   |
| 20 | repo fit                         | important    | Buyer country has no DTO/endpoint step; Store.countryCode never written                                                                   | fix      | 3.7/3.8 buyer PATCH, store creation sets country, shared helper                                                   |
| 21 | repo fit                         | important    | R1 stale: storefront already `no-store`                                                                                                   | fix      | 2 + 3.4                                                                                                           |
| 22 | simplicity                       | important    | "overlay differs from es" test forces churn                                                                                               | fix      | 3.3 guard 2 only requires key existence                                                                           |
| 23 | simplicity                       | important    | Register matrix is pure logic, belongs in unit tests                                                                                      | fix      | 7                                                                                                                 |
| 24 | security                         | non-blocking | `GEO_DEV_COUNTRY` must never be live in prod                                                                                              | fix      | 3.5 throws in production                                                                                          |
| 25 | simplicity                       | non-blocking | memoize `getMessages`                                                                                                                     | fix      | 3.1                                                                                                               |
| 26 | repo fit / simplicity            | non-blocking | PR row 0 no-op; impersonation behavior unstated                                                                                           | fix      | removed; 8 states default                                                                                         |
| 27 | security                         | non-blocking | Caddy changes via `reload`, not blue/green; revert separately                                                                             | fix      | PR 3 own deploy step                                                                                              |
| 28 | repo fit                         | important    | Google buyer "ask country once" needs an endpoint                                                                                         | defer    | 3.10 non-goal                                                                                                     |

Not verified in this session by running code: all of the above were desk
reviews. Planned probes (Q8 curl, `caddy validate`, better-auth hook support in
the pinned version) are implementation-session tasks and marked as such in the
plan.

## Round 2

Fresh-eyes reviewer (did not read this log) found no blocking issues; cited
paths/lines verified against the repo (api-client.ts:36-42,
auth.config.ts:129-143, cloud-init:56-57, ci.md:63, main.ts:38, storefront
server layout, dashboard `"use client"`, better-auth 1.7.10 with
`validator.input` and `databaseHooks`). Important findings, all applied:

| #  | Sev          | Finding                                                                   | Decision | Plan change                                      |
| -- | ------------ | ------------------------------------------------------------------------- | -------- | ------------------------------------------------ |
| 29 | important    | Migration/schema paths not stated                                         | fix      | 3.7 paths                                        |
| 30 | important    | Auth client needs `inferAdditionalFields` for typed session fields        | fix      | 3.8, PR 4 step                                   |
| 31 | important    | "validator.input or hooks, verify first" left open                        | fix      | 3.8 chooses `validator.input` (verified present) |
| 32 | important    | Caddy strip location ambiguous vs blue/green `import`                     | fix      | 3.5 placement before the import, proven by curl  |
| 33 | important    | AC7 "no raw IP/country in logs" not objective (client IPs already logged) | fix      | AC7 reworded                                     |
| 34 | important    | Q8 pre-check result not recorded                                          | fix      | step 4 requires pasting output; fallback stated  |
| 35 | important    | PR 1a baseline count not reviewer-checkable                               | fix      | PR body must include the count                   |
| 36 | non-blocking | storefront pages calling `getTranslations`; PE fallback rationale         | fix      | PR 4 audit; marked assumption                    |

Verdict: reviewer said READY. Honest status: two consecutive clean rounds were
not reached (round 2 had important findings, applied without a third round).
Residual uncertainty: better-auth `validator.input` behavior on `updateUser`,
Caddy directive ordering with `import`, and dashboard server `getTranslations`
usage; each has an explicit check in the plan.

## Owner answers (2026-11-02, after round 2)

Q1 self-service `uiRegister`; Q5 never block sellers or buyers (enforcement
dropped); Q8 owner will enable Cloudflare IP Geolocation and wants a fallback
(already designed); new scope: API/WhatsApp-generated messages follow store
setting, then country, unknown -> tuteo. Verified in repo before applying:
WhatsApp default builders live in `packages/utils/src/whatsapp/index.ts`
(contain "Todavía tenés"); `apps/api` depends on `@biasmarket/utils` but not
`@biasmarket/i18n`; `docs/core/caddy.md` requires `--force-recreate caddy`;
phone-country has AR/PY/UY dial codes only.

## Round 3 (two fresh reviewers: API-messages scope; implementer readiness)

| #  | Lens              | Sev       | Finding                                                                                                           | Decision | Plan change                                                                                  |
| -- | ----------------- | --------- | ----------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| 37 | scope             | blocking  | Default WhatsApp templates are pure builders in `packages/utils`, called mostly from web; API only CRUD           | fix      | 3.10 6a rewritten, builders take `register`; PR 1a scans utils/whatsapp                      |
| 38 | scope             | blocking  | ~303 API exception sites, many shown/matched verbatim; no register resolvable for public errors                   | fix      | 3.10 6b limited to explicit allowlist, explicit call-site register, public = tuteo; optional |
| 39 | scope             | blocking  | Mixed "buyer-facing" label: order message goes buyer -> seller                                                    | fix      | 3.10 states whose register applies                                                           |
| 40 | readiness         | blocking  | PR 6 had no AC/signal                                                                                             | fix      | AC 11-14, PR 6a row                                                                          |
| 41 | readiness         | blocking  | Caddy needs `--force-recreate` per caddy.md; plan said reload                                                     | fix      | section 8 + PR 3 handoff                                                                     |
| 42 | readiness         | blocking  | Ordering proof / literal `trusted_proxies` list                                                                   | fix      | section 8 echo-upstream test, snippet + drift check                                          |
| 43 | scope             | important | Resolver home: utils (API depends on utils not i18n)                                                              | fix      | 3.1 decided                                                                                  |
| 44 | scope             | important | Dial codes: only AR/PY/UY exist; add +502..+506; strict `countryForInternational`; widens validation              | fix      | 3.10, AC14                                                                                   |
| 45 | scope + readiness | important | Partial rollout for `buyerRegister`/builder `register` arg and `inferAdditionalFields`                            | fix      | section 8                                                                                    |
| 46 | scope             | important | PII: Sentry scrub, tenant test for store A vs B                                                                   | fix      | PR 4a, AC12                                                                                  |
| 47 | readiness         | important | PR 4 too large; no dependency graph; drafts policy                                                                | fix      | 4a/4b split, graph in section 5                                                              |
| 48 | readiness         | important | Missing tests: cookie poisoning, cache headers, static pages stay static, reverse-compat, deletion clears country | fix      | section 7                                                                                    |
| 49 | readiness         | important | AC7/AC1/AC10 not objective                                                                                        | fix      | reworded with exact scans/packages                                                           |
| 50 | readiness         | important | Deploy order wording and backfill race "accepted"                                                                 | fix      | section 8: real order, post-deploy check + second backfill                                   |
| 51 | readiness         | important | Handoff mismatch (PR 4 gate, review-log optional)                                                                 | fix      | handoff updated                                                                              |

Round 3 had blocking findings, so the clean-round counter is at zero. Round 4
runs next.

## Round 4 (fresh: correctness/repo fit; testing/ops/simplicity). Not clean.

| #  | Sev          | Finding                                                                                                                                                                 | Decision | Plan change                                                                 |
| -- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| 52 | blocking     | Buyer country PATCH aimed at `global-account` (no PATCH, not wired); storefront uses `PATCH stores/:slug/account/me` (verified)                                         | fix      | 3.8, PR 4a-2                                                                |
| 53 | blocking     | No `BuyerAccount` deletion/retention path exists (verified: no `buyerAccount.delete`)                                                                                   | fix      | 3.8: not added, privacy page honest, deletion test replaced by no-leak test |
| 54 | blocking     | Backfill entangled with schema migration contradicts blue-green-migrations.md                                                                                           | fix      | PR 5 additive only; separate post-cutover backfill                          |
| 55 | blocking     | ACs not mapped to PRs; AC7 bundled; AC10 standing rule                                                                                                                  | fix      | PR mapping at top of section 9                                              |
| 56 | important    | `packages/i18n` has no dependency on utils (verified); `Locale` cycle                                                                                                   | fix      | 3.1                                                                         |
| 57 | important    | Bundle/RSC payload cost of overlays                                                                                                                                     | fix      | 3.4                                                                         |
| 58 | important    | `bm_country` setter UI/route unassigned; buyer not fetched in SSR; dynamic proof                                                                                        | fix      | 3.4                                                                         |
| 59 | important    | `contact-seller-button` is storefront; owner register not exposed publicly                                                                                              | fix      | 3.10                                                                        |
| 60 | important    | `countryForInternational` exists privately and would return US for +1 (verified)                                                                                        | fix      | 3.10                                                                        |
| 61 | important    | `validator.input` signUp signal; Intl.DisplayNames determinism; e2e cookie/rate limits; guard completeness; CI wiring detail for 1b; PR 4a size; "api before web" claim | fix      | 3.3 guard 5, 3.8, section 7, PR rows, section 8                             |
| 62 | non-blocking | GEO_DEV throw, memoize/merge minimalism, handoff log optional                                                                                                           | fix      | simplified                                                                  |
| 63 | non-blocking | Reviewer said the "No sos dueño" cite was wrong                                                                                                                         | reject   | `whatsapp-templates.service.ts:39` verified; string exists in many services |

Process note: the first attempt to apply these edits aborted on a failed string
match and wrote nothing; two round-5 reviewers were launched against the
unrevised plan before this was noticed. Edits were re-applied; round 5 must be
re-run against the revised plan. Clean-round counter: 0 (round 4 had blocking
findings).

## Round 5 (fresh: correctness/repo fit; ops/security/tests). Not clean; no blocking from correctness.

Both reviewers were first launched against the unrevised plan (see process note
above) and re-read after a correction.

| #  | Sev                | Finding                                                                                                                           | Decision                 | Plan change                                                                                                              |
| -- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 64 | blocking           | Buyer country reaching the seller's browser (dashboard builders) contradicts no-leak rule; `BuyerAccount` is global across stores | fix                      | 3.10: API computes `recipientRegister`, exposes only that; AC12 named test                                               |
| 65 | blocking/important | Post-cutover backfill has no runner (migrations run pre-cutover; no documented script path); badge gate undefined                 | fix (alternative chosen) | PR 5: `DEFAULT true` migration, new code writes explicit value, no backfill, no gate; optional later `SET DEFAULT false` |
| 66 | important          | Section 4 said `global-account`; section 8 PII said deletion path; step 6/AC8/section 7 stale backfill text                       | fix                      | aligned                                                                                                                  |
| 67 | important          | Dashboard server-merge option infeasible (`uiRegister` only client-side)                                                          | fix                      | 3.4: lazy overlay, flash recorded                                                                                        |
| 68 | important          | Per-render buyer fetch adds latency                                                                                               | fix                      | 3.4: seed `bm_country` cookie on login/profile save                                                                      |
| 69 | important          | Numbering (PR 4 vs 4a/4a-2/4b), status line, AC14 mix, handoff ordering, PR 2 row omitted dial codes                              | fix                      | aligned                                                                                                                  |
| 70 | important          | AC6/AC7 weak checks; Sentry scrub test targets                                                                                    | fix                      | AC6 count test; AC7 regex over migration diff + named targets                                                            |
| 71 | non-blocking       | better-auth path is `db/schema.mjs`; StoresService.create/ public DTO notes; 4b after PR 3 deployed; who runs Caddy recreate      | fix (partly)             | path fixed; 4b gated on PR 3; recreate owner = the operator following docs/core/caddy.md                                 |

Clean-round counter: 0. Round 6 next.

## Round 6 (fresh: correctness/consistency; security/ops/tests). Not clean.

| #  | Sev       | Finding                                                                                                                                                                | Decision | Plan change                                                                       |
| -- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| 72 | blocking  | Plan/handoffs claimed stacked PRs get no CI. WRONG: `ci.yml:8` comment says no `branches:` filter, stacked PRs get the same CI (I misread the trigger block; verified) | fix      | all "no CI / main base" claims removed                                            |
| 73 | blocking  | Q8 evidence `curl -sI` cannot show a request header Cloudflare adds                                                                                                    | fix      | temporary Caddy echo path + `cf-cache-status` check                               |
| 74 | blocking  | Country precedence contradicted itself (account tier vs seeding the cookie; HttpOnly vs client-set)                                                                    | fix      | resolver is cookie > CF > null; one HttpOnly server route seeds/clears/re-seeds   |
| 75 | important | Caddy redaction needed in both blocks + Set-Cookie; log grep check                                                                                                     | fix      | 3.5                                                                               |
| 76 | important | WhatsApp builder signature unspecified (blast radius: ~60 tests, 5 callers)                                                                                            | fix      | optional field on input/trailing opts, never positional; PR 6a checklist (step 8) |
| 77 | important | `recipientRegister` DTO/SDK owner; 6a dependency on 4a-2                                                                                                               | fix      | PR 6a row + graph                                                                 |
| 78 | important | AC mapping inexact; AC8 stale backfill text; AC1 command and case; AC9 insert SQL; AC14b grep; badge test                                                              | fix      | section 9 mapping, ACs, step 9                                                    |
| 79 | important | Badge needs country name vs client-only DisplayNames                                                                                                                   | fix      | client component                                                                  |
| 80 | important | Missing completion signals for 4b/6a/6b; storefront namespaces unnamed; status line vs handoff on PR 4 gating                                                          | fix      | steps 7-9, namespace discovery rule, status aligned                               |
| 81 | pass      | DEFAULT true passes `check-destructive-migrations.sh`; recipientRegister leak bounded to one coarse bit                                                                | note     | none                                                                              |

Clean-round counter: 0. Round 7 next.

## Round 7 (fresh: consistency/code claims; security/ops/tests). Not clean.

| #  | Sev       | Finding                                                                                            | Decision | Plan change                                                            |
| -- | --------- | -------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| 82 | blocking  | `sentry-scrub` only scrubs order-token URLs (verified); "scrub covers bm_country" had no mechanism | fix      | 4a-2 adds key-based redaction pass + fixture tests                     |
| 83 | blocking  | Country route path/Origin check unspecified; locale proxy would redirect                           | fix      | `POST/DELETE /api/country`, Origin check, tests; stale-cookie accepted |
| 84 | important | PR 2 could drag web JSON into Metro (`tsconfig.mobile.json` includes only `mobile.ts`, verified)   | fix      | `merge.ts`, real mobile bundle signal                                  |
| 85 | important | Named tenant-isolation tests                                                                       | fix      | section 7                                                              |
| 86 | important | PR 1b guards 2/3/5 need the overlay                                                                | fix      | 1b = guards 1+4; 2/3/5 in PR 2                                         |
| 87 | important | Handoff said 6a after 4a (plan: 4a-2); PR 1a filter missed utils; First action read the review log | fix      | aligned                                                                |
| 88 | minor     | 6b has no code dependency on 6a; api-client cite range; allowlist path                             | fix      | aligned                                                                |

Clean-round counter: 0. Round 8 next.

## Round 8 (fresh: consistency/code facts; security/ops/tests). Security READY; consistency not clean.

| #  | Sev          | Finding                                                                                                                                                                       | Decision  | Plan change                                         |
| -- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------- |
| 89 | important    | PR 5 independent of main but its badge needs buyer country (4b) and store country (4a)                                                                                        | fix       | PR 5 = field + checkbox; new PR 5b badge after 4b   |
| 90 | important    | `resolveStoreCountry` falls back to owner country, which must not be public; no PR owned it                                                                                   | fix       | API-only helper in 4a; public DTO `shippingCountry` |
| 91 | minor        | 4b needs 4a-2; AC13 contact-seller exception; "deferred" vs "dropped"; `StoresService.create` needs a user lookup; audit step wording; AC1 scan in review handoff             | fix       | aligned                                             |
| 92 | non-blocking | Impersonation: target user's `uiRegister` applies (plan sentence wrong); admin-path writes; e2e cookie host `localhost`, own seller for the dashboard flow; AC1/AC14b wording | see below |                                                     |

Item #92 applied: impersonation sentence corrected (target's values apply; block
the two fields while impersonating), e2e notes (localhost host, own throwaway
seller), AC1/AC14b wording. Security/ops/tests reviewer: READY, no blocking or
important findings. Clean-round counter: 0 (consistency reviewer had important
findings). Round 9 next.

## Round 9 (fresh: consistency; implementer of 1a/1b/2/3). Not clean.

| #  | Sev       | Finding                                                                                      | Decision | Plan change                                                        |
| -- | --------- | -------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| 93 | important | PR 2's guards need PR 1b's vitest; graph said 1a -> 2                                        | fix      | graph 1a -> 1b -> 2                                                |
| 94 | important | Handoff said buyer country "must follow the retention path" (none exists)                    | fix      | handoff reworded                                                   |
| 95 | important | 1b: no test layout, shared regex location, devDeps, tsconfig/lint handling, coverage/Codecov | fix      | 1b row decisions                                                   |
| 96 | important | Voseo form list ended in "..."; allowlist criteria; two allowlist files unnamed              | fix      | 3.3 full seed list, triage commands, two named allowlist files     |
| 97 | important | PR 2 overlay scope undefined; guard 5 namespaces unmapped                                    | fix      | namespaces/keys listed (verified top-level keys against es/*.json) |
| 98 | important | `countryForInternational` signature, dial-code table, mobile export command                  | fix      | 3.10, PR 2                                                         |
| 99 | minor     | CF ranges "snippet" mechanics; PR 1a path list in row/handoff                                | fix      | literal duplicate + drift-check script; paths added                |

Clean-round counter: 0. Round 10 next.

## Round 10 (fresh: consistency; implementer of 4a/4a-2/4b/6a)

Consistency reviewer: READY (two nitpicks, applied: PR 2 row wording, AC8a/8b
split). Implementer reviewer: 4a, 4a-2, 4b READY; 6a had three gaps, applied:

| #   | Sev       | Finding                                                                       | Decision | Plan change                                                                                         |
| --- | --------- | ----------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| 100 | important | 6a: which seller-facing DTOs carry `recipientRegister` and how callers get it | fix      | 3.10 6a wiring decisions (`order-response.dto.ts`, `assisted-order-response.dto.ts`, customers DTO) |
| 101 | important | 6a: register for `whatsapp-messages-section` previews                         | fix      | store `buyerRegister`, `auto` -> tuteo, labelled                                                    |
| 102 | important | 6a: `contact-seller-button` with `auto` has no buyer country                  | fix      | pass the storefront layout's already-resolved register                                              |
| 103 | minor     | "Cambiar país" placement                                                      | fix      | storefront footer                                                                                   |

Clean-round counter: round 10 had important findings from one reviewer, so not
counted as clean. Round 11 next.

## Round 11 (fresh: consistency; implementer of 5/5b/6a/6b/3)

Consistency reviewer: READY (no findings). Implementer reviewer found three
gaps, applied:

| #   | Sev       | Finding                                                                  | Decision | Plan change                                                                             |
| --- | --------- | ------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------- |
| 104 | important | `shippingCountry` owner contradictory (4a vs 5b)                         | fix      | 4a = helper only; 5b adds the public-DTO field                                          |
| 105 | important | `shipsInternationally` on public product payloads had no owner/DTO names | fix      | PR 5 row names `PublicProductWithVariantsResponseDto`, `product-search-response.dto.ts` |
| 106 | important | `create-order.usecase.ts:38` store query has no owner                    | fix      | 3.10: add owner include, select two fields                                              |

Clean-round counter: round 11 had one clean reviewer and one with important
findings: not counted. Round 12 next.

## Round 12 (fresh: implementer of every PR; risk/ops/product)

Risk/ops/product reviewer: READY; all owner requests confirmed covered.
Implementer reviewer:

| #   | Sev       | Finding                                                                                                                 | Decision | Plan change                                                                                                                                       |
| --- | --------- | ----------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 107 | important | `PublicStoreResponseDto` does not exist (verified); real DTO is `StorePublicDetailResponseDto extends StoreResponseDto` | fix      | name corrected in 5b row                                                                                                                          |
| 108 | important | 4a vs 4b ownership of `buyerRegister` on the public payload, via inheritance                                            | fix      | 4a adds `buyerRegister` + store `countryCode` to `StoreResponseDto` (inherited, public-safe); owner fields never added; 5b adds `shippingCountry` |

Eleven other cited files/DTOs/functions verified to exist. Clean-round counter:
0 (one reviewer had important findings). Round 13 next.

## Round 13 (fresh: decisions/gating consistency; mechanical identifier verification)

Consistency reviewer found six stale/contradictory statements (4b gating, 6b
gating, "start PR 2 now", `contact-seller-button` register wording, audit step
placement, handoff `curl -I` wording): all fixed. Mechanical reviewer verified
about 95 cited identifiers: no ownership problems; three notes fixed
(`product-search-response.dto.ts` lives under `products/dto/`, better-auth lines
77-78, voseo service count is 11-16).

Stopping point: rounds 10-13 each had at least one reviewer with only small
findings and no blocking issues after round 8; two consecutive fully clean
rounds were not reached. Further rounds were finding wording-level
inconsistencies; the plan is handed off with that residual risk stated in its
Status line.
