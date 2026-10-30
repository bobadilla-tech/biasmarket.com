# Review handoff: Mobile Release dependency fix

Use the repository's `.claude/skills/pr-review` workflow to review the
implementation PR opened from
`.artifacts/2026/10/20261030--mobile-release-failures/handoff-prompt.md`.

At review-session start, fill in the actual PR number, branch, head SHA and base
SHA. Review the PR against `main`, inspect existing review comments, and verify
the dependency resolution and both platform Metro export claims by running code.
Use fresh-eyes review rounds and keep drafts/artifacts before any GitHub review
action; do not post without the required human approval.

Use the reviewed plan and `review-log.md` as the acceptance checklist. Preserve
these known risks:

- The issue is an undeclared app-level Babel preset used by
  `apps/mobile/babel.config.cjs`; both platforms fail at Metro bundling.
- Pre-merge verification can validate dependency installation, app-context
  resolution, platform exports and PR CI. Full native release verification is
  post-merge because platform jobs checkout the chosen release tag.
- A new tag containing the merged fix is required for full release validation.
  Do not move existing tags.
- Confirm the documented APK and unsigned iOS archive attach successfully, and
  distinguish those post-merge release results from PR checks.
