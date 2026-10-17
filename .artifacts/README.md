# Work artifacts

This directory stores historical artifacts created while completing a unit of
work: plans, audits, investigation notes, design decisions, handoff prompts,
implementation logs, review notes, and similar Markdown files.

## Layout

Each work unit has a dated folder under its year and month:

```
.artifacts/YYYY/MM/YYYYMMDD--<ticket-id>--<short-slug>/
```

Omit the ticket segment when there is no ticket. Keep the slug short and
lowercase. A work-unit folder can contain multiple related files; use clear
names such as `plan.md`, `audit.md`, `handoff-prompt.md`, and
`implementation-log.md`.

## How to use these records

Artifacts are snapshots, not living documentation or a backlog. Save plans and
working notes here when they are useful to preserve, alongside the work they
describe. Once a work unit is complete, leave its folder as a historical record.
Verify every claim against the current code and system state before relying on
it. Product documentation, runbooks, and maintained references belong in their
normal locations under `docs/` or alongside the relevant code.
