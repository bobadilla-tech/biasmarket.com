# Review handoff: LF line endings PR

Use the `pr-review` skill (notes and drafts first, verify by running code,
review rounds, human approval before posting) on PR: <fill in number/branch>.
Plan: `.artifacts/2026/10/20261029--dev-scripts-crlf/plan.md`; log: `review-log.md`.

Checklist: plan.md section 9 acceptance criteria; confirm `.gitattributes` yields
`w/lf` for `*.sh` in a `core.autocrlf=true` clone; confirm renormalize causes no
other diff; confirm scripts/compose untouched; docs recovery commands correct
and not destructive without a warning. Base is `main`, so CI results apply.
