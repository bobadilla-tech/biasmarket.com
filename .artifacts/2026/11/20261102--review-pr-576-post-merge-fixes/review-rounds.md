# Review rounds: PR #576 post-merge fixes

## Round A: adversarial review

- API reviewer confirmed #591, #592, and #603 drafts; found the #602
  change-email confirmation race. Added it to the #602 draft and notes.
- Release reviewer confirmed the existing #586 bot findings. It falsified the
  #608 claim that semver/yaml versions were removed. Follow-up inspection of the
  exact #608 head showed the mobile importer still resolves the old AJV 8.20.0
  peer context, so the #608 lockfile comment was dropped.
- Mobile reviewer confirmed the #587, #597, and #601 findings. It suggested a
  duplicate-order risk on #600; the plan explicitly accepts and tests that
  residual, so no comment was added.
- No posts or branch changes were made during this round.

## Round B: gap hunt

- API gap hunt found a concurrent `changePassword`-vs-delete race, but the plan
  assigns that writer's `lockLiveBuyerAccount` guard to the separate 6b-race
  slice, not #602. It is recorded as out of scope for these PRs, not posted as a
  #602 finding. No other API issue was found.
- Mobile gap hunt found the #600 409/410 retry path treats a rejected
  `AsyncStorage.removeItem` as a successful key reset; added one comment at the
  changed retry handler. It found no other new mobile issue.
- Release/workflow gap hunt found no new concrete issues.
- No posts or branch changes were made during this round.

## Round C: author-facing tone and quality

- The reviewer found no duplicated or unclear findings. Applied optional wording
  edits: removed evaluative phrasing, unnecessary hosted CI claims and local
  test counts, clarified that deployment prerequisites are separate from code
  review findings, and removed #594 because it merged during review.
- No finding or severity changed in this round; no posts or branch changes.

## Round D: author's advocate

- Fresh review confirmed all five proposed `REQUEST_CHANGES` events are
  proportionate. It independently verified the existing #586/#587 findings and
  the #597/#600/#602 findings. It confirmed #602's email race is in scope
  because the plan expressly requires deleted accounts not be revived through
  change-email confirmation; the evidence is source-level, not a DB race run.
- No findings were dropped or downgraded. No posts or branch changes.

Rounds C and D produced no new or changed findings.

## Round E: exact posting payload gate

- The first pass caught two #597 anchor mistakes: the checkout error anchor
  should be line 45, and the validation test anchor should be line 65. Both have
  been corrected. The other new anchors and the five #586 unresolved CodeRabbit
  thread IDs match the current heads.
- Final revalidation pending.

## Posting constraint

- GitHub rejected the first #586 review attempt because `UltiRequiem` authored
  the PR and cannot submit `REQUEST_CHANGES` on their own PR. Confirmed every PR
  in this stack has the same author. Submit `COMMENT` events with the same
  concrete findings and reply in the existing #586 threads; then continue with
  the already-authorized branch fixes.
