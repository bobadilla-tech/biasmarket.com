---
name: product-update
description: Prepare a daily Spanish product and QA update for Bias Market from today's GitHub and local work, then save a dated evidence artifact. Use for cofounder progress summaries; do not use for code review or general status reports.
disable-model-invocation: true
argument-hint: "[fecha YYYY-MM-DD] [qa|progreso|ambos]"
---

# Daily product update

Prepare a concise, copy-ready Spanish update so Bias Market's nontechnical cofounder can understand what changed today and decide whether to test a meaningful customer flow. Gather evidence primarily with the GitHub CLI (`gh`) and this repository. Create a separate dated artifact for every run. Do not post or send the update.

## Scope and time window

- Confirm this is `bobadilla-tech/biasmarket.com` with `gh repo view`; stop if the current repository is different.
- Use `America/Lima` as the reporting timezone (UTC−5). For today, report from 00:00 local time through the time the summary is generated. For a past date, report the full local calendar day from 00:00 inclusive to the next day at 00:00 exclusive. Convert boundaries to UTC for GitHub API timestamps. State the exact local date, time window, and timezone in the artifact.
- `$ARGUMENTS` may contain one date (`YYYY-MM-DD`) and one of `qa`, `progreso`, or `ambos`. Default to today's date and `ambos`. If a past date is supplied, summarize that full local calendar day. `qa` returns the QA decision and any ready-to-send QA request; `progreso` returns only the product and technical progress message and must not include a QA checklist or QA call to action; `ambos` returns progress and the selective QA request in one message. In every mode, keep the full evidence and status distinctions in the artifact. Do not silently expand to a range or baseline; those are outside this skill's daily-report scope.
- Report activity during the window, not just records created during it. An older issue or PR with a comment, review, commit, or status change today can be relevant. Do not infer an event's exact time from `updated_at` alone; inspect the event, review, comment, commit, or workflow timestamps when available.
- Use `gh auth status` and read-only GitHub commands. Do not create, edit, close, label, or comment on issues or PRs; do not send messages, deploy, or change application code. Creating the summary artifact is the only intended write.

## Gather and verify the day's work

1. Inspect `git status`, the local commit log, and diffs for relevant tracked or untracked work. Preserve all existing changes. Local diffs have no dependable start time: include them as work done in this window only when a commit, dated artifact, or reliable timestamped activity ties them to the window. Otherwise label them as ongoing with an unknown start date or omit them from the day's activity. Treat local edits as in progress unless a merged PR or other evidence proves they shipped. Do not include secrets or private customer data.
2. Use `gh` to identify repository issues and PRs created or active in the time window. Derive exact UTC start and end instants first. For issue/PR candidates, use a paginated read-only search bounded by the UTC calendar dates that overlap the report window, plus one UTC calendar date on either side to account for timezone boundaries. For example, use `gh issue list --state all --search "updated:>=FIRST_UTC_DATE updated:<DAY_AFTER_LAST_UTC_DATE" --limit 1000` and the equivalent `gh pr list`; split the search into smaller date windows if needed to stay within GitHub Search limits. This is only a broad candidate filter. For each candidate, inspect timeline, comment, review, and commit timestamps and include only events within the exact UTC instants. Find commits with the repository commits API bounded by UTC start and end (`since` and `until`). Find deployments through the relevant GitHub Actions deployment workflow runs and deployment records. Include runs created before the report window if they completed or produced a deployment event inside it. Inspect completion or deployment timestamps, not just creation time. Paginate far enough to cover the relevant time range; if the relevant runs cannot be fully checked, state that deployment could not be verified. Use only read operations such as `gh issue list`, `gh pr list`, `gh issue view`, `gh pr view`, `gh run list`, and `gh api` GET requests. Confirm issue/PR links and current state.
3. For each candidate, read the issue acceptance criteria, PR description, changed files or diff, linked/follow-up tickets, review findings, and relevant CI/deployment evidence. Use source code or docs to resolve ambiguity. Do not claim to have reviewed a large diff unless it was actually inspected; focus on user-facing paths and the parts needed to check scope.
4. Verify status distinctly: `en trabajo`, `PR abierto`, `fusionado`, and `desplegado`. Merging into `main` does not prove production deployment. Require a successful production deploy/run or equivalent direct evidence. If deployment cannot be verified, say `despliegue no verificado` and do not invite production QA. If the work is only available in a preview, include its URL only when verified and state that it is a preview.
5. Compare each issue's requested outcome with what the PR actually delivers. Call out any partial delivery plainly: what was completed, what is missing, and the linked follow-up issue/PR if one exists. Do not label the original issue fully complete based only on PR wording. Mention blockers or deferred scope with a link.
6. Group related commits and PRs by customer capability or journey, not by implementation layer. Link supporting PRs/issues in the internal artifact. Separate customer-visible progress from technical maintenance.

If GitHub CLI access, event history, deployment evidence, or local repository state is unavailable, say exactly which source could not be checked. Do not fill gaps with guesses. A first run does not silently expand to all history: use only the requested day by default.

## Decide whether to ask for manual QA

The cofounder is not technical. Ask them to test only a meaningful, user-observable journey that is both available and useful to verify in the confirmed environment. Good candidates include a new usable feature, a substantial change to storefront, checkout, payments, order creation, login, navigation, or a major mobile experience, and consequential behavior that automated checks may not catch.

Do not ask the cofounder to test backend/API behavior, migrations, internal refactors, CI, developer tooling, automated test results, or small low-risk bug fixes. Report relevant work in a separate short technical note with its PR/issue links. Bundle a small visible fix into a related QA session instead of creating a separate request. Automated coverage informs the decision but does not by itself establish that a user journey needs no manual review.

For every proposed QA session, verify deployment or preview availability, prerequisites, and access URL. Give 3 to 7 short actions for the whole session, with an observable expected result. Describe user actions in plain Spanish. Do not give code, terminal, database, or admin-only instructions. Do not invent test accounts, data, URLs, or credentials. If special setup is needed, state it simply. Ask the cofounder to report what felt confusing or broken and share a screenshot when useful.

For `qa` and `ambos`, include a direct, polite call to action when at least one valuable flow is ready for QA. Ask the cofounder to test the named flow and say what feedback would help. If no flow merits manual QA, say clearly: `Esta vez no hace falta pedir QA manual` and give one brief reason. If a proposed flow is not deployed or available, do not include that flow in QA. Report it separately as unreleased or unavailable. Mark the whole draft `NO ENVIAR TODAVÍA` only when the update's main purpose depends on an unavailable flow or when no part of the message is ready to send; explain what availability evidence is missing. A ready flow may still be tested even if other work is unreleased. `progreso` mode is progress-only and does not include a QA request.

## Write in clear Spanish

- Use short sentences, familiar words, and a friendly, direct tone. Avoid complex wording, unexplained technical terms, and em dashes. Use links for PRs, issues, or preview pages where useful.
- Lead with the product or customer impact. Never imply technical fixes are customer features. Put backend, small fixes, maintenance, and review/CI work under a concise heading such as `Otros avances técnicos`, with a plain description and PR/issue links.
- Be candid about partial delivery, open work, blockers, and what is not yet available. Distinguish done today from shipped and deployed.
- Never claim a test, review, merge, or deploy succeeded without current evidence. Avoid duplicating the same item in multiple sections.

## Save one dated artifact per run

Read `.artifacts/README.md` and `.artifacts/AGENTS.md` if their conventions are not already in context. Save the complete report as Markdown under `.artifacts/YYYY/MM/YYYYMMDD--product-update/summary.md`, where the date is the report's local date. If that folder already exists, do not overwrite a prior summary; create a sibling folder with a short time suffix, for example `YYYYMMDD--product-update-1530`. If that path also exists, try the next available minute or add an incrementing numeric suffix until the folder is unique. These are historical snapshots. Do not edit completed reports later; create a new artifact for a correction or rerun.

The artifact should include:

- Report date, exact local time window, repository, and scope.
- A brief internal evidence summary: issues/PRs/commits considered, grouped product areas, deployment status, relevant local work, and what could not be verified.
- Requirement-to-delivery gaps and linked follow-up issues where applicable.
- The exact copy-ready Spanish message, including the selective QA CTA or the no-QA statement. If not ready to send, label it `NO ENVIAR TODAVÍA`.
- For each included item, direct GitHub links and enough evidence (status, event, deployment run, or inspected code path) to trace the claim. Keep internal technical detail out of the sendable text.

Before saving, do two review passes:

1. **Evidence and completeness:** Check today's activity window, timestamps, issue acceptance criteria against delivered scope, follow-up gaps, PR/commit links, and merge/deployment/preview status. Remove unsupported claims and confirm in-progress work is not called shipped.
2. **Cofounder time and clarity:** Remove backend or minor fixes from the QA ask, keep only an available user journey with useful steps, verify every step and expected result is understandable without technical knowledge, confirm the direct QA call to action, and simplify the Spanish. Check that the artifact is unique and preserves prior reports.

## Return to the user

Give a compact internal note with the date/window, evidence sources checked, deployment confidence, and the artifact path. Then provide the exact copy-ready Spanish message in a fenced text block. If it is not ready to send, put `NO ENVIAR TODAVÍA` at the top of that text. Do not call the artifact checkpoint “sent” or update any last-sent marker; sending remains the user's action.
