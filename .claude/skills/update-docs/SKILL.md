---
name: update-docs
description: Audit and update the maintained documentation in docs/ (business and core) against the actual code. Sweeps apps/ and packages/, finds stale claims, gaps, broken links and missing docs, writes a proposal (additions, edits, deletions) into .artifacts, runs subagent review rounds until clean, then applies the approved changes on a docs branch. Use when asked to "update docs", "audit docs", "docs are stale", "document X", or after a feature/infra change that docs should reflect.
---

# Update docs flow

`docs/` is a map, not a dump. A new developer reads the root overview, follows
links into topic docs (architecture, payments, deploy, i18n, ...), and can go as
deep as tradeoffs and state machines. The code is heavily commented, so every
technical claim in the docs must be checkable against it. This skill keeps that
true as the repo grows.

```
scope -> inventory -> verify claims against code -> find gaps
   -> proposal in .artifacts -> review rounds -> human approval
   -> apply to docs/ -> link/claim check -> summary
```

Two phases with a hard gate between them: **propose** (writes only under
`.artifacts/`), then **apply** (edits `docs/`) only after the user approves the
proposal, or when the user's request already said to apply directly (small,
single-doc fixes). Never commit, push, or open a PR unless asked.

## 0. Rules for the session

- Run `git status` first and report it. The checkout may hold someone else's
  uncommitted work (including doc moves or deletions in progress). Never stash,
  reset, restore, or stage it. If `docs/` has uncommitted changes, treat them as
  the current intent, not as errors to fix, and say so in the proposal.
- Proposal artifacts go in
  `.artifacts/YYYY/MM/YYYYMMDD--<TICKET-ID>--docs-<slug>/` per
  `.artifacts/AGENTS.md` (omit the ticket when there is none, never invent one;
  reuse an existing folder for the same work unit; do not edit completed
  folders). Files: `proposal.md`, `review-log.md`. Leave untracked unless asked.
- Maintained docs live in `docs/`, `apps/*/AGENTS.md`, `apps/*/README.md`,
  `packages/*/README.md`, `infra/**/README.md`, and `CLAUDE.md`. Historical
  audits, plans and handoffs belong in `.artifacts/`, never in `docs/`. Do not
  resurrect them there.
- Probe code and temp files go in the session scratchpad, not the repo.
- Verified facts and assumptions are labeled differently. Anything not checked
  against code, config, or a command run in this session is an assumption and
  goes in "Open questions" with a recommended default.

## 1. Scope

Pick one from the request, defaulting to a full sweep:

- **full**: every doc under `docs/core` and `docs/business`, plus per-app docs.
- **area**: one app/package/topic (for example `orders`, `deploy`, `i18n`).
- **diff**: docs affected by a PR, branch, or range
  (`git diff main...HEAD
--stat`, then map changed paths to docs via section
  2's code map).

State the scope and the commit being audited (`git rev-parse --short HEAD`) at
the top of the proposal. Business docs (`icp`, `gtm`, `outreach`) are strategy:
there is no code to check them against, so only flag broken links,
contradictions with `docs/core/product.md`, and stale facts such as pricing or
supported payment methods.

## 2. Inventory: docs vs code

1. List docs: `find docs -name '*.md'`, plus the per-app/package docs above.
   Read each in full. Note its audience, what it claims, and what it links to.
2. List code surface, from the repo and not from memory:
   - `apps/*` and `packages/*` (the set changes; do not trust this skill's or
     `CLAUDE.md`'s list).
   - API modules: `ls apps/api/src/modules`; routes via controllers or
     `apps/api/openapi.json`.
   - Prisma models and enums: `packages/db/prisma/schema.prisma`, migrations.
   - Web features: `ls apps/web/features apps/web/app/**`.
   - Queues/jobs: `packages/queue`, `apps/workers`.
   - Infra: `infra/**`, `.github/workflows/*`, root `package.json` scripts,
     `turbo.json`, `pnpm-workspace.yaml`.
   - Env vars: `.env.example` and config readers.
3. Build a **code map**: for each doc, the code paths it describes. Use it to
   decide which docs a change affects, and keep it in the proposal.

Spawn read-only subagents in parallel for independent areas (api, web+mobile,
packages, infra/CI, business flows vs implemented UI). Give each a
self-contained prompt, a read-only constraint, and a report cap. Their reports
are claims to verify, not facts.

## 3. Verify claims against code

For each doc, extract every checkable claim and check it:

- **Paths and symbols**: files, functions, classes, env vars, scripts exist
  (`ls`, `grep`). Cited line numbers drift, prefer path plus symbol.
- **Commands**: every command in a code block exists in a `package.json` script,
  a Makefile, or `infra/`. Run read-only/cheap ones (`--help`, `--dry-run`,
  `pnpm turbo run <task> --dry`) when practical. Never run deploy, migration, or
  anything destructive.
- **Behavior**: state machines, validation rules, rate limits, roles, ownership
  checks, retention rules. Read the implementation (for orders:
  `domain/order-status.vo.ts`, `order.entity.ts`), not the doc's summary.
- **Data model**: models, fields, enums, money as `Decimal`, `storeId` scoping.
- **Infra**: containers, domains, ports, workflows, deploy order vs
  `infra/vps/docker-compose.yml`, `deploy.sh`, workflows.
- **Versions and counts**: framework versions, "N modules", coverage floors,
  checked against `package.json`, `docs/core/ci.md` sources, CI config.
- **Links**: relative links and anchors resolve. Check with a script in the
  scratchpad (walk every `.md`, resolve relative targets, check anchors).
- **Business flows** (`buyer-flow`, `seller-flow`, `marketplace-flow`,
  `store-management-flow`): compare steps with the real routes/pages
  (`apps/web/app`, `features/`) and API endpoints. Mark steps that are planned
  but not built as such.

Classify each finding:

| Type         | Meaning                                                         |
| ------------ | --------------------------------------------------------------- |
| error        | doc says X, code does Y                                         |
| stale        | was true, referenced thing renamed/removed/moved                |
| gap          | real behavior, module, command or decision with no doc          |
| orphan       | doc not reachable from any index, or links nowhere useful       |
| dup          | same fact stated in two places, will drift (link instead)       |
| aspirational | doc describes a plan as if built (label it, or move to roadmap) |

Record evidence for every finding: doc path and quote, code path and symbol (or
command output).

## 4. Gap analysis: keep it a map

Check the navigation structure, not only individual facts:

- **Root entry point**: `docs/readme.md` is the front door: what Bias Market is
  (one paragraph), a reading order for a new developer, and links to
  `docs/core/readme.md` and `docs/business/readme.md`. If missing, propose it.
  Each folder `readme.md` is an index of its docs with one line each and "read
  this when ..." guidance. Note that `docs/core/readme.md` must index core docs,
  not hold the content of one topic: if a topic's content sits in a `readme.md`,
  propose moving it to a named file (for example `docker-dev.md`) and rebuilding
  the index. `docs/readme.md`, `docs/core/provisioning.md` and
  `docs/core/operations.md` are expected docs, not orphans.
- **Layering**: overview first, then topic docs, then depth (tradeoffs, state
  machines, failure modes, runbooks). A reader should know where to go next at
  the end of each doc: add "Next / Related" links.
- **Coverage**: every `apps/*` and `packages/*` workspace, every API module,
  every deploy/CI/ops flow, every cross-cutting concern (auth, multi-tenancy,
  payments state machine, i18n, theming, storage, queues, monitoring) has a home
  doc or a section in one. List what is missing as `gap` findings and propose a
  new file with an outline, source paths to read, and where it gets linked from.
- **Single source of truth**: when two docs state the same fact, keep it in the
  most specific doc and link from the other.
- **Why, not only what**: for architecture docs, tradeoffs and rejected
  alternatives belong in the doc (`.artifacts` plans are the evidence, link them
  as history, do not copy them). Re-verify any artifact claim against current
  code before using it as present tense.
- **Placement**: runbooks (deploy, incident response, migrations) stay
  operational: numbered steps, exact commands, rollback. Concept docs stay
  conceptual. Don't mix.
- Folder placement for new docs: product/engineering behavior under `docs/core`,
  strategy/GTM/flow narratives under `docs/business`. A new top-level folder is
  a scope question for the human.

## 5. Write `proposal.md`

Use this structure:

1. Scope, audited commit, `git status` summary, date.
2. Summary: counts by finding type, the top five problems.
3. Code map (doc -> code paths) and proposed doc tree (current vs proposed).
4. Findings table: id, doc, type, evidence (doc quote + code ref), severity
   (blocking = misleading or breaks a reader's work / important / minor),
   proposed action.
5. **Changes**, grouped as:
   - **Edits**: file, section, exact replacement text (or a precise before/after
     diff), and the evidence id.
   - **Additions**: new file path, audience, outline, sources to read, inbound
     links to add. Draft the full text for small docs, a detailed outline for
     large ones.
   - **Deletions / moves**: file, why it is safe (what links to it, where its
     value moves), and the link fixes required.
6. Link and index updates (every readme/index touched).
7. Open questions with recommended defaults. A question that changes scope (new
   top-level folder, deleting a doc with unique content, documenting a feature
   that may be removed) stops the session until the user answers.
8. Verification plan: link checker, command checks, commands the apply phase
   will run.

Writing style for doc text in the proposal (and later in `docs/`): plain,
present tense, concrete paths and commands, short sections, tables for reference
data, code blocks for commands, no marketing language, no status that will rot
("recently", "soon", dates in prose). Match the surrounding doc's voice,
wrapping (~80 cols, prose wrapped as Prettier does), and heading style. Link
with relative paths. Write for the reader the doc names: new developer, operator
on call, or nontechnical cofounder.

## 6. Review rounds (subagents)

Run independent reviewers in parallel on the proposal. Lenses:

- **Accuracy**: re-verify each finding and each replacement text against the
  code. Try to prove the proposal wrong. Check that nothing in new text is
  unverified.
- **Completeness**: modules, packages, workflows, env vars, commands not covered
  by any doc or finding. Compare against the inventory from section 2, not
  against the proposal's own list.
- **Navigation**: read as a new developer. Is there a clear path from the root
  to every doc? Dead ends, orphans, wrong reading order, missing "next" links.
- **Simplicity and drift**: duplicated facts, docs too long to maintain, content
  that belongs in code comments or `.artifacts`, prose that will go stale.
- **Safety**: no secrets, internal hostnames beyond what is already documented,
  customer data, or credentials in docs; deletions don't lose unique content.

Reviewer prompt: "Review this docs proposal as a <lens>. Inspect the repo as
needed. Find concrete errors, omissions, unverified claims, and broken
navigation. Cite the proposal section and the code path, explain the impact, and
propose a specific fix. Do not rewrite the proposal, do not approve without
evidence, do not edit files."

Log every finding in `review-log.md` (finding, lens, severity, evidence,
decision fix/defer/reject/ask, resulting change). Fix the proposal, don't just
note. Later rounds get the known-issues list and must hunt for new ones. Stop
when two consecutive rounds produce no blocking or important findings and no
change to the proposal. If findings keep appearing, summarize the remaining
uncertainty for the human.

## 7. Human gate

Present the summary, the proposed tree, the deletions, and the open questions.
Wait for approval of the proposal (or of named parts of it). Apply only what was
approved. If the user's request already authorized direct application and the
change is small and fully verified, skip the wait but still run one reviewer.

## 8. Apply

- Work on a docs branch only if the user asks you to branch; otherwise edit in
  place and leave the diff uncommitted. Preserve unrelated uncommitted changes.
- Make edits exactly as proposed; if code changed in the meantime, re-verify the
  claim before applying.
- Use `git mv` for moves (keeps history), update every inbound link in the same
  change, and update the folder index.
- Apply doc changes in the same change as any index/readme updates so no commit
  leaves an orphan or a broken link.
- Run the checks from the verification plan:
  - Relative-link and anchor checker over all `.md` files (zero broken).
  - Every command added or changed in a doc resolves to a real script/file.
  - Formatter used by the repo on changed docs (`pnpm fix` formats changed files
    and runs lint, so run only what the user wants; at least run the configured
    formatter for Markdown on the files you touched).
  - `git diff --stat` shows only docs and the intended files.
- Never claim a check passed unless it ran in this session.

## 9. Keeping docs current as the repo grows

When asked after a feature or infra change (diff scope), prefer small, targeted
updates over full sweeps:

- New API module or endpoint: owning module description, route/permission table,
  `docs/core/architecture.md` module list, and `docs/core/security-payments.md`
  if it touches money, roles, or tenant data.
- New or changed model/enum: data-model section, state-machine description.
- New env var or script: the doc that owns setup (`docs/core/docker-dev.md`,
  `deploy.md`, or `ci.md`) and `.env.example` consistency.
- New workspace or CI job: architecture monorepo tree, `docs/core/ci.md`'s
  wiring list, and the root index.
- New user-facing flow: the matching file in `docs/business/*-flow.md` and
  `docs/core/product.md`; roadmap items moved from planned to shipped.
- New i18n namespace: `docs/core/i18n.md`.
- Removed things: delete or rewrite the mentions, don't leave "formerly".

If a change is large enough to deserve a new doc, propose it per section 5
instead of appending to an unrelated doc.

## 10. Final reply to the user

Give: scope and audited commit, finding counts by type, the biggest errors
found, the proposed or applied tree changes, decisions needed from the human,
the artifact paths, and what was verified (and how) versus not checked. For the
propose phase, stop after this and wait for approval. For the apply phase, list
files changed and remind the user nothing is committed.
