# Review rounds

Note on process: the user asked to post at the end, so I ran one combined
adversarial/author's-advocate round (A+D) with two fresh subagents instead of
the full A-E loop to two clean rounds. Round B (gap hunt) was covered by the
four primary reviewers (each read the diffs cold and hunted beyond the
checklist), and round E was done mechanically (below). The remaining uncertainty
is that no second consecutive "nothing changed" round was run.

## Round 0: heads moved

The author force-pushed all eight PRs while the primary reviewers were running
(old tips 25ab30ec c3c98df0 6e41746c b0605abe d836cd7e c5edc352 269a0b60
bc0966f3 -> new 047a55ca 2326b8ee dd8ef050 2912ce5c 75064635 b6a24737 ffc8e104
0fcb0667). `git range-diff` showed 25ab30ec = 047a55ca and 6c66f515 = c3c98df0;
tree delta old top -> new top = three e2e `randomUUID` edits + `buildPreview`
switch (plus the skill/.artifacts files that #323 put on main). All reviewers
re-based their line numbers on the new heads.

## Round A+D (adversarial + author's advocate), two fresh subagents

| Claim                                                                 | Outcome                                                                                                                             |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 325-1 teardown FK                                                     | Held (CI log: `Test Files 1 failed                                                                                                  |
| 325-2 flaky regex                                                     | Held; evidence changed to the cuid containing a 9-digit run; dropped "1 of ~6".                                                     |
| 325-3 deadlock test on reused DB                                      | Held; counts reworded as "in my runs".                                                                                              |
| 325-4 throttle guard unpinned                                         | Downgraded to nit (behavior correct; plan asks for the e2e).                                                                        |
| 325-5 legacy cross-store count                                        | Held (nit-level wording left as should fix).                                                                                        |
| 325-6 checkout-vs-assisted race                                       | Downgraded to question/follow-up; the PR body already lists it as out of scope; removed "mention in PR body"; dropped round counts. |
| 325-7 (403 vs 404)                                                    | Dropped: PR body states 403 owner / 404 missing and it matches every seller orders route.                                           |
| 325-8 alias regex                                                     | Held; replaced the suggested `\p{Cf}` (would reject ZWJ emoji / ZWNJ) with an explicit class; raw U+2028 removed from the draft.    |
| 326-1 buyer route exposure                                            | Downgraded to question (latent); "plan says" softened to "plan's intent"; added stale-comment note.                                 |
| 326-2 `createdByName` null                                            | Held.                                                                                                                               |
| 327-1 ICU `{{link}}`                                                  | Held; re-run on `intl-messageformat@11.2.15` (throws; quoted and `{token}` forms render).                                           |
| 329-3 (payment-methods warning)                                       | Dropped: plan says "warning when no methods are configured".                                                                        |
| 329-4 (unpublished e2e)                                               | Downgraded to optional nit; fixed wording (`findPublicBySlug` passes `isPublic` to `isStoreIndexable` but does not gate).           |
| 329-5 "51/51"                                                         | Number removed (untraceable).                                                                                                       |
| 331-1 (send/copy rotates w/o confirm)                                 | Dropped: plan requires the warning text, which exists (`sendLinkWarning`).                                                          |
| 329-1/2, 330-1/2/3                                                    | All reproduced again by probe; added loading-state note to 329-2, trigger scope to 330-1.                                           |
| Missed: seller preview link stamps first-open                         | Verified in code (anchor `href={href}`), added as 330-4 (latent until #268).                                                        |
| Missed: stale lookup/stock caches after create                        | Low, not added.                                                                                                                     |
| Missed: `correctPhone` `createdByUserId ?? userId`, hard-coded `/es/` | Nit/question, not added.                                                                                                            |

Untraceable figures were reworded as "in my runs", dropped, or moved to a
statement of what was run (see review-notes.md).

## Round E (final gate, mechanical)

`build.py` parses `draft-comments.md`, builds one payload per PR, and for every
inline comment checks that the line is an added line inside the right-side hunks
of `git diff -U0 origin/<base>...origin/<head> -- <path>` and prints the line
text. Result: all inline anchors OK. `commit_id` is set to the current head SHA
and re-checked against `gh pr view N --json headRefOid` immediately before
posting.

## Round F (re-review after the author's second push, 16:10 -05)

The author pushed fixes (15:58-16:10) while the rounds ran. A subagent marked
every draft item FIXED / PARTIAL / NOT FIXED against the new heads (#325
729a9c5f, #326 da8cb8c2, #327 821cb630, #328 af2b4350, #329 695268db, #330
615acb85, #331 5297536c) and reviewed the new commits as new code.

- FIXED, dropped from the drafts: 325-1 (store-link teardown; fresh-DB e2e
  26/26, CI green), 325-6 (follow-up issue #333 opened), 327-1 old (ICU), 329-1
  old (stale alias), 330-1 old (deep link consumed via replaceState; Next docs
  checked), 331-2 old (dialog button disabled).
- PARTIAL: 327-2 (ICU test added; still no component render test) kept as nit;
  325-3 old (store links fixed, BuyerAccounts still leak: 5 rows after a clean
  run) kept and sharpened.
- NOT FIXED, kept with updated line numbers: 324-1, 325-2/4/5, 326-1..4,
  329-2/3/4, 330-2/3/4, deliveryOptions gating.
- New findings from the delta: 327 `.catch(() => null)` swallows every error
  (should fix); 329 readiness gate disables submit without a reason (should
  fix); `intl-messageformat` devDependency out of alphabetical order (nit, not
  posted); no supply-chain concern (11.2.15 from 2026-09-12, already in the
  lockfile transitively, `--frozen-lockfile` passes).
- Checked, no finding: customers-page deep link (assertOwnership + storeId 404),
  alias prefill phone matching.
- Round E repeated: all inline anchors verified as added lines inside each PR's
  diff on the new heads; commit_id equals the live head for all eight PRs
  immediately before posting.
