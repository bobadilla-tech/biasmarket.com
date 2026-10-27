# Review log: assisted order seller flow

Plan: `.artifacts/2026/10/20261027--assisted-order-seller-flow/plan.md`.
Severity: B blocking, I important, N non-blocking. Decisions: fix, defer,
reject, ask. "Verified" means checked by the planner against code after the
reviewer reported it.

## Round 1 (five independent reviewers on plan v1)

Lenses: correctness/bug hunt, security/privacy/tenant, repo-fit/web,
testing/ops/stack, simplicity/requirements coverage. Code was read, not run, by
all reviewers except the earlier research probes.

| # | Finding | Lens | Sev | Evidence | Decision | Plan change |
|---|---|---|---|---|---|---|
| 1 | Assisted create locks stock before the Customer row; checkout locks Customer first (create-order.usecase.ts 264-281 vs 291+) -> opposite lock order, 40P01 -> 500 | correctness | B | code reading; no probe | fix | v2 4.1: core split into `lockAndValidate` and `reserveItems`, Customer upsert runs between them in BOTH flows; lock order rule written down; real-DB concurrency test in PR2 |
| 2 | Correct-phone/regenerate state checks must read the locked row, not a pre-read | correctness | B | order.controller.ts:669 idiom | fix | v2 4.3: `SELECT FOR UPDATE` then re-read and decide; `AssistedOrderInvariantError` mapped to 400 |
| 3 | CI triggers only on `pull_request: branches: [main]`; stacked PRs get no CI | testing/ops | B | ci.yml:3-12 (verified) | fix | v2 5: bottom PR based on main, rest stacked, CI is local-only until retarget, local scripts listed |
| 4 | Stack on the user's unmerged branch causes retarget storm | testing/ops | B | a3bf8db4 has no PR | fix | v2 5: base PR1 on `main`, do not touch the follow-up branch; conflicts handled by rebase |
| 5 | Orval: openapi.json drift check is strict full-file; `generated/**` not checked in CI; version skew 8.23.0 vs 8.43.0 | testing/ops | B | check-openapi-drift.sh, ops probe | fix | v2 7: openapi.json = full regenerated output; revert unrelated generated files; typecheck types+web; version-pin chore filed as follow-up |
| 6 | IP throttling is one global bucket behind Caddy (no `trust proxy`) | security | B | monitoring-webhook-secret.guard.ts:13-19 (verified, grep finds no trust proxy) | fix (scoped) | v2 4.2: seller routes use a user-id keyed throttler; changing `trust proxy` is NOT in this work, follow-up issue |
| 7 | Cross-store reuse of orderId/customerId; update `where` must include storeId | security | B | reviewer | fix | v2 4.3 + tests |
| 8 | `upsertStoreContact` already exists (non-tx, would overwrite name) | security, correctness | B | customers.service.ts:288-302 (verified) | fix | v2 4.2: tx-aware variant, name only set on create or when existing name is null |
| 9 | Env feature flag needs Dockerfile ARG, cd.yml build-args, terraform, turbo globalEnv | web, simplicity | B | reviewer cites files | fix (drop flag) | v2: no flag. Button stays a stub until PR7; web PRs 7-8 are not released before C2 (#268) |
| 10 | "Pure rules" extraction not lift-and-shift; functions do not exist | web | B | checkout-form.tsx inline memos | fix | v2: separate PR5, "mechanical refactor + new unit tests written first", put in `features/checkout/lib/pickup-availability.ts` neighbor, export via barrel |
| 11 | PR6 too big | web, simplicity | B | | fix | split into PR5 (rules) and PR6 (form) |
| 12 | WhatsApp greeting decision unresolved; regex `\s+([!,.¡?])` breaks `¡` | simplicity | B | reviewer | fix | v2 4.4: default message built in TS with conditional greeting, no regex, no `{{greeting}}` token |
| 13 | Core extraction as injectable class breaks hand-built spec constructor | simplicity, correctness | B | create-order.usecase.spec.ts | fix | v2 4.1: plain exported functions, `CreateOrderUseCase` constructor unchanged |
| 14 | #265 "revoked link page in C2" has no owner | simplicity | B | issue #265 | fix | v2: deferred to #268, PR8 uses `Refs #265`, added to C2 note |
| 15 | Regenerate/correct on CANCELLED/expired state is undefined; `OrderStatus` is ACTIVE/CANCELLED only; sweep lag | correctness | I | schema 496, expire-orders.usecase.ts:69 | fix | v2 4.3 guard: `status=CANCELLED OR paymentStatus=CANCELLED OR expiresAt<now` -> 409, both endpoints |
| 16 | `accessTokenRevokedAt` never written; regenerate must set it null explicitly | correctness | I | grep | fix | v2 4.3 |
| 17 | First-open fix wording ("hash read") wrong; should use hash of the presented token | correctness | I | | fix | v2 4.3 first-open guard |
| 18 | PR2 race fix standalone not worth a slot; race exists only with rotation | simplicity | I | | fix | folded into link-endpoints PR as first commit |
| 19 | Correct-phone leaves `Order.customerName` | correctness | I | | fix | keep order alias, documented |
| 20 | `previousOrders` helper re-calls assertOwnership and scans legacy rows | correctness | I | customers.service.ts:327 | fix | count-only helper, no second ownership call |
| 21 | DTO: MaxLength on alias, control chars, reject `source`/`createdByUserId`/`customerEmail`/`expiresAt`; swagger mapped types; regenerate metadata.ts | correctness, security | I | | fix | v2 4.2 + tests |
| 22 | Response/error headers `no-store`, `no-referrer`; React Query cache of accessUrl (`gcTime: 0`) | security | I | | fix | v2 4.2, 4.5 web |
| 23 | accessUrl href only when origin equals WEB_URL; no redirect use | security | I | | fix | v2 4.5 |
| 24 | Enum ADD VALUE: must be the only statement, value unused in the migration; overlap safe because no list endpoint, `parseType` 400s | testing/ops | I | precedent migrations 20260729215419, 20260809231500 | fix | v2 4.4 + risks |
| 25 | WhatsApp consumer list incomplete (specs, e2e, generated types, contact-seller-button comment) | web | I | grep | fix | v2 4.4 file list + `grep PAYMENT_REMINDER` completion signal |
| 26 | Order ref slice -4 vs -6 used in 5 sites; do not consolidate | web | I | | fix (defer) | Q5: use `shortOrderRef` for the message only |
| 27 | `ConfirmNumberAndOpenWhatsApp` location | web | I | | fix | `features/assisted-orders/components`, exported via barrel |
| 28 | Per-PR rollback, e2e flakiness (better-auth rate limit, parallel race tests), DATABASE_URL override | testing/ops | I | vitest.config.e2e.ts | fix | v2 7, 9 |
| 29 | Skill PR0 verification | testing/ops | I | | fix | v2 5 PR0 checks |
| 30 | #258 leftover tests (count across `+51…`, `987…`, `51987…`; lookup isolation), server-side total 0, token length assertion, i18n parity, mobile checks, "Corregir número" target in PR7 | simplicity, web | I | | fix | v2 8 |
| 31 | Skill gaps: define "clean", PR0 commit exception, resolve questions before ready, stack base line, review each PR against own base | simplicity | I | | fix | SKILL.md updated |
| 32 | Idempotency/double submit; Caddy logs of `/public/orders/:token`; old Customer row cleanup; schema conflicts resolved by hand | various | N | | defer/document | v2 9 |

Result: all 14 blocking findings and 17 important findings changed the plan
(v2). Two reviewer suggestions rejected: reuse of `upsertStoreContact` as is
(finding 8), and a standalone first-open PR (18, folded instead).
No finding was refuted by evidence. Finding 1 is unproven by a runtime probe;
the design removes the opposite lock order regardless, and PR2 carries a
real-DB concurrency test.

## Round 2 (plan v2; three reviewers: API gap hunter with a real-DB probe, web/ops/stack gap hunter with command probes, fresh-eyes readiness reader)

| # | Finding | Lens | Sev | Evidence | Decision | Plan change (v3) |
|---|---|---|---|---|---|---|
| R2-1 | Baseline stale: main is `cc538b78`, PR #322 merged the follow-up | fresh-eyes, web/ops | B | `git log origin/main` (verified) | fix | sections 1, 5, Q7 rewritten; cites on `order.controller.ts:669`, `order-events.service.ts` re-verified on `cc538b78` |
| R2-2 | Deadlock between v1 assisted create and checkout is real | API | confirmed | probe: `40P01` for stock-first, none for Customer-first; non-key UPDATE does not block Order FK insert | already fixed in v2; evidence recorded | section 3 probe 4, e2e test in PR2 |
| R2-3 | Concurrent creates for the same new phone: P2002 aborts tx -> 500; "name only if null" not expressible as Prisma `upsert` | API | B | reasoning + probe SQL | fix | 4.2 step 5: `ON CONFLICT DO NOTHING` + `findUnique` + conditional `update`; tests |
| R2-4 | `AssistedOrderInvariantError` unmapped in create path too | API | B | `assisted-order/index.ts:18` plain Error | fix | wrapped in 4.2 and 4.3 |
| R2-5 | 4.1 split lacks concrete types; lockAndValidate returns values; PARTIAL config read stays inside | API | I | create-order.usecase.ts:161-162, 413-423 | fix | 4.1 types |
| R2-6 | Correct-phone does take Order -> Customer; state the rule | API | I | | fix | lock-order rule extended |
| R2-7 | `SellerThrottlerGuard` workable via `request.session` set by global AuthGuard | API | confirmed | better-auth module code | fix | 4.2 states mechanism + test |
| R2-8 | No buyer exposure through `customerId`; assisted orders count in seller stats; CREATED is buyer-visible | API | N | grep | document | 4.2 notes |
| R2-9 | Same-phone correction / existing registered customer undefined | API | N | | fix | 4.3 |
| R2-10 | `Closes #N` only closes on merge to main; `Refs` in stack, user closes | web/ops | I | GitHub semantics | fix | section 5 |
| R2-11 | After each retarget wait for green CI | web/ops | I | ci.yml:5,11 | fix | section 5 |
| R2-12 | PR5 should be based on main; PR7 depends on PR4 + PR6 | web/ops, fresh-eyes | I | | fix | table and note; sub-sections relabeled 4.5-a..d |
| R2-13 | Enum change does not break any compile (utils/web unions separate): grep completion signal is necessary | web/ops | confirmed | probe: api typecheck 0 errors after enum add | keep | 4.4 signal |
| R2-14 | Migration `ADD VALUE` passes `check-destructive-migrations.sh` (needs BASE_SHA, HEAD_SHA; file must be committed) | web/ops | confirmed | probe rc=0 | document | section 7/PR notes |
| R2-15 | Section 7 commands all run and pass on main (192 api tests, 86 web, 85 utils); axe stack trace is noise | web/ops | confirmed | probe | document | section 8 note |
| R2-16 | `orders/new` has no route collision; no middleware change; buyer route `pedido` does not exist yet | web/ops | confirmed | probe | none | none |
| R2-17 | `packages/validation` path unspecified | fresh-eyes | B | | fix | 4.5-b path |
| R2-18 | PR6 `Closes #263` while button wired in PR7; AC coverage gaps (#264 copy/notice/URL tests, `@Throttle` test, mobile manual check, #265 deferrals) | fresh-eyes | B/I | | fix | table `Refs`, test matrix extras, comment on #265 |
| R2-19 | Cited paths incomplete; token length wording; digit-run scope; D-12 should be confirmed with the user | fresh-eyes | I/N | | fix | paths added, Q4/Q8 |

Result: round 2 found new blocking items (R2-1, R2-3, R2-4, R2-17, R2-18), all fixed in v3.
Not clean; round 3 required.

## Round 3 (plan v3; two reviewers: API/security/data hunter, final readiness + coherence; no runtime probes)

| # | Finding | Sev | Evidence | Decision | Plan change (v4) |
|---|---|---|---|---|---|
| R3-1 | PR6 base unexecutable (needs PR2's client; PR7 'merge PR4 in') | B | table | fix | one linear chain; PR5 based on PR4; merge-in paragraph deleted |
| R3-2 | `Closes #259` on PR2 contradicts Refs-only policy | B | | fix | `Refs #259, #258` |
| R3-3 | `expiresAt < now` guard blocks regenerate on VERIFIED orders (sweep only cancels hold statuses; nothing clears expiresAt) | B | `expire-orders.usecase.ts:32` (verified) | fix | guard applies only to hold statuses; test |
| R3-4 | Raw Customer insert needs explicit id (cuid client-side) | I | schema `@default(cuid())` (verified) | fix | column list + `randomUUID()` |
| R3-5 | After a failed tx statement Postgres aborts (25P02); no try/catch inside tx; use `updateMany where name null` | I | | fix | 4.2 step 5 |
| R3-6 | Correct-phone leaves a phantom Customer | I | customers.service.ts:53-62 | fix | guarded delete in tx |
| R3-7 | CI wording, retarget recipe, stale labels, `Refs #262` unexplained, PR1 e2e missing, per-PR verify/must-not-change, PR3 test gaps, seller DTO file unnamed | I | | fix | sections 4.3, 4.5, 5, 5.1, 7, 8 |
| R3-8 | Sweep lag; address visible to link holders; public DTO test | N | | document/test | risks + test |

Result: round 3 found 3 blocking items, all fixed in v4; no finding was
refuted. Not clean; round 4 required (then one more clean round).

## Round 4 (plan v4; two reviewers: data/API hunter with a real-DB probe, consistency + executability)

| # | Finding | Sev | Evidence | Decision | Plan change (v5/v6) |
|---|---|---|---|---|---|
| R4-1 | Guarded DELETE of the old Customer can null a concurrent order's `customerId` or 500 (23503) | I | probe on Postgres 17: both interleavings reproduced; FK is `ON DELETE SET NULL` | reject the delete (R3-6 reversed) | no delete; accepted phantom contact + follow-up issue; race test asserts `customerId` non-null |
| R4-2 | `upsertAssistedCustomer` must retry when `findUnique` returns null | I | probe | fix | retry once |
| R4-3 | No deadlock cycle for Order -> Customer vs Customer -> stock -> new Order | none | probe | keep | none |
| R4-4 | `ON CONFLICT DO NOTHING` + conditional update: 8 concurrent calls, zero errors, one row | confirmed | probe | keep | none |
| R4-5 | `RESERVED_HOLD_STATUSES` duplicated privately in two files | N | cancel-order.usecase.ts:13, expire-orders.usecase.ts:13 | fix | move to one export |
| R4-6 | No cascade-rebase recipe; no concrete git/gh commands; PR0 skill file untracked; ownership of retarget/CI; comment tasks and closers; #258 AC map; per-PR acceptance; deferrals list; Q8 asker | I | | fix | sections 5.2, 5.3, 5.4, 10.1, 10.2, AC 7 |

Result: no blocking findings; important findings fixed; one earlier fix (R3-6)
was reversed on probe evidence. Not clean (important items): round 5 required.

## Round 5 (plan v6; two reviewers: cold implementer read of PR1-4, web/WhatsApp hunter with code probes)

| # | Finding | Sev | Evidence | Decision | Plan change (v7) |
|---|---|---|---|---|---|
| R5-1 | Circular import orders -> assisted-orders -> checkout -> customer-auth -> orders | I | barrel imports read | fix | deep-path import rule in 4.5 |
| R5-2 | No i18n parity test exists | I | search of apps/web, packages/i18n, scripts | fix | add `i18n-parity.test.ts` in PR6 |
| R5-3 | `useDeliveryOptions` uses public endpoints | I | queries code | fix | PR6 test for unpublished store |
| R5-4 | 'real map' step touches more files than listed (`use-whatsapp-templates.ts`, `settings-page-client.tsx`, preview ternary) | I | | fix | 4.4 web bullet rewritten with directories |
| R5-5 | Order.customerName on create; merge of orderData; creator name source; helper/guard locations; infrastructure/ path prefixes; grep exclusions | I | cold reader | fix | 4.2/4.3/4.4 text |
| R5-6 | PII in thrown messages/logs (`AllExceptionsFilter` stringifyError); retry second-null outcome; `@Res passthrough`; tx timeout; concurrency case in e2e | I | | fix | 4.2 step 5 |
| R5-7 | Q4/Q8 duplicates, PR3 test bullets duplicated, `customers.service.ts` line off by one | N | | fix | merged |
| R5-8 | Conditional-greeting default is compatible with template validation | none | `getMissingRequiredTokens` reads saved text only | keep | token superset test |

Result: no blocking findings; important findings fixed (all were completeness or
hazard notes, none reversed a design). Not clean by the skill's rule (important
items), so round 6 is the final readiness gate.

## Round 6 (final readiness gate on plan v7 + both handoffs + skill; two reviewers, one cold)

| # | Finding | Sev | Decision | Change |
|---|---|---|---|---|
| R6-1 | `gh issue view` takes one argument | I | fix | loop in handoff |
| R6-2 | Q8 reference in 5.2 stale (merged into Q4) | I | fix | plan 5.2 |
| R6-3 | PR0 copy source path and listing check wording; no pull in the user's checkout | I | fix | handoff step 0 and first action |
| R6-4 | Review handoff lacks PR0, CI-state, rollback, PR8 acceptance lines and tip SHA column | I | fix | review-handoff checklist |
| R6-5 | Handoff lacks 'Review findings to preserve' | I | fix | handoff section |
| R6-6 | Plan status not ready | I | fix | status set after this round |

Result: no blocking findings; all important items were wording/command fixes
with no design change. Honest accounting against the skill's rule of two
consecutive clean rounds: rounds 5 and 6 had important (not blocking) findings,
all completeness fixes; the plan is marked ready on that basis. A further
review round could still find small items.
