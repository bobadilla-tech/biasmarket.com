---
name: pr-review
description: Review one PR or a stack of PRs end to end. Writes research notes and draft comments into .artifacts first, verifies every claim by running code, re-reviews the draft with subagents until it comes back clean, waits for a human to approve the drafts, then posts the review with gh. Use when asked to "review PR(s)", "code review", or "review the stack".
---

# PR review flow

Nothing is posted to GitHub until the human approves the drafts (phase 6).
Drafts and notes are Markdown under `.artifacts/` (see `.artifacts/AGENTS.md`).

## 0. Setup

- Identify PRs:
  `gh pr list --state open --json number,title,headRefName,baseRefName,headRefOid,additions,deletions`.
  Stacked PRs (each base = previous head) are reviewed per PR against its own
  base, then re-checked at the stack top.
- Reviewer identity: if several `gh` accounts exist, never switch the global
  one. Use `GH_TOKEN=$(gh auth token --user <login>)` per command and confirm
  with `gh api user --jq .login`. Ask the user which login if unclear.
- Folder: `.artifacts/YYYY/MM/YYYYMMDD--<slug>/` (check for an existing one; no
  invented ticket id). Files: `review-notes.md`, `draft-comments.md`,
  `review-rounds.md`.
- Scratch worktree under the session scratchpad, never the user's checkout:
  `git fetch origin 'refs/heads/<prefix>/*:refs/remotes/origin/<prefix>/*'`,
  `git worktree add --detach <scratch>/wt origin/<top-branch>`. Remove it at the
  end (`git worktree remove --force`, `git worktree prune`).
- Record head SHAs. Inline comments must use `commit_id` = head SHA.

## 1. Gather context (read-only)

- Per-PR diff, lockfile excluded:
  `git diff origin/<base>...origin/<head> -- . ':!pnpm-lock.yaml'`. Save to
  scratch files; read them fully, do not skim.
- Existing reviews/comments (`gh api repos/O/R/pulls/N/comments`, `/reviews`)
  and `gh pr checks N`. Do not duplicate bot or human comments; note which PRs
  had no review at all (bots often skip stacked bases).
- Spec: the plan/audit the PRs implement (`.artifacts`, `docs/`), including its
  per-phase definition of done and risk notes. Review against that.
- Repo rules in CLAUDE.md (tenant `storeId` filtering, ESM, pnpm only, generated
  clients committed, etc.).

## 2. Verify, do not guess

Anything that depends on code outside the diff must be checked at the top of the
stack: backend guards/services, shared packages, routing config, generated
clients. Then run what is cheap, in the scratch worktree:

- `pnpm install --frozen-lockfile --ignore-scripts` (an empty or stale lockfile
  is a real finding), then typecheck/lint/test for touched packages.
- Generators the repo requires you to commit (e.g. OpenAPI -> Orval); a failing
  generator is a finding.
- Small probes for suspected mismatches (run both validators on the same input).
- A script over all literal i18n keys vs catalogs; a script that checks every
  planned inline-comment anchor (below).
- Checks that cannot run locally (missing generated client, device behavior, CI
  logs): say so, phrase the comment as a question or "verify", never as fact.
- Runtime beats reading. Start your own throwaway Postgres/Redis (non-default
  ports; never touch containers you did not start; stop and delete them after)
  and, where the diff warrants it:
  - boot the real API and probe new endpoints (status, headers on
    200/4xx/429/500, unknown/oversized tokens, odd stored JSON shapes, throttle
    buckets);
  - apply all migrations to a populated table, run `prisma migrate diff`, and
    check the old release's INSERT still works; for a data backfill, fuzz the
    SQL against the JS function it claims to mirror (thousands of inputs) and
    diff the results;
  - reproduce suspected races with the real controller on a real DB (parallel
    calls, plus a barrier run), and compare with `origin/main` to say whether
    the PR introduced it;
  - mutation-test the new tests (break the behavior, see whether the suite still
    passes). Give mutation agents their own `git archive`/worktree copy and make
    them verify `git status` is clean afterwards, so parallel agents never see
    each other's edits.
- Compare the PR's `Closes #N` list with each linked issue's acceptance
  criteria. Helpers with no production caller yet usually mean `Refs`, not
  `Closes`.
- Separate live defects from latent ones (for example an endpoint no code can
  reach until a later PR issues tokens). Say which it is; it sets severity.

## 3. Write the notes and drafts

`review-notes.md`: scope table (PR, head SHA, review/CI state), what ran and the
result, findings grouped by PR with IDs and severity, stack-level observations,
"candidates investigated and dropped" (with reasons), "not verified".

`draft-comments.md`: a proposed posting plan (event per PR), one stack-level
comment, then per PR a review body and inline comments. Use this exact shape so
the posting script can parse it:

```
## #123: PR title

**Review body (COMMENT|REQUEST_CHANGES):**

> body text

### 123-1 · should fix · `path/to/file.ts:42`

> comment text
```

Rules for comments: written for the PR author; one problem per comment; state
the evidence (file, command, result) and a concrete fix; severity tag one of
`blocker`, `should fix`, `question`, `nit`; praise what is verified good
(briefly in the body). `REQUEST_CHANGES` only for things that break the branch
or are live defects; everything else `COMMENT`.

Anchors: path + line on the PR head (right side), and the line must be inside
that PR's diff hunks (`git diff -U3`, check `+start,count`). Verify mechanically
with a script that prints the line text.

## 4. Review rounds (subagents)

Repeat until a round finds nothing new to change. Log each round in
`review-rounds.md` (claim ledger, what changed, what was dropped and why).

Round A, adversarial: spawn one subagent per PR (or per 2-3 related PRs), in
parallel, each given ONLY: the draft comments for its PR, the head SHA, the repo
path/worktree, and the instruction to try to falsify each claim by reading the
code, to check anchors, to flag wrong severity, and to list anything the draft
missed. Tell them not to post anything and not to edit files. Fold results in.

Round B, gap hunt: a fresh subagent per area the drafts did not cover (security,
tests, CI/workflows, i18n/user-facing strings, migrations/data, backend
contracts) reads the diffs cold and reports issues not already in the drafts.

Round C, tone/quality: one subagent reads all drafts as the PR author would:
unclear, duplicated, too long, unverified-as-fact. Trim.

Round D, author's advocate: one subagent plays the PR author, tries to show each
comment is wrong, out of scope, pre-existing or disproportionate (checking the
code, the UI inputs, and `origin/main`), and recommends the review event. This
catches overstated severity and unrealistic repros. Accept honest downgrades.

Round E, final gate: one subagent validates the exact payload JSON that will be
posted: `commit_id` equals the current head (`gh pr view N --json headRefOid`),
every `path/line/side` (and `start_line`/`start_side`) sits inside the
right-side diff hunks, the anchored line text matches what the comment says, and
every factual sentence and number in the body traces to something that was run.
Drop synthetic counts and numbers you cannot trace. Do not describe something as
"confirmed at runtime" unless a report shows it ran.

Rules for rounds:

- Fresh-eyes subagents must NOT read earlier rounds or drafts; an independent
  agent re-finding the same bug is the strongest confirmation. Give gap hunters
  the list of already-known issues instead, so they hunt for new ones.
- Do not anchor a new inline comment on a line that already has a bot or human
  thread; reply to that thread ("Confirmed by trace, plus ...") instead of
  duplicating it (`gh api .../pulls/N/comments/{id}/replies -f body=...`).
- Do not attribute pre-existing behavior to the PR; check `origin/main`.
- Keep the review body short: what held up, the blocking list, a single
  follow-up-issue list for things outside the PR. Details go inline.

Stop when two consecutive rounds produce no new or changed findings. Do not loop
forever; if findings keep appearing, summarize the remaining uncertainty to the
human instead.

## 5. Human review of the review

Present, in the reply: the proposed event per PR, the findings ranked by value,
what was verified by running vs inferred, what was changed during the rounds,
paths of the three files, and the decisions needed (events, whether to include
comments on already-approved PRs). Then STOP. Do not post. Wait for explicit
approval; approval of drafts does not extend to pushing code to author branches.

## 6. Post

- Build payloads with a script that parses `draft-comments.md`, then one call
  per PR: `gh api repos/O/R/pulls/N/reviews --input payload.json` with
  `{commit_id, event, body, comments:[{path,line,side:"RIGHT",body}]}`. Post the
  stack-level comment first (`/issues/N/comments`).
- Confirm each returned state (`COMMENTED` / `CHANGES_REQUESTED`).
- If the user later asks for a different event, post a new review with a short
  body that points at the existing inline comments.

Before posting, re-check that the PR head SHA has not moved since the drafts
were verified. If it has, treat it as a re-review (below).

## 6b. Re-review after the author pushes fixes

Do not trust the author's summary. Fetch the new head, save the delta
(`git diff <old-sha>..<new-sha>`) and the author's replies, then:

1. Fix verification: a table of every item you raised (body items, each inline
   comment, each bot thread) marked FIXED / PARTIAL / NOT FIXED / DISPUTED
   (author right or wrong), each proven against the new code or by running it.
2. Regression review of the delta itself: fixes add new surface (new migrations,
   moved transactions, locks, allow-lists replacing deny-lists). Review them as
   new code, with the same runtime probes and a fresh-eyes hunter.
3. Run the same rounds (A to E) on whatever new comments result.
4. Choose the event honestly. A `COMMENT` review does not clear an earlier
   `CHANGES_REQUESTED`; the body must say the earlier review stays until you
   approve and what is needed for that. Approve only when nothing real is left.
5. Resolved threads can stay resolved; reply only where the fix is partial or
   introduced a new problem.
6. Items outside the PR (infra gaps, tooling drift) go in one follow-up issue
   suggestion, not as blockers, unless the PR claims to close them.

## 7. Optional: fix easy CI breakage

Only when the user explicitly allows pushing to the author's branches, and only
for mechanical fixes (lockfile regeneration, formatting). Use a scratch worktree
on the head SHA, make a normal commit (no force push), verify with the same
command CI uses, push, then watch `gh pr checks`. Code or behavior changes stay
with the author.

## Cleanup and hygiene

- Remove scratch worktrees; leave `.artifacts` files untracked unless asked to
  commit.
- Do not commit, push, or comment anywhere the user did not approve.
- Use they/them for people whose pronouns are unknown.
