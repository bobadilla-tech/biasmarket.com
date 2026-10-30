# Docs full audit: review log

Decisions: **fix** (proposal changed), **defer** (acknowledged, not now),
**reject** (reviewer wrong), **ask** (human decides). Findings from the audit
agents themselves are in `proposal.md` section 4; this log covers reviews of the
proposal.

## Pre-review corrections (lead session, before round 1)

| Item     | Finding                                                   | Evidence                                             | Decision                                                              | Result        |
| -------- | --------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------- | ------------- |
| Agent E9 | "CI has no `i18n` job"                                    | `ci.yml:617 i18n:` (my own grep missed the digit)    | reject (agent wrong); later confirmed by round 1 accuracy             | F95 corrected |
| Agent E7 | "Wise/PayPal not implemented" is an error in `product.md` | `product.md` already says "manual, screenshot-based" | fix (downgraded): only `CASH` is omitted and the enum should be named | F21           |

## Round 1 (accuracy, completeness/navigation, safety/simplicity)

### Accuracy

| #          | Finding                                                                                                                                                              | Sev       | Decision     | Change                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------ | -------------------------------------------------------------------------------------------- |
| 1          | F95 claims no `i18n` job; `ci.yml:617` defines one                                                                                                                   | blocking  | fix          | F95 rewritten, adds the eight missing jobs, keeps `i18n`                                     |
| 2          | E3 creates a second canonical paragraph, but `security-payments.md` §9.3.1 already exists and says `BUYER_SUBMITTED`/`PENDING_REVIEW` and no `paymentStatus` change  | blocking  | fix          | E3 now extends §9.3.1; F31-F33, F40 re-baselined                                             |
| 3          | §7.4 already has a correct `trust proxy` paragraph                                                                                                                   | important | fix          | F31 and 5.2 keep it                                                                          |
| 4          | Rate-limit route list incomplete (public proof upload, image reads, `buyer-phone`, contact, store public routes, premium jobs, global-account auth)                  | important | fix          | 5.2: table built from `grep @Throttle` at apply time; numbers not published (also safety S1) |
| 5          | Step 9 text says "verify" after full switch; `deploy.sh` does no smoke test after `full_switch`                                                                      | important | fix          | F52 and 5.2 reworded                                                                         |
| 6          | Renumbering leaves stale in-text refs ("steps 4-8", "step 8", "step 12")                                                                                             | important | fix          | F52 and 5.2 list the ref updates                                                             |
| 7          | "Also accepted by seller approve/reject" misdescribes the `PAYMENT_SUBMITTED` row; it is a source state, and the event is separate                                   | important | fix          | F33 and E3 reworded                                                                          |
| 8          | "90 days after close" incomplete: only unclaimed, terminal assisted orders; claimed only on request                                                                  | important | fix          | F39                                                                                          |
| 9          | `#92-flow` has 5 refs (`product.md` 1, `roadmap.md` 4), not 4                                                                                                        | minor     | fix          | 5.4 table                                                                                    |
| 10         | `docker.md` does not link `readme.md`; real inbounds are `infra.md`, `business/readme.md`                                                                            | minor     | fix          | 5.4 inbound list                                                                             |
| 11         | F50 evidence: mention the `'korealexa'` fallback                                                                                                                     | minor     | defer        | add to the `deploy.md` table at apply                                                        |
| 13         | Buyer session is 7 days, refreshed on use                                                                                                                            | minor     | fix at apply | noted for §7.5 text                                                                          |
| 14         | Locale prefix is `always` (next-intl default; no `localePrefix`)                                                                                                     | important | fix          | F04                                                                                          |
| 15         | "13 today" depends on `packages/ui` having no `package.json`                                                                                                         | minor     | fix          | F68 drops the number                                                                         |
| 12, others | Confirmed: F01, F02, F28, F06, F10, F14, F16, F17, F21, F22, F29, F32, F36, F38, F44, F45, F46, F49, F51, F56, F57, F66, F78, F80-F82, F85, F87, F94, F96, F98, F102 |           | none         | marked `V` where the reviewer read the code                                                  |
| unverified | F03, F62, F65, F72-F75, F88-F91                                                                                                                                      |           | defer        | listed in section 7, re-verified at apply                                                    |

### Completeness and navigation

| #      | Finding                                                                                                   | Sev       | Decision | Change                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------- | --------- | -------- | ---------------------------------------------------------------------------- |
| C1     | Delivery config, pickup points, couriers have no home                                                     | important | fix      | F109, module catalog                                                         |
| C2     | Mailer/Resend has no home                                                                                 | important | fix      | F104                                                                         |
| C3     | notifications, restock, stats, whatsapp-templates, addresses, sections, collections have no behavior home | important | fix      | F106 module catalog (a table in `architecture.md`, not a new file)           |
| C4     | Theming §5 is a proposal while code exists; no finding                                                    | important | fix      | F103                                                                         |
| C5     | Error tracking and redaction pipeline has no home                                                         | important | fix      | F105 in `incident-response.md`                                               |
| C6     | Shared packages undocumented                                                                              | important | fix      | F106 Packages table                                                          |
| C7     | Scripts reference missing                                                                                 | important | fix      | F107 in `docker-dev.md`                                                      |
| C8     | API contract workflow missing                                                                             | important | fix      | F108 in `ci.md`                                                              |
| C9-C11 | mobile README, `.artifacts`/skills mention, Resend in stack line                                          | minor     | fix      | F93, `docs/readme.md`, F98                                                   |
| N1     | No verifiable inbound-link rule; index not specified                                                      | blocking  | fix      | 5.4 index spec; section 8 step 2                                             |
| N2     | Reading order thin, wrong path (`business/product`)                                                       | important | fix      | `docs/readme.md` three tracks, `core/product.md`                             |
| N3     | Duplicate homes (env vars in three places, provisioning source in `.artifacts`)                           | important | fix      | "Single owner of" column; env.md dropped; `.artifacts` guide is history only |
| N3b    | Inbound list incomplete (`admin.md`, `README.md` link `infra.md`)                                         | important | fix      | 5.4                                                                          |
| N4     | Dead ends: no "Related" targets for existing docs                                                         | important | fix      | Q11 and index spec                                                           |
| N5     | CLAUDE.md docs list will duplicate the core index                                                         | minor     | fix      | section 6                                                                    |
| N6     | api/workers READMEs have no purpose                                                                       | minor     | fix      | dropped                                                                      |
| T1     | Ten new docs too many                                                                                     | important | fix      | four new docs                                                                |
| T2     | `docker.md` vs `docker-dev.md` vs `infra.md` unclear                                                      | minor     | fix      | index "read this when ..." lines; names kept                                 |

### Safety and simplicity

| #      | Finding                                                                                                       | Sev       | Decision | Change                                                                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| U1     | Proposal contradicts itself on "Bootstrap lessons" (history vs live)                                          | blocking  | fix      | F55, 5.3, 5.4: all bullets to `provisioning.md`, nothing to `.artifacts`                                                                                                                   |
| U2     | Several blue-green sections have no stated destination (T11, manual ops, layout block, root-equivalence note) | important | fix      | 5.4 disposition table                                                                                                                                                                      |
| U3     | Step 6/7 content promised to two places                                                                       | important | fix      | disposition table assigns variables to `deploy.md`, scoping and GHCR to `provisioning.md`                                                                                                  |
| U4, U5 | `docker.md` "Not done" note; `readme.md` footer                                                               | minor     | fix      | 5.4                                                                                                                                                                                        |
| L1     | Code comments in `github.tf`, `cloud-init.yaml.tftpl` (and others) reference the provisioning section         | blocking  | fix      | Q9; only the two that would point at moved text; verification step 6 allows them                                                                                                           |
| L2     | `.claude/skills/update-docs/SKILL.md` references moved docs                                                   | important | ask      | Q10                                                                                                                                                                                        |
| L3     | Other inbound links list                                                                                      | minor     | fix      | 5.4                                                                                                                                                                                        |
| W1     | Dirty-tree count stale; re-check at apply                                                                     | minor     | fix      | section 8 abort-on-overlap rule                                                                                                                                                            |
| S1     | Rate-limit numbers help abusers                                                                               | important | fix      | numbers dropped                                                                                                                                                                            |
| S2     | Internal endpoint paths in `assisted-orders.md`                                                               | important | fix      | behavior only                                                                                                                                                                              |
| S3     | Caddy edge details                                                                                            | important | fix      | F59 trimmed                                                                                                                                                                                |
| S4     | Terraform state description                                                                                   | important | fix      | F74 trimmed                                                                                                                                                                                |
| S5-S7  | placeholders only; dev passwords not in new docs; Kuma placeholder                                            | minor     | fix      | drift policy in 5.3                                                                                                                                                                        |
| D1     | Too many new docs                                                                                             | important | fix      | see T1; `auth` merged into `security-payments` §7.5, queues into `architecture` §9, `env.md` dropped. Two indexes kept deliberately: the skill requires a root front door and a core index |
| D2     | Drifting numbers (limits, floors, counts, TTLs, retention)                                                    | important | fix      | drift policy: words plus constant names                                                                                                                                                    |
| D3     | Status that rots ("Built beyond MVP" lists, "no backup exists")                                               | minor     | fix      | F23, F25 changed; F57 says "at the audited commit"                                                                                                                                         |
| D4     | Code follow-ups belong in issues; F96 is a code decision                                                      | minor     | fix      | section 7 lists them as issues; F96 no edit                                                                                                                                                |
| P1     | Apply order not blocking-first                                                                                | important | fix      | section 8 apply order                                                                                                                                                                      |

## Round 2 (accuracy of the revision; navigation, drift and safety)

No blocking findings. 14 navigation/safety and 26 accuracy findings, none
repeated from round 1. All fixed unless noted.

| #           | Finding                                                                                                                                                                                 | Sev             | Decision  | Change                                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| R2-01       | Repo is public; seed table publishes dev passwords; "no backup" sentence in a public doc                                                                                                | important       | fix + ask | Q12, Q13; public-repo rule in section 8                                                                     |
| R2-02/03/12 | `docs/readme.md` tracks omit docs and duplicate the index; cofounder track thin                                                                                                         | important       | fix       | tracks cut to 2-3 docs plus a link to the single complete list; product/roadmap added to the business track |
| R2-04       | Inbound-link check ignores `apps/*/README.md`; no check for Related footers                                                                                                             | important       | fix       | section 8 step 2; per-app line in `docs/readme.md`                                                          |
| R2-05       | More code comments point at moved provisioning content                                                                                                                                  | important       | fix       | Q9 widened with the reviewed hit list                                                                       |
| R2-06       | `.artifacts` anchors into moved/edited headings                                                                                                                                         | important       | fix       | literal T11 heading kept; `deploy.md` Verification heading kept                                             |
| R2-07       | SKILL.md references incomplete                                                                                                                                                          | important       | fix       | Q10 widened                                                                                                 |
| R2-08       | `architecture.md` would grow to about 600 lines                                                                                                                                         | important       | fix       | one-row-per-item rule and a 550-line trigger                                                                |
| R2-09       | Proposal contradicted its own no-numbers policy (`lines: 79`, 10-minute TTL, Postgres 18, 14 days)                                                                                      | important       | fix       | F66, F38, F57, docker-dev row                                                                               |
| R2-10       | `provisioning.md` consolidates SSH/bootstrap detail in a public doc                                                                                                                     | important       | fix       | public-repo scan rule                                                                                       |
| R2-11       | `business/readme.md` back-link                                                                                                                                                          | minor           | none      | already planned                                                                                             |
| R2-13/14    | Missing questions; `git mv` plus rewrite loses rename detection                                                                                                                         | minor           | fix       | Q12-Q14                                                                                                     |
| A-1         | "five docs" lists six                                                                                                                                                                   | minor           | fix       | section 2                                                                                                   |
| A-2         | Audited commit and dirty-tree text stale                                                                                                                                                | minor           | fix       | section 1 re-baselined (`main`, `156d0bfb`; only an AGENTS.md reflow differs)                               |
| A-3         | F32 wrote a number                                                                                                                                                                      | minor           | fix       | F32                                                                                                         |
| A-4         | F36 action list incomplete                                                                                                                                                              | important       | fix       | generated at apply time; named `payment_proof.*` etc.                                                       |
| A-5         | "polled, not SSE" wrong; no push, refetch on focus                                                                                                                                      | minor           | fix       | F37 and 5.3                                                                                                 |
| A-6         | F65 "ports now configurable" wrong: compose still publishes `5432:5432`                                                                                                                 | important       | fix       | F65 keeps the Postgres known issue                                                                          |
| A-7         | F67 overstated                                                                                                                                                                          | minor           | fix       | reworded                                                                                                    |
| A-8         | Caddy caveat appears twice, not three times                                                                                                                                             | minor           | fix       | F60                                                                                                         |
| A-9         | `instagramUrl`/`tiktokUrl` exist in the schema, so "Redes sociales" is also false                                                                                                       | important       | fix       | F85                                                                                                         |
| A-10        | F87: `features/collections` has no `api/`; `AGENTS.md` names `features/account` twice                                                                                                   | important       | fix       | F87 uses `features/products`, both refs                                                                     |
| A-11        | F19 ref map incomplete                                                                                                                                                                  | minor           | fix       | list every ref at apply                                                                                     |
| A-12        | F100 thresholds not found                                                                                                                                                               | minor           | fix       | cited the real lines                                                                                        |
| A-13        | Existing numbers in §9.3.1 vs no-numbers policy                                                                                                                                         | minor           | fix       | 5.3 note                                                                                                    |
| A-14        | Kuma counts listed as unverified though F56 is `V`                                                                                                                                      | minor           | fix       | removed                                                                                                     |
| A-15..19    | Disposition table: "Rollback" heading does not exist; phase/elapsed-time notes are per-deploy, not bootstrap; T11 Verify block and gate checklist, Step 8 split, H1 retitle unmentioned | minor/important | fix       | 5.4 table                                                                                                   |
| A-20        | Step 11's schedule reference missed in renumbering                                                                                                                                      | important       | fix       | F52 and 5.2                                                                                                 |
| A-21..24    | Prose refs, code comment hits, anchor headings unstated, README link drops seed table                                                                                                   | minor           | fix       | 5.4, Q9, operations outline, section 6                                                                      |

## Stop condition

The skill stops when two consecutive rounds produce no blocking or important
findings and no change to the proposal. **That was not reached**: round 2 still
produced important findings (and changed the proposal). A round 3 was not run.
Remaining uncertainty:

- Findings marked `A` in section 4 were verified only partially (round 1 and 2
  accuracy reviews covered most, not F62, F65 beyond ports, F72-F75, F88-F91 in
  full).
- The agent-derived text for the rate-limit controls, audit-action list, and
  retention behavior is deliberately regenerated from code at apply time.
- Apply-time re-verification (section 8) is therefore required, not optional.

## Apply phase (2026-10-30)

Owner answers: Q1 yes (move as needed); Q3 "business obeys code"; Q5 no doc
edit, no issue filed (`apps/web` is Next.js; the rule in CLAUDE.md is
untouched); Q6 yes; Q9, Q10 yes; Q13 yes (issue #485 opened). Q12 unanswered:
dev passwords were **not** removed and no `seed:base` issue was filed (a public
issue would advertise it). Unlisted questions (Q2, Q4, Q7, Q8, Q11, Q14)
followed their recommended defaults.

Executed by six writers with disjoint file sets, then integrated by the lead:

- Link/anchor checker over every maintained `.md`: 0 broken (was 10). Checker
  had a slug bug (stripped underscores); fixed in the scratchpad copy.
- Every `docs/**` and per-app README has an inbound link.
- Prettier check passes on docs, README, CLAUDE.md, AGENTS.md, app READMEs, the
  skill file.
- Greps for bcrypt, Hetzner, removed doc names, "no in-app proof", "No social
  login", "24 API E2E" return nothing.
- Safety scan of added lines: no IPs, tokens, keys or secrets;
  `/home/deploy/biasmarket` paths were already public in the Terraform
  cloud-init.
- Lost-content check on `blue-green-migrations.md`: headings were renamed, and
  the Bootstrap-lessons bullets (rrsync, exit 127, openrsync, MinIO image pin,
  ACME/DNS, key pairs, apt lock, orphan containers, Docker-group root
  equivalence, no second Compose project) are present in `provisioning.md`.
  `docker.md` history saved byte-identical in `docker-audit-history.md`.
- The final independent reviewer subagent hit the account rate limit and
  produced no report. Its checks above were run by the lead; the apply was
  **not** independently re-reviewed after the writers finished.

Not done: F61 (caddy "Local check" recipe stays), Q12, and the code follow-ups
(seller-throttler comment, Dockerfile comments, `packages/ui` empty dir,
`seed:base` reachable in production).
