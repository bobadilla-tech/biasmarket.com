---
name: implementation-plan
description: Plan a change end to end without writing production code. Researches the repo with throwaway probes, drafts a plan in .artifacts, runs subagent review rounds until they come back clean, then writes a paste-ready handoff prompt for a fresh implementation session (and a follow-up review-session prompt). Use when asked to "plan", "implementation plan", "handoff", or for any change that spans several files, touches data/behavior, or will be split into stacked PRs.
---

# Implementation plan flow

The plan session produces a plan and a handoff. It does not implement. Coding
happens in a fresh session that starts from the handoff, and review happens in a
third session (`pr-review` skill). Nothing is committed, pushed, or posted
unless the user asked for it. The one exception is the repo-tooling PR
(for example this skill) that the handoff tells the implementer to open first.

```
research (probes) -> draft plan -> review rounds -> final readiness review
   -> handoff prompt (implementation) -> review-session prompt
```

Artifacts live under `.artifacts/` (see `.artifacts/AGENTS.md`):
`.artifacts/YYYY/MM/YYYYMMDD--<TICKET-ID>--<short-slug>/`. Check for an existing
folder for the same work unit first; omit the ticket segment when there is none
(never invent one). Files: `plan.md`, `review-log.md`, `handoff-prompt.md`,
`review-handoff-prompt.md`. Leave them untracked unless asked to commit.

## 0. Rules for the session

- Do not edit production code, tests, schema, or generated files in the user's
  checkout. It may hold someone else's uncommitted work: run `git status` first,
  report it, and never stash, reset, or stage it.
- All probe/temp code goes in the session scratchpad or in a scratch worktree
  (`git worktree add --detach <scratch>/wt origin/main`). Remove worktrees at
  the end (`git worktree remove --force`, `git worktree prune`). Own throwaway
  Postgres/Redis only, non-default ports, deleted afterwards.
- Plans are written for the implementer, not the user: specific paths, names,
  commands. Facts from the repo are labeled as facts; everything else is an
  assumption and goes in "Open questions" with a recommended default.

## 1. Understand the request

- Restate the outcome and how success is recognized. Read the issues
  (`gh issue view`), linked docs/wiki, and `CLAUDE.md` hard rules.
- **Check what already shipped.** Issue checkboxes and pasted lists go stale:
  `gh pr list --state all`, `git log origin/main --grep`, grep for the symbols
  the issues say are missing. Re-scope to what is actually left.
- Check open PRs and local branches touching the same paths (collision risk) and
  pick the stack base.
- Do not plan from filenames or issue text alone; trace callers, data flow, and
  integration boundaries.

## 2. Research with probes

Test ideas before putting them in the plan. A probe is throwaway code that proves
or disproves one risky assumption, for example:

- a vitest/node script that runs the validators on the same inputs;
- the real controller or use case against a throwaway database to check a race,
  a migration on a populated table, or an old release's INSERT against the new
  schema;
- running the generators and typecheck on a clean worktree to learn the real
  verification commands and durations.

Record each probe in the plan: what ran, the result, and what it changed.
Probe code is not committed; keep it in the scratchpad and cite the path.

Spawn research subagents in parallel for independent areas (API, web, ops/CI).
Give each a self-contained prompt, a read-only constraint on the user's checkout,
and a cap on report length. Treat their reports as claims to verify, not facts.

## 3. Draft `plan.md`

1. Context and outcome (and what already exists / is already merged).
2. Current behavior with file:line references.
3. Proposed design and explicit non-goals.
4. Files and components (add / change / remove, with purpose).
5. PR stack: one PR per reviewable slice, in dependency order, each with base
   branch, scope, verification commands, and what it must not change. Put
   repo tooling (skills, docs) in its own first PR, ahead of feature work.
6. Sequenced steps, each with a completion signal.
7. Test strategy: unit, integration/e2e, migration, manual; success, failure,
   boundary, regression, security and tenant-isolation cases.
8. Risks and edge cases: concurrency, partial rollout (blue/green migration
   compatibility), PII in logs/audit, performance, rollback.
9. Acceptance criteria that can be checked objectively.
10. Open questions / decisions for the human, each with a recommended default.
    If an answer changes scope, stop and ask instead of assuming.

## 4. Review rounds (subagents)

Run independent reviewers in parallel, each given the plan, the request, and
only the context its lens needs. Lenses: correctness, repository fit, bug hunter
(races, partial rollout, odd inputs), security/privacy/tenant isolation, testing
(deterministic and sufficient), operations (migrations, deploy order, rollback),
simplicity (anything over-engineered or missing a smaller safer path).

Reviewer prompt: "Review this plan as a <lens>. Inspect the repo as needed. Find
concrete bugs, omissions, risky assumptions, inadequate tests. Cite the plan
section or file, explain impact, propose a specific fix. Do not rewrite the plan,
do not approve without evidence, do not edit files."

Log every finding in `review-log.md`: finding, reviewer lens, severity
(blocking / important / non-blocking), evidence, decision (fix / defer / reject /
ask), and the resulting plan change. Revise the plan rather than silently
applying ideas; resolve conflicting advice explicitly.

Fresh-eyes reviewers must not read earlier rounds; give later rounds the list of
known issues so they hunt for new ones. Repeat until two consecutive rounds
produce no blocking or important findings and no change to the plan; only
non-blocking notes count as clean. If findings keep appearing, summarize the
remaining uncertainty for the human instead of looping forever.

## 5. Final readiness review

One last subagent checks: the plan matches the current repo; every step has a
purpose and completion signal; all consumers and compatibility risks are named;
reviewer findings are resolved or documented; tests cover success, failure,
boundary, regression and security; no decision hides behind an unmarked
assumption; acceptance criteria are objective; implementation can start without
another broad discovery pass. Every open question must be answered by the user or have a stated default that
is safe to ship; a question that changes scope stops the session until the user
answers. Mark the plan `Status: ready` only after this.

## 6. Handoffs

`handoff-prompt.md` must be paste-ready and self-contained for a fresh agent:

```markdown
# Implementation handoff: <task>

## Mission
## Context            (ticket, base branch, stack, relevant paths, current behavior)
## Decisions already made
## Reviewed plan      (ordered steps, one PR per slice, branch names, bases)
## Review findings to preserve
## Verification       (exact commands; label planned vs run)
## Acceptance criteria
## Constraints and blockers   (do-not-change list; when to stop and ask)
## Stack base policy  (base of each PR, branches never to push to, retarget command)
## PR instructions    (open the PRs in order, stacked, using the repo PR format;
                       skills/tooling PR first; do not merge)
## First action       (read these files, confirm tree and branch, start step 1)
```

CI note: check which branches `.github/workflows/ci.yml` runs on. If it only runs
for PRs targeting `main`, say that stacked PRs get no CI and list the local
scripts the implementer must run instead.

Never claim a test passed unless it was run in that session. Do not hide
unconfirmed decisions inside the handoff: copy them under "Constraints and
blockers" with the default to use if the user does not answer.

`review-handoff-prompt.md` starts the third session: which PRs (numbers or
branches, filled in by the implementer at the end of their session), the plan
and review-log paths, the instruction to use the `pr-review` skill (review
notes and drafts first, verify by running code, review rounds, human approval
before posting), and the plan's acceptance criteria and known risks as the
review checklist. Each stacked PR is reviewed against its own base first, then
the stack top is re-checked (as `pr-review` section 0 describes); CI results are
only available for PRs whose base is `main`.

## 7. Final reply to the user

Give: what was found (including anything stale in the request), the PR stack,
decisions needed from the human, the paths of the artifacts, and the handoff
prompts (inline or by path). Then stop; the user starts the implementation
session themselves.
