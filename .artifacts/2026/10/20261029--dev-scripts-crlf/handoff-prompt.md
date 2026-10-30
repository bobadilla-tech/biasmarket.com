# Implementation handoff: LF line endings so docker dev scripts run on Windows

## Mission

Fix `workers-dev.sh: 5: set: Illegal option -` /
`api-dev.sh: 7: set: Illegal option -` when running `pnpm docker:dev` from a
Windows checkout, by adding a root `.gitattributes` forcing LF, plus a short
docs note.

## Context

- Base `main`, single PR, branch `fix/gitattributes-lf-eol`.
- Root cause (reproduced with dash on a CRLF copy): Windows `core.autocrlf=true`
  checks scripts out as CRLF; `set -e\r` makes dash fail. Repo has no
  `.gitattributes`; index is already LF. Scripts are bind-mounted in
  `infra/docker/docker-compose.dev.yml` (`- ../..:/app`).
- Full detail: `.artifacts/2026/10/20261029--dev-scripts-crlf/plan.md`.

## Decisions already made

- Fix with `.gitattributes`, not by editing scripts or compose, no `tr -d '\r'`
  wrapper.
- No new CI job.

## Reviewed plan

Follow plan.md sections 3, 5, 6 in order.

## Review findings to preserve

review-log.md: only self-review was done; step 2 (renormalize shows no other
diff) is the key guard.

## Verification

All planned, none run yet: `git add --renormalize . && git status --short`;
`git -c core.autocrlf=true clone . <scratch>/win` then `git ls-files --eol`
(expect `w/lf` for `*.sh`) and `sh -n infra/docker/scripts/*.sh`; negative
control on `main`; `pnpm fix`.

## Acceptance criteria

plan.md section 9.

## Constraints and blockers

- pnpm only; don't touch the `packageManager` pin.
- If renormalize touches files other than `.gitattributes`, stop and ask
  (default: narrow to `*.sh text eol=lf` only).
- Do not touch the user's checkout state beyond the branch; use scratch dirs for
  clones.

## Stack base policy

Base `main`. Never push to `main`.

## PR instructions

One PR, repo PR format, do not merge. Mention in the body the recovery commands
for existing Windows clones.

## First action

Read plan.md, `git status`, confirm branch is clean `main`, create the branch,
do step 1.
