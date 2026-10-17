# Review handoff: lint, coverage and CI trust stack

Use the `pr-review` skill (`.claude/skills/pr-review`). Do not post anything
until a human approves your drafts.

## What to review

The implementer's PRs (fill in at the end of the implementation session):

- PR 1 `ci/lint-everywhere` : #____
- PR 2 `ci/lint-frontends` : #____
- PR 3 `ci/coverage-everywhere` : #____
- PR 4 `ci/workflow-lint` : #____ (may be absent)
- PR 5 `ci/mobile-bundle-smoke` : #____ (only if the user approved Q3)

PR 0 `ci/run-on-all-prs` : #____ (review first: trigger change, `BASE_REF`
handling). After PR 0 is on `main`, PRs 1-4 may be stacked and still have CI
results; review each against its own base and read its CI run, then re-check the
last PR on top of current `main`.

## Source of truth

`.artifacts/2026/10/20261029--ci-lint-coverage-hardening/plan.md`,
`review-log.md`, `handoff-prompt.md`. Write review notes in a new folder under
`.artifacts/` per its `AGENTS.md`; verify claims by running code, not by
reading.

## Checklist (from the plan's acceptance criteria and risks)

1. `pnpm turbo run lint` prints `Tasks: N successful` with N = number of
   `package.json` in `apps/*`, `packages/*`; no "No tasks were executed".
2. Guard script rules match the PR they ship in (rule 1 in PR 1; rules 2, 3 only
   in PR 3); `hygiene` stays green on main after each merge.
3. New job wiring complete in all 7 places + `HYGIENE_RESULT` branch; run the
   synthetic-env matrix for `scripts/ci/check-ci-success.sh` yourself; a
   filter-key typo must make it fail.
4. Every job whose `lint` uses `lint-changed-files.mjs` has `fetch-depth: 0`
   (including pre-existing `workers`, `validation`, and `mobile`).
5. Parser config: `.ts` has no `jsx` plugin; `<number>x` assertion in a `.ts`
   file parses; Nest decorators parse; `metadata.ts` ignored; unused-disable
   warnings do not fail `--max-warnings 0`.
6. turbo: `lint` and `web#lint` inputs include root config + script and keep
   `$TURBO_DEFAULT$`; editing only the root config re-runs lint. `test:cov` has
   `outputs: ["coverage/**"]`; each new upload step has a preceding `test -f`.
7. Coverage: `include`/`exclude` correct per workspace (types has no `src/`;
   mobile scoped to tested logic files), floors = `floor(CI - 3)`, raising a
   floor by 1 fails the job; Codecov flags for all 8 in `codecov.yml`; no
   `--passWithNoTests` left.
8. Lockfile diff small and only intended deps (Prettier formatted).
9. Prettier-dirty files fixed only in the PR that adds the gate.
10. Security: no `pull_request_target`; `permissions: contents: read`; new
    actions SHA-pinned; actionlint binary sha256 committed; no changes to
    `infra/vps/*`, `cd.yml`, `mobile-release.yml`.
11. Overlap with open PR #236 is called out in PR bodies 2 and 3.
12. Known risk to confirm: a red coverage floor or `hygiene` on a `main` push
    blocks CD; `docs/core/ci.md` documents the manual `deploy.sh` path and that
    mobile bundling is NOT covered (unless PR 5 shipped).

If a PR was opened before PR 0 merged against a non-`main` base, it has no CI;
say so and review it locally with the commands in the handoff.
