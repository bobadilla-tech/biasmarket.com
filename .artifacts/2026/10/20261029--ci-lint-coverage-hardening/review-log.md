# Review log

Reviewers are subagents; their reports are claims, verified against the repo
where marked.

## Round 1 (plan rev 1)

Lenses: correctness/repo-fit/bug-hunter (R1), security/ops (R2), testing +
simplicity (R3).

| #  | Finding                                                                                                                             | Lens   | Sev          | Evidence                                                                | Decision    | Plan change                                                                                          |
| -- | ----------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------ | ----------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| 1  | `hygiene` has no `*_CHANGED`; adding to arrays aborts `check-ci-success.sh`; wiring is 7 places, not 4; partial wiring wedges CI+CD | R1, R2 | blocking     | check-ci-success.sh:35-41, ci.yml:47-62,1157-1211 (verified by reading) | fix         | CI wiring section: 7 places, dedicated `HYGIENE_RESULT` branch, wiring same PR, synthetic-env matrix |
| 2  | `infra/vps/*.sh` shellcheck fixes = production deploy changes                                                                       | R2     | blocking     | deploy.md; plan §3                                                      | fix         | shellcheck limited to `scripts/ci/*.sh`; infra deferred                                              |
| 3  | dependabot `github-actions` + automerge can deploy an unreviewed `cd.yml` bump                                                      | R2     | blocking     | dependabot-automerge.yml:30-34                                          | fix (defer) | dependabot/CodeQL/security.yml removed from scope; Follow-ups records the gating requirement         |
| 4  | `apps/api/src/metadata.ts` (152 KB, generated) missing from lint ignores; would warn with `--max-warnings 0`                        | R1     | blocking     | tracked file, `.prettierignore`                                         | fix         | ignores mirror `.prettierignore`                                                                     |
| 5  | mobile `test:cov` cannot run: no turbo task, no build step (my own P2)                                                              | R1, R3 | blocking     | P2                                                                      | fix         | turbo `test:cov` `dependsOn ^build`; jobs use `pnpm turbo run test:cov --filter=`                    |
| 6  | "Tasks: 17 successful" wrong, actual 13                                                                                             | R3     | blocking     | counted package.json                                                    | fix         | AC1 expressed as count of package.json                                                               |
| 7  | turbo lint cache fix incomplete: `web#lint` overrides generic task                                                                  | R1     | important    | turbo.json                                                              | fix         | inputs on both tasks + check                                                                         |
| 8  | guard rule 2 false positives (names, `web` vs `web-e2e`, `test:e2e`, sanity name); rule 4 brittle; YAML cross-check needs parser    | R1, R3 | important    | ci.yml invocations                                                      | fix         | name from package.json, token match, strip comments, drop rule 4 and YAML check, document limitation |
| 9  | `exhaustive-deps: warn` + `--max-warnings 0` contradiction (11 web findings)                                                        | R1, R3 | important    | P6                                                                      | fix         | frontends omit `--max-warnings 0`                                                                    |
| 10 | sanity should keep studio config                                                                                                    | R1     | important    | apps/sanity/eslint.config.mjs                                           | fix         | keep config, add scripts only                                                                        |
| 11 | `fetch-depth: 0` needed in PR with lint scripts, not later                                                                          | R1     | important    | lint-changed-files.mjs                                                  | fix         | moved into PR 1                                                                                      |
| 12 | 11 near-identical per-workspace configs                                                                                             | R3     | important    | n/a                                                                     | fix         | single root `eslint.config.mjs`; verify cwd lookup by probe                                          |
| 13 | Cut CodeQL/security.yml/dependabot; merge docs PR; PR 6 separate                                                                    | R3     | important    | scope                                                                   | partly fix  | security items deferred; docs into PR 3; mobile smoke conditional/default off (Q3)                   |
| 14 | actionlint download needs committed sha256, no curl-pipe                                                                            | R2     | important    | n/a                                                                     | fix         | PR 4 spec                                                                                            |
| 15 | SHA-pin claim inconsistent with repo (all tag pins)                                                                                 | R2     | important    | ci.yml, `sha_pinning_required:false`                                    | fix         | pin new actions only; existing recorded in Follow-ups                                                |
| 16 | CD gate: flaky floor / hygiene blocks deploy; no CI hotfix path                                                                     | R2     | important    | cd.yml gate                                                             | fix         | Risks + docs/ci.md emergency path                                                                    |
| 17 | settings: admin bypass, default perms write, dependabot security updates enabled, CodeQL UI vs workflow conflict                    | R2     | important    | gh api                                                                  | document    | Follow-ups, §2, §8                                                                                   |
| 18 | negative checks: name `no-debugger`; use `node --test`; set floors from CI run                                                      | R3     | important    | n/a                                                                     | fix         | Steps, Coverage                                                                                      |
| 19 | mobile ignores lack `coverage/**`                                                                                                   | R1     | non-blocking | eslint.config.mjs                                                       | fix         | PR 2                                                                                                 |
| 20 | api coverage glob sloppy gives 30.8%                                                                                                | R3     | non-blocking | P9                                                                      | fix         | exclude rules noted                                                                                  |
| 21 | `migration-safety` outside `needs`; `packages/ui` absent in worktree; composite action not linted by actionlint                     | R1     | non-blocking | n/a                                                                     | note        | §2, §8                                                                                               |

## Round 2 (plan rev 2)

Lenses: R4 correctness/ops/security (probed ESLint cwd lookup, turbo
`$TURBO_ROOT$`, wiring list), R5 testing/bug-hunt (probed guard regex, turbo
`test:cov`, coverage scoping, task count).

Verified OK by probe: root `eslint.config.mjs` is picked up from package dirs
and ignores `metadata.ts`; web/mobile/sanity keep their own configs unmerged;
`$TURBO_ROOT$/...` valid on turbo 2.11.8; "Tasks: 13" holds (`turbo ls` = 13);
the 7-place wiring list is complete; guard rule 2 matches api, web, workers,
utils, validation and misses exactly mobile, design-tokens, types.

| #  | Finding                                                                                                                                           | Lens | Sev          | Evidence                        | Decision | Plan change                                                                     |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------ | ------------------------------- | -------- | ------------------------------------------------------------------------------- |
| 22 | Guard rules 2 and 3 in PR 1 would fail on main (mobile/design-tokens/types uncalled, `--passWithNoTests`), turning `hygiene` and `CI Success` red | R4   | blocking     | ci.yml job bodies; package.json | fix      | rule 1 in PR 1; rules 2, 3 in PR 3 with their wiring                            |
| 23 | `fetch-depth: 0` list omitted existing `workers` and `validation` Lint steps (shallow, would exit 1 once script exists)                           | R4   | blocking     | ci.yml 407-450, 817-863         | fix      | added to list                                                                   |
| 24 | PR 1 changes root devDeps so it must commit the lockfile                                                                                          | R4   | important    | `--frozen-lockfile`             | fix      | PR 1 and PR 3 commit lockfile                                                   |
| 25 | path filters ignore root `eslint.config.mjs` / `lint-changed-files.mjs`                                                                           | R4   | important    | ci.yml filters                  | fix      | added to every filter                                                           |
| 26 | `test:cov` turbo task without `outputs` loses `lcov.info` on cache hit                                                                            | R5   | important    | turbo semantics                 | fix      | `outputs: ["coverage/**"]` plus `test -f` step before upload                    |
| 27 | mobile, types, validation have no vitest config; plan listed some as "change"                                                                     | R5   | important    | file listing                    | fix      | §4 corrected                                                                    |
| 28 | types: generated code gives 4.6%; floor on 35 statements fragile. mobile whole-src ~10%. design-tokens unmeasured                                 | R5   | non-blocking | probe                           | fix      | per-workspace scoping bullets; lines floor for types; scoped include for mobile |
| 29 | rule 2 false positive on `pnpm --filter web exec playwright test`                                                                                 | R5   | non-blocking | regex probe                     | fix      | no `exec` token, `test(:cov)?(\s                                                |
| 30 | ACs 3, 4, 5, 6 not objectively checkable as worded                                                                                                | R5   | non-blocking | n/a                             | fix      | rewritten                                                                       |
| 31 | root-run `eslint .` would apply base to web/mobile/sanity; unused-disable warnings under `--max-warnings 0`                                       | R4   | non-blocking | probe                           | fix      | doc note + rerun baseline step                                                  |

## Round 3 (plan rev 3 -> rev 3b)

R6 (CI simulation, per PR) and R7 (implementer readiness). R7 reported no
blocking, 7 important, 4 non-blocking; findings below (R6 result appended
after).

| #  | Finding                                                                                                   | Lens | Sev          | Evidence                            | Decision | Plan change                                                        |
| -- | --------------------------------------------------------------------------------------------------------- | ---- | ------------ | ----------------------------------- | -------- | ------------------------------------------------------------------ |
| 32 | root ESLint config only as prose; probe files will be deleted                                             | R7   | important    | probes section                      | fix      | `eslint.config.reference.mjs` saved in this folder, linked from §3 |
| 33 | baselines pinned to stale base `61ba2f82`; origin/main now `deb62002`                                     | R7   | important    | `git rev-parse` (verified)          | fix      | header + AC4: re-measure at PR 1 and PR 3                          |
| 34 | `sanity` wiring not concrete; no `typecheck` script                                                       | R7   | important    | apps/sanity/package.json (verified) | fix      | exact keys, filter paths, scripts                                  |
| 35 | hidden decision: lint-config path filter on `web_e2e`/`api_e2e`                                           | R7   | important    | ci.yml 174, 192 (verified)          | fix      | decided: package filters only                                      |
| 36 | turbo `inputs` ambiguity, `$TURBO_DEFAULT$`                                                               | R7   | important    | turbo.json                          | fix      | literal JSON given                                                 |
| 37 | `hygiene` commands, fixtures path, regex escaping missing                                                 | R7   | important    | n/a                                 | fix      | commands and fixture dirs listed                                   |
| 38 | include globs wrong: types has no `src/`; mobile has no "storage dir"; types has no generated-event tests | R7   | important    | `git ls-tree` (verified)            | fix      | literal include per workspace                                      |
| 39 | root `.eslintrc.json`; 11 vs 14 web figure; shellcheck scope grew with `mobile-release-changes.sh`        | R7   | non-blocking | repo                                | fix      | notes added                                                        |

R6 (CI simulation, plan rev 3): no blocking; 4 important, 4 non-blocking. Probed
that actionlint 1.7.12 and shellcheck are clean on origin/main workflows and
`scripts/ci`, so PR 4's default is safe.

| #  | Finding                                                                                                                                                                | Lens | Sev          | Evidence                       | Decision | Plan change                                                                                                                       |
| -- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------ | ------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 40 | Prettier-dirty files in newly gated packages (i18n marketing.json x2, workers mailer.core.ts, mobile tsconfig.json, 5 sanity files) would redden the next unrelated PR | R6   | important    | `prettier --check` by reviewer | fix      | format in the gate-adding PR; sanity lint = plain `eslint .`                                                                      |
| 41 | pnpm rewrites lockfile single-quoted (29.6k lines vs ~160)                                                                                                             | R6   | important    | probe worktree                 | fix      | prettier the lockfile, small-diff requirement                                                                                     |
| 42 | PR 1 / PR 3 contradiction: §6 step 5 and fixtures had "uncalled test" in PR 1                                                                                          | R6   | important    | plan §3/§6/AC2                 | fix      | fixtures and AC2 split per PR                                                                                                     |
| 43 | Babel `jsx` plugin on `.ts` breaks `<T>x` assertions                                                                                                                   | R6   | important    | probe                          | fix      | per-extension parser plugins; reference config split (reference file rewritten, syntax-checked only, not re-run against the tree) |
| 44 | e2e filters should not get lint-config paths (dup of #35); Q3 default makes §1 outcome overstated; AC4 vs exclusions; stale rev line                                   | R6   | non-blocking | n/a                            | fix      | §1 "explicitly not covered", AC4 re-baselined, header                                                                             |

## Round 4 (plan rev 3b): final readiness review

Result: no blocking or important findings; verdict READY. Probes: reference
ESLint config runs on api (365 files, 10 errors = baseline), validation (1),
utils and all other packages (0); no parse failures; `metadata.ts` ignored from
root run. Simulated PRs 1-4 merging in order: `CI Success` stays green, CD not
wedged.

| #  | Finding                                                                           | Sev          | Decision | Plan change            |
| -- | --------------------------------------------------------------------------------- | ------------ | -------- | ---------------------- |
| 45 | unnamed consumer `scripts/ci/mobile-release-changes.sh` reads the `mobile` filter | non-blocking | fix      | §8 names it, docs note |
| 46 | Prettier gate result can be a stale turbo cache replay (existing for api)         | non-blocking | document | §8                     |
| 47 | record rules-of-hooks measurement (0) and warn fallback                           | non-blocking | fix      | §3                     |
| 48 | Prettier-dirty list spot-checked (3 of 9 files re-verified)                       | non-blocking | note     | none                   |

## Convergence caveat

The skill asks for two consecutive clean rounds. Rounds 1-3 each produced
blocking or important findings (they got progressively finer: wiring model ->
sequencing -> formatting and parser details); round 4 (the final readiness
review) was the first clean one. There was no second consecutive clean round.
Residual uncertainty is limited to things only a real CI run can show: cross-OS
coverage variance for the floors (mitigated by setting floors from the PR's CI
numbers), Prettier-dirty files not re-listed on the newest `origin/main`, and
the true web lint count with web's own config. All three are explicit steps for
the implementer.

## Post-review change (user feedback, after round 4)

| #  | Finding                                                                                                                                                                                     | Source | Decision | Plan change                                                                                                                                                                                                                                                         |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 49 | "Stacked PRs get no CI, so base everything on main" treats a trigger limitation (`pull_request: branches: [main]`, ci.yml line 11) as a constraint; stacked PRs should be linted/tested too | user   | fix      | new PR 0 `ci/run-on-all-prs`; stacking allowed after PR 0 merges; `BASE_REF` per PR base. Only `ci.yml:11` and `lint-changed-files.mjs`' default base assume main (grep verified; migration-safety already uses the PR base SHA). **Not re-reviewed by subagents.** |
