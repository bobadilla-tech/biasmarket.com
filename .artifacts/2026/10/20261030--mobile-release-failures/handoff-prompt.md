# Implementation handoff: fix the Mobile Release bundle failure

## Mission

Make the Expo app's production Metro bundle resolve `babel-preset-expo` on both
Android and iOS release builds. Implement the reviewed plan in
`.artifacts/2026/10/20261030--mobile-release-failures/plan.md`, open one focused
PR, and do not merge or publish a release.

## Context

- Repository: `bobadilla-tech/biasmarket.com`
- Base branch: current `main`; re-fetch and verify before branching.
- The v0.28.0 and v0.29.0 Mobile Release jobs both fail on Android and iOS with
  `Cannot find module 'babel-preset-expo'` during Metro bundling. Android Gradle
  reports failure at `:app:createBundleReleaseJsAndAssets`.
- `apps/mobile/babel.config.cjs` uses this preset, but
  `apps/mobile/package.json` does not list it directly. The locked `57.0.16`
  package is currently only transitive below Expo dependencies.
- At planning time v0.30.0 run 41141026047 was still in progress. Recheck its
  outcome first. A source fix after the tag was made cannot change the source
  checked out by that run.
- Native build jobs explicitly checkout the chosen tag, so a PR run or manual
  dispatch against an old tag cannot verify source changes from the PR.

## Decisions already made

- Add `babel-preset-expo` directly to the mobile workspace at an Expo SDK
  57-compatible version; align to the current locked `57.0.16` unless current
  Expo compatibility evidence calls for a different patch-level version.
- Update `pnpm-lock.yaml` with pnpm, not manual edits.
- Keep the PR limited to the manifest and lockfile unless tests reveal a
  separate reproducible issue.
- Preserve release workflow and artifact behavior, debug signing, unsigned iOS
  output, and existing tags.

## Reviewed plan and branch

- One PR: branch `fix/mobile-release-babel-preset` from up-to-date `main`.
- Change `apps/mobile/package.json` and `pnpm-lock.yaml` together.
- Read `.artifacts/2026/10/20261030--mobile-release-failures/plan.md` and
  `review-log.md` before editing.
- Do not merge or publish a release.

## Review findings to preserve

- v0.27.0 was cancelled, but available run metadata does not establish the
  cause.
- Full hosted release verification is post-merge and requires a newly published
  tag whose SHA includes this change. Do not move or rewrite published tags.
- The failing logs show the exact same missing preset on Android and iOS; native
  project generation and dependency installation succeeded.

## Verification

Planned commands (not run during planning):

1. `pnpm install --frozen-lockfile`
2. `pnpm --filter mobile exec node -e 'console.log(require.resolve("babel-preset-expo"))'`
3. `pnpm --filter mobile lint`
4. `pnpm --filter mobile typecheck`
5. `pnpm --filter mobile test`
6. From the mobile workspace, run `expo export --platform android` and
   `expo export --platform ios`; confirm Metro bundles, keep generated output
   out of the PR.
7. Confirm applicable hosted mobile PR CI is green.

After merge, the release owner must publish a new tag containing the fix and run
Mobile Release on that tag. Verify Android prebuild, `assembleRelease`, APK
signature, iOS prebuild/pods/archive, both release asset names, successful
`Attach to Release`, and the exact tag SHA. This is a separate post-merge check
and is not an implementation-PR gate.

## Acceptance criteria

- The mobile workspace directly declares the SDK-compatible preset, and frozen
  install succeeds.
- Resolution succeeds from the app context; both platform production exports
  bundle successfully.
- Mobile lint, typecheck, tests, and applicable hosted PR checks pass.
- The focused PR contains only the dependency declaration and generated lockfile
  change unless further evidence justifies scope expansion.
- No tag is moved or release published by the implementation session.

## Constraints and blockers

- Preserve unrelated work; inspect `git status` before making edits and do not
  stash/reset/stage unrelated changes.
- Never move existing release tags.
- If direct dependency declaration plus lockfile does not make the preset
  resolvable in a clean frozen install, stop and report the exact evidence
  before broadening scope.
- If a second native failure appears after the bundle issue is fixed, record it
  separately and do not silently expand this PR.

## Stack base policy

There is one PR based on `main`; no branches are pushed to or retargeted.

## PR instructions

Open one PR using the repository's current PR template. Do not merge it. Use the
user's existing Git identity. Do not add AI attribution to the branch, commit,
or PR text.

## First action

Read the reviewed plan and review log, check the v0.30.0 run, confirm repo
identity and current clean tree, fetch `origin/main`, inspect current Expo
preset compatibility, then make the smallest dependency and lockfile change.
