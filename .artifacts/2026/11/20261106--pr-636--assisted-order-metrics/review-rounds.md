# Review rounds — PR #636

Head SHA under review: `4863c3c58c23a6063dd980b53d719cbf48fda99f`.

## Setup notes

- Reviewer identity `crydafan` is the PR author, so the postable event is
  `COMMENT` only (GitHub rejects `APPROVE`/`REQUEST_CHANGES` on self-authored
  PRs with 422).
- CI on the head is fully green; the seven CodeRabbit threads are resolved and
  outdated, so this review does not repeat them.
- Scratch worktree: `git worktree add --detach <tmp>/wt 4863c3c5`; removed after
  the review.
- Throwaway infrastructure used for verification (all removed at the end):
  Postgres 16 on `55432`, Redis 7 on `56379`, both started by this session.

## Round A — adversarial (per-PR)

First subagent `d7b7e69b-18fc-4554-98c4-6e2415c38e48` ran long and was
interrupted without a report; replaced by `194e69d5-b561-40da-87cd-afe3685222e1`
with a strict time box (read-only, no tests).

The replacement also ran long and was interrupted without a report. The draft
was therefore adversarial-checked by the reviewer directly: every claim re-read
against the head worktree, every anchor matched with a script (see round E), and
the two "should fix" items reproduced with a scratch render test and a real-DB
probe.

## Round B — gap hunt (fresh eyes)

- Web/i18n: `da0d5559-79bc-4e33-b562-2cc16d8c48a4` reported. New accepted
  findings: (a) the metrics page uses ad hoc loading/error/empty markup instead
  of `components/shared/*` as `apps/web/AGENTS.md` requires, losing
  `role="status"`/`role="alert"`; (b) the time-to-payment card shows the
  assisted median as the main value but compares it with the assisted average
  and the marketplace median, with hardcoded "Mkt" and an unused
  `cards.medianMinutes` key. Its other items were checked and dropped: locale
  number formatting (the repo's existing stats component also uses
  `toFixed(1)}%`; no SSR hydration path for these numbers), the zero-PII DOM
  test only scanning a hand-written fixture (test-quality, the API test already
  asserts serialized JSON), the sidebar test-only exports, the untested
  `useAdminMetrics` hook, the swallowed store-filter error, duplicate helpers,
  and missing `<caption>`/`scope`.
- Backend: first subagent `e03dacda-...` also ran long and was interrupted
  without a report; replaced by `d49c7405-4e00-405b-a0a5-0dd1b96238cb` with a
  strict time box.

Only the web/i18n hunter reported; the backend replacement (`d49c7405`) was
also interrupted without a report. The backend diff had already been read line
by line and exercised against a real Postgres, including >500-row pagination, so
the backend review rests on that direct verification rather than on an agent.

## Round C — tone/quality

Read the drafts as the author would:

- Body trimmed to what held up, the two should-fix items, the nits, and the PR
  description mismatch. Removed an inaccurate claim that G1/G3 use
  `countsTowardPaid`; corrected the 30% boundary attribution to the unit tests.
- 636-1 was shortened to lead with the reproduced behaviour, then the fix.
- 636-2 states the exact rendered text/classes instead of describing them.
- Dropped the "Mkt" standalone nit (folded into 636-8) and the hardcoded-30%
  comment (round D).

## Round D — author's advocate

Tried to show each remaining comment is wrong, out of scope, pre-existing or
disproportionate:

- 636-1: the author can argue the weekly breakdown is the intended scope and
  the docs now say "within that week". Counter: #278/#466 and the plan define
  the metric per store, and a cross-week return is invisible; kept as
  **should fix**, with the explicit alternative of narrowing the issue/docs.
- 636-2: "0/0 makes it obvious there is no data." Counter: the card shows a
  green icon and "Meta: 30%" while the callout says "Sin datos"; kept
  **should fix** (small, user-facing, same class as the bot's earlier callout
  finding).
- 636-3: "the metric is named link-open; seller previews are negligible."
  Counter: the docs claim "by the buyer's browser"; kept as **question**, with
  the doc-wording alternative.
- 636-4: "the guard is library-tested; e2e is scope creep." Kept as **nit**
  because the test's name overstates what it asserts.
- 636-5..636-8: all survive as nits; none is a pre-existing defect.
- Dropped the hardcoded-30% comment as disproportionate (the benchmark is fixed
  by the issue and the copy would change with it).
  Review event stays `COMMENT` because GitHub rejects `APPROVE` /
  `REQUEST_CHANGES` on a self-authored PR.

## Round E — final payload gate

- `gh pr view 636 --json headRefOid` = `4863c3c58c23a6063dd980b53d719cbf48fda99f`
  (unchanged since the drafts were written); `commit_id` in the payload matches.
- Every anchor checked mechanically: file, right-side line, line text, and
  `+start,count` hunk membership. All 8 anchors are in entirely added files, so
  every line is in the diff.
- Body numbers traced to `review-notes.md`: 77 API stats tests, 18 web admin
  tests, 10 i18n tests, 521 assisted / 3 marketplace orders, 526 payments, 941
  events, 24 CI checks with none failing on the head SHA. Prose was changed
  from "confirmed at runtime" to the specific commands that ran.
- No synthetic counts. No claim of a real-HTTP admin/seller check (none was
  run); the body says so under "Not verified".
- Posting: one review with `event: COMMENT`; no stack-level comment (single PR).

## Post-review edit (user request)

Ran the no-ai-slop pass over `draft-comments.md` after the review rounds:

- Cut "reviewed in depth", "admin-only is real", "before treating the pilot
  numbers as trustworthy", "swapping them in is mechanical", and "so the metrics
  diff stays focused".
- Replaced the one prose em dash with a semicolon; the remaining `—` characters
  are the literal UI placeholder quoted in 636-2.
- Split the long time-to-payment sentence into three, and the "same happens
  through StatsService" sentence in 636-1 into two.
- Fixed 636-7's "these three blocks": only the loading and error blocks live in
  that file; the weekly table's empty message is the third state.
- Turned "Also, the PR description's ..." into a direct "The PR description is
  stale: ...".

No factual claim, number, evidence item, or anchor changed. Payload rebuilt and
re-validated: 8 comments, all anchors inside the diff, `commit_id` unchanged.
