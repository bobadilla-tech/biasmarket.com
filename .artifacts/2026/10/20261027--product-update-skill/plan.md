# Plan: Bias Market daily product update skill

## Outcome

Create a Claude skill in `.claude/skills/product-update/` based on the
user-pasted `product-update` instructions and tailored to this repository. It
should summarize daily work in `America/Lima` time, rely on GitHub CLI and local
repository evidence, identify gaps between issue requests and delivered PR
scope, request selective nontechnical QA from the cofounder, and save each run
as a unique dated `.artifacts` report.

## Scope

- Add `.claude/skills/product-update/SKILL.md` only for the new skill.
- Preserve existing checkout changes and reports.
- The skill may write only its per-run summary artifact. GitHub use is
  read-only.
- Do not send the summary or modify issue/PR state.

## Acceptance criteria

1. Claude frontmatter has the requested `product-update` name, summary
   description, and optional arguments.
2. Default report window is today's complete local day in `America/Lima`
   (UTC-5), with explicit date and timestamp handling.
3. GitHub CLI is the primary source for issues, PRs, reviews, comments, commits,
   and deployment evidence; local unmerged changes remain in progress.
4. The skill differentiates work status, merge state, deployment state,
   available QA, and partial delivery with follow-up tickets.
5. The cofounder receives QA requests only for useful, available customer-facing
   flows; backend work and minor fixes are technical notes.
6. Spanish is concise and plain, with no em dashes, and includes a clear QA call
   to action when appropriate.
7. Every report is saved in its own dated `.artifacts` folder without
   overwriting a prior report.
8. Evidence/completeness and audience/time-efficiency review passes are required
   before saving.

## Review plan

Run independent read-only review rounds for GitHub/evidence completeness,
nontechnical QA and Spanish clarity, and repository/Claude skill conventions.
Fix supported findings, then perform a final local review and skill validation.
