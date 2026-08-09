# Restore linting across the monorepo

**Status:** Pre-implementation plan (written ahead of the work, per audit
follow-up request).

**Source:** `docs/audits/audit-2026-08-08.md` §11 (linting row), §12 (important
finding #6).

## Context

`pnpm lint` is documented in `CLAUDE.md` as a working root command
(`pnpm lint # turbo run lint`), but ESLint has no config and no dependency
anywhere in the monorepo — confirmed during the audit by an actual `pnpm lint`
run returning 0 tasks. There is currently no linting safety net before merge;
only `tsc --noEmit` (typecheck) and tests catch issues. This was already
investigated once — `docs/plans/2026-08-02-web-app-audit-fixes-plan.md` found
the likely blocker: `apps/web` pins `typescript@7.0.2` (the native/`tsgo`
preview compiler), which lacks the classic TypeScript compiler API that
`typescript-eslint` needs. Read that plan's findings before starting — don't
re-derive them from scratch.

## Scope

**What the two referenced docs actually established (read before starting — this
corrects/sharpens both this plan's and the audit's paraphrase):**

- **The "blocker" has never actually been run.**
  `2026-08-02-web-app-audit-fixes-plan.md` Part A confirms one real fact
  directly (`node -e
  "console.log(Object.keys(require('typescript')))"` inside
  `apps/web` prints only `{ version, versionMajorMinor }` — no
  `createSourceFile`, `createProgram`, etc.) and then _reasons_ that
  `typescript-eslint` likely needs that API — but its own next line is "**Before
  writing any config, spike it**," i.e. that plan explicitly did not install
  `eslint`/ `typescript-eslint` and try. `2026-08-03-lint-formatting-spike.md`
  also never ran that spike: it did static `package.json`/config inspection
  only, and its one attempt to run `pnpm lint` failed before reaching Turbo at
  all (a local pnpm-launcher registry-signature verification error, unrelated to
  lint or TypeScript 7). **Net effect: no one has ever actually pointed
  `typescript-eslint` at this repo's `typescript@7.0.2` and observed what
  happens.** Treat the TS7 incompatibility as a plausible, well-reasoned
  hypothesis, not a confirmed result — step 1 below is a first-time spike, not a
  re-check of stale info.
- **No specific `typescript-eslint` version was evaluated as working or
  broken**, and no alternative tool (`oxlint` etc.) was actually spiked either —
  both remain untested options, not "tool X already ruled out."
- **The TS7 pin is not monorepo-wide** — confirmed just now against every
  package.json: `apps/web`, `packages/ui`, `packages/db`, `packages/i18n`, and
  `packages/utils` pin `typescript@^7.0.2`, but **`apps/api` and
  `packages/types` both already pin classic `typescript@^5.9.3`** (not just
  `apps/api`, as the 2026-08-02 plan's follow-up note and this plan's scope item
  2(c) imply). `apps/api` and `packages/types` are the two packages with _zero_
  open question about `typescript-eslint` compatibility — they're on the same
  compiler line every mainstream TS-ESLint setup targets today.
- **No `eslint` or `typescript-eslint` dependency exists anywhere in the repo**,
  confirmed directly against every `package.json` and `pnpm-lock.yaml`
  (2026-08-08). The lockfile's only `eslint`-adjacent hits are
  `@types/eslint-scope`/`eslint-scope` pulled in transitively by an unrelated
  tool (webpack-family), not a real install — matches what the 2026-08-03 spike
  already noted, now double-checked at execution time.

1. **Run the spike neither prior doc ran.** `pnpm add -D eslint` +
   **`typescript-eslint`** (the flat-config `typescript-eslint` package, not
   `eslint-config-next`) in one already-classic-TS package first —
   **`packages/types` or `apps/api`** — to get a real, unblocked lint baseline
   running with zero open compatibility questions before touching the TS7-pinned
   packages at all. Reserve **`eslint-config-next`** for **`apps/web`** only —
   it's the Next-specific config (and drags in `eslint-plugin-next` +
   `eslint-config-next`'s React/Next rules), so it doesn't belong in the
   non-Next packages this step targets. Only after that, spike a minimal
   `eslint.config.mjs` against `apps/web` (or another TS7 package) and observe
   the actual failure (if any) — don't assume the documented reasoning holds
   until it's been tried once.
2. **If `apps/web`/TS7 packages are still blocked after that spike:** evaluate
   alternatives rather than waiting indefinitely — options include (a) pinning
   TypeScript to a classic-compiler version just for the lint task if that's
   workable alongside the `tsgo` build pipeline, (b) a lint tool that doesn't
   depend on the classic compiler API (e.g. `oxlint`, or ESLint's type-aware
   rules disabled in favor of non-type-aware rules only), or (c) shipping
   `apps/api` + `packages/types` lint coverage now and revisiting the five
   TS7-pinned packages (`apps/web`, `packages/ui`, `packages/db`,
   `packages/i18n`, `packages/utils`) as an explicit follow-up. Pick whichever
   unblocks real coverage soonest; a partial rollout that actually runs beats a
   perfect one that's still blocked.
3. **Wire it into `turbo.json`** as a real `lint` task per package (matching how
   `typecheck`/`test`/`build` are already wired), and into
   `.github/workflows/ci.yml`'s existing per-package job structure — reuse the
   `detect-changes` path-filtering pattern already there rather than adding a
   separate always-runs lint job.
4. **Baseline pass:** running lint for the first time on an existing codebase
   this size will surface a large number of pre-existing findings. Don't try to
   fix them all in this same change — get the tool running and passing with
   either (a) sensible starter rule severity (warnings not errors for the
   noisier categories) or (b) a one-time baseline ignore/suppression pass,
   whichever is more consistent with how the repo already handles this kind of
   rollout (check `docs/plans/2026-08-03-lint-formatting-spike.md` for any prior
   attempt or decision on this before picking an approach).

## Files likely touched

- Root `package.json`, `turbo.json`
- New `eslint.config.*` (flat config, matching current ESLint convention) at
  root and/or per-package
- `.github/workflows/ci.yml` (new/updated lint step per job)
- Per-package `package.json` `lint` scripts

This plan touches shared tooling config, not application code — low collision
risk with the other concurrent plans' file-level changes, but note that turning
lint on _after_ other plans land code changes may surface lint findings in their
new code. Sequencing note for whoever reviews the overall batch: this plan is
reasonable to land last, or its baseline-suppression step should be generous
enough to not fail CI on code written by the other concurrent plans.

## Verification

- `pnpm lint` actually runs and reports real findings (or a clean pass) for at
  least `apps/api`, not "0 tasks."
- CI's lint step(s) show up as real jobs in a PR, not skipped.
- `pnpm typecheck` and `pnpm build` still pass unaffected — this plan should not
  need to touch build/typecheck config beyond whatever the TypeScript-version
  investigation requires.

## Severity Classification

**MEDIUM.**

- **Against HIGH:** nothing is on fire. `tsc --noEmit` (real, wired into CI) and
  the test suite are still the actual safety net, and per both referenced docs
  the repo has shipped through the entire TypeScript 7 migration, the
  Orval/OpenAPI client rollout, and multiple audit-fix batches with lint
  completely absent — no incident or regression in this history is attributed to
  the missing lint gate. What lint mainly adds on top of `tsc`+tests is
  hygiene/style/hooks-dependency catches (`react-hooks/exhaustive-deps`, unused
  imports, `<img>` vs `next/image`) — real but lower-severity than the type and
  logic errors `tsc`/tests already catch. That caps this below HIGH.
- **Against LOW:** two things keep it off LOW. First, `CLAUDE.md` documents
  `pnpm lint` as a working command and it currently silently no-ops ("0 tasks")
  — that's active documentation drift a reader can trip on, not just a missing
  nice-to-have. Second, and more decisive: the "blocker" that has justified
  deferring this is, per the research above, **unverified** — no one has
  actually run `typescript-eslint` against this repo's `typescript@7.0.2`, and
  two of the seven packages (`apps/api`, `packages/types`) have no blocker at
  all since they're already on classic TypeScript. That means real, unblocked
  partial coverage is available at low, known cost (a single `pnpm add -D` plus
  a flat config in an already-compatible package) rather than being gated on an
  open-ended ecosystem wait — which is a materially cheaper/lower-risk
  proposition than "wait for the ecosystem to catch up" (the 2026-08-03 spike's
  stated posture) suggests.
- **Net:** worth doing soon — the unblocked half is cheap and removes a real
  documentation-accuracy gap — but not urgent enough to preempt other in-flight
  work or to block a release on. Sequencing this plan last among concurrent
  plans (as the "Files likely touched" section already recommends) remains the
  right call under a MEDIUM rating.

## Definition of done

`pnpm lint` (root) actually lints real code and either passes or reports real,
addressable findings — not "0 tasks run." CI enforces it for at least the
packages where it's unblocked. `CLAUDE.md`'s description of the command matches
reality again.
