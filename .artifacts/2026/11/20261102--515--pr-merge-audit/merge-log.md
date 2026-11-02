# #515 PR merge audit

Date: 2026-11-02 (America/Lima)

## Feedback check

Checked issue comments, inline review comments, and review events on #581, #582,
#583, #593, #585, and #598 before merging. No new human-authored comments or
reviews had arrived since the prior review. #582 retained an earlier Codacy
`ACTION_REQUIRED` finding on `new RegExp` built from the fixed `VOSEO_FORMS`
constant; it uses no external input and is not a required check. Required
`CI Success` was green on all six heads.

## Merges

- #585 merged separately by squash at `75b988900988f0d97e1413f3057a636b5af628c4`
  (head `0ffe4ace62666ac60ed8e6ec393fa8f21d6f3d35`).
- The stacked #581, #582, #583, #593, and #598 PRs were merged together through
  GitHub's asynchronous stacked-PR API, direct merge with rules bypass disabled,
  at `438d287727de350d7eab915e606831927b49810b` (top head
  `cad0dcfe090f49ed096e8b6884b8c873b28baaa9`).
- GitHub reports all six PRs merged. The three prior inline findings on #585 and
  #598 remained resolved.

## Post-merge status

The `main` CI run for stack merge commit
`438d287727de350d7eab915e606831927b49810b` (run 41492028850) completed with
required `CI Success` green after rerunning the Mobile job. The first run failed
only `session-context.component.tsx` with `render function has not been called`;
the rerun passed, with no code changes. The earlier `main` CI run for #585 merge
commit `75b988900988f0d97e1413f3057a636b5af628c4` was cancelled by the
subsequent main push. No deployment claim is made.

Open #594 (Caddy token/idempotency-key redaction) and #602/#603 (buyer-account
deletion safeguards and API typing) refer to other acceptance criteria and were
not part of this #515 stack.
