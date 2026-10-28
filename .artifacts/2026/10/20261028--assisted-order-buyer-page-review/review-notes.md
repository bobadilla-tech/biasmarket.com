# Review notes: buyer page stack (#357-#361)

Reviewer login: `eliaz-tilt` (also the PR author, so only `COMMENT` reviews are
possible). Base for each PR is the previous PR; hosted CI only ran fully for the
ones targeting `main`.

## Scope

| PR   | Head     | Base | Closes/Refs | Existing review/CI                                       |
| ---- | -------- | ---- | ----------- | -------------------------------------------------------- |
| #357 | 036348fc | main | Refs #268   | CodeRabbit: 1 inline (alias U+2060); checks skipping     |
| #358 | 055a4d10 | #357 | Closes #268 | no review; Codacy failed (external, not investigated)    |
| #359 | 29e6b3b2 | #358 | Closes #333 | no review                                                |
| #360 | 3431b928 | #359 | Refs #265   | no review; API + i18n pass, web e2e pending at read time |
| #361 | cbeb3344 | #360 | Closes #337 | no review                                                |

## What ran (scratch worktree, throwaway Postgres :55432 / Redis :56379)

- Stack top: `typecheck lint` for api/web/types/i18n: pass. API unit 759/759,
  web unit 574/574 (with `NODE_ENV` unset).
- `check-openapi-drift.sh`: exit 0 (needs the CI env file; fails with a missing
  `S3_LOGO_BUCKET` otherwise).
- `pnpm --filter @biasmarket/types generate` produced wide formatting-only noise
  in my env; byte-for-byte regeneration is NOT verified.
- #358: `next build` + `next start`, curl of prefixed, RSC (`?_rsc`, `RSC: 1`)
  and unprefixed (`--max-redirs 0`) paths: `Cache-Control: no-store`,
  `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow` on every
  variant (next-intl did not override). Meta robots/referrer present, no
  third-party script, robots.txt disallows both patterns. Token also appears in
  the hreflang `Link` header (disclosed in the PR) and in the RSC payload.
- #358: 27 mutations on the web tests: 17 caught, 10 survived (below).
- #357: sanitizer fuzzed; `TZ=America/Lima` formatting probe for pickup date.
- #359: new e2e passes 5/5 on head; fails 4/4 (3 runs) on the base source with
  the PR's test file. 40-way parallel checkouts through the real controller:
  head all 201 with 1 BuyerAccount/1 link/1 Customer; base 8-9 of 40
  returned 500. Mutation of lock/ON CONFLICT/guards: all but the lock removal
  fail the e2e (lock caught by unit tests only). No deadlock cycle found by
  reading every advisory/FOR UPDATE site.
- #360/#361: e2e 5/5 and 6/6; store scoping, ownership (403/404), EXPLAIN on 60k
  orders, ghost-customer matrix probed through the real endpoint; mutations.

## Findings (ranked)

| ID    | PR   | Sev        | Verified                      | Summary                                                                                                                                                                                              |
| ----- | ---- | ---------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 357-1 | #357 | should fix | ran                           | alias sanitizer lets invisible chars through (U+2060, U+00AD, U+180E, U+2061-2064, tags, U+3164, U+FFFC...): "Hola, <nothing>" greeting; same gap in the create DTO `@Matches`                       |
| 358-1 | #358 | should fix | ran (format) / read (storage) | pickup date shows the previous day west of UTC (Peru): `Date.UTC` at creation, browser-local format on the page                                                                                      |
| 358-2 | #358 | should fix | ran                           | 10 of 27 mutations survive: `gcTime`, case-sensitive slug, PARTIALLY_PAID pending 0, `status !== ACTIVE`, expired-only (`paymentStatus` CANCELLED), CANCELLED+READY precedence, ya-pague href, focus |
| 358-3 | #358 | nit        | ran                           | page.tsx "no fetch" guard is a regex over the source; `globalThis['fe'+'tch']`, `const f = fetch`, or a barrel re-export bypass it                                                                   |
| 358-4 | #358 | question   | read                          | invalid state has no contact path when `stores.findPublic` fails or the store has no WhatsApp number (plan: "with a contact path")                                                                   |
| 358-5 | #358 | question   | read                          | plan's `X-Frame-Options`/`frame-ancestors` not added; the user direction did not defer them; PR body silent                                                                                          |
| 358-6 | #358 | nit        | ran                           | PR body: "8 image-gallery failures on a clean tree" is a `NODE_ENV=development` shell artefact; suite is green with it unset                                                                         |
| 360-1 | #360 | nit        | ran                           | `try/catch` around `normalizePhone` is dead (never throws); garbage legacy phones normalise to `+51` and match each other                                                                            |
| 360-2 | #360 | nit        | ran                           | related-orders e2e has no cross-store legacy fixture (unit spec catches it)                                                                                                                          |
| 359-1 | #359 | nit        | ran                           | e2e does not prove the advisory lock (passes without it); unit tests do                                                                                                                              |
| 359-2 | #359 | nit        | read                          | `GUEST_RESULT` shared module-level object returned by reference                                                                                                                                      |
| 361-1 | #361 | nit        | ran                           | customer whose only order is cancelled stays visible (consistent with #337, undocumented); e2e does not cover the `emailVerified` clause (unit does)                                                 |

## Dropped / not findings

- Banner "ready" + how-to-pay for an unpaid order (agent F4): void is only
  allowed while `fulfillmentStatus === ORDERING`
  (`void-order-payment.usecase.ts`), so not reachable that way. Dropped.
- Partially-paid banner wording when there is no deposit: copy preference,
  dropped.
- `metadata.ts` reorder in #357: consistent with generator output (not
  regenerated here).
- Ghost filter pagination drift: the list has no pagination/total.
- Change-phone confirm last-writer-wins: pre-existing semantics, within the
  plan's best-effort scope.

## Not verified

Valid-state render in a real browser against a seeded order; Playwright spec;
full API e2e (MinIO not available, 10 unrelated failures claimed by the PR body
are plausible); races (e)(f)(g) beyond unit tests; Codacy failure; regenerated
Orval output byte-for-byte; Cloudflare caching.
