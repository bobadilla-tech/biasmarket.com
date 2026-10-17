# Artifact instructions

Read this before creating or editing files under `.artifacts/`.

## Folder naming

Use `.artifacts/YYYY/MM/YYYYMMDD--<TICKET-ID>--<short-slug>/`. The date is the
work start date. Omit the ticket segment when there is no ticket; do not invent
one. Use a short, lowercase, hyphenated slug.

Before creating a folder, check whether the same work unit already has one. Add
related plans, handoff prompts, audits, implementation logs, and review notes to
that folder. Start a new folder for a separate task.

## Editing and content

- Keep artifacts in Markdown. If a task requires other generated files, scope a
  `.gitignore` to that task folder; never ignore `.artifacts/` globally.
- These files are historical snapshots. Avoid editing completed work folders;
  put later corrections or follow-up findings in a new work folder.
- Re-verify artifact claims against current code and system state before using
  them as present-tense facts.
- Keep maintained product documentation and runbooks in their normal `docs/` or
  code locations, not in `.artifacts/`.
