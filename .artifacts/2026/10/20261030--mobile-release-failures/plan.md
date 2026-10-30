# Fix the mobile release bundle failure

**Status: ready**\
**Work unit:** Mobile Release failures\
**Repository:** `bobadilla-tech/biasmarket.com`\
**Base:** `main` (latest observed `origin/main`:
`38d3fb583acac7e71c9135218c457a63833e025e`)\
**Outcome:** Both Android and iOS release builds bundle the Expo app and produce
their documented release assets, and a subsequent published release completes
successfully.

## Context and current behavior

The Mobile Release workflow publishes Android and iOS outputs to the matching
GitHub Release. Android is a debug-signed APK suitable for sideloading; iOS is
an unsigned archive and is not installable. No signing or paid build service is
part of this fix.

The failures are deterministic during JavaScript bundling, before artifact
creation:

- Run
  [v0.28.0](https://github.com/bobadilla-tech/biasmarket.com/actions/runs/40920445273):
  both `Android APK (debug-signed)` and `iOS archive (unsigned)` fail. Their
  bundlers log `Cannot find module 'babel-preset-expo'`; Android Gradle fails at
  `:app:createBundleReleaseJsAndAssets`.
- Run
  [v0.29.0](https://github.com/bobadilla-tech/biasmarket.com/actions/runs/41131518108):
  both platform jobs fail with the same missing preset at the Metro bundle step;
  `Attach to Release` is skipped because neither platform uploaded an artifact.
- The v0.27.0 run was cancelled; the run metadata does not establish why, so it
  is not evidence of this bundle error.
- At research time,
  [v0.30.0](https://github.com/bobadilla-tech/biasmarket.com/actions/runs/41141026047)
  was still running. Its eventual conclusion is not yet known and must be
  checked before implementation/release validation.
- The failure occurs after `pnpm install --frozen-lockfile` and Expo prebuild
  succeed. That rules out the workflow's initial dependency installation and
  native-project generation as the observed failure point.

Code evidence:

- `apps/mobile/babel.config.cjs:4-8` configures `babel-preset-expo` and
  `nativewind/babel`.
- `apps/mobile/package.json:38-47` lists mobile development dependencies but
  does not directly declare `babel-preset-expo`.
- The lockfile contains `babel-preset-expo@57.0.16` as a transitive Expo
  dependency, and `pnpm --filter mobile why babel-preset-expo` shows it below
  `expo`/other Expo peers rather than as a direct mobile dependency. The CI logs
  show Metro cannot resolve it from the app's bundle configuration. With pnpm's
  isolated dependency layout, a transitive package is not a reliable app-level
  Babel preset import.
- `.github/workflows/mobile-release.yml:105-106,120-130,178-214` installs
  dependencies, generates native projects, then runs Android Gradle bundle and
  iOS `xcodebuild archive`. Neither job currently performs an explicit Metro
  export before invoking its platform compiler.
- `scripts/ci/mobile-release-changes.sh` and the workflow already include a
  forced manual build path; `docs/core/mobile-release.md:58-63` documents reruns
  and `--clobber` upload behavior.

## Proposed fix

Declare `babel-preset-expo` directly in `apps/mobile`'s `devDependencies`,
aligned to the Expo SDK 57-compatible version already resolved in
`pnpm-lock.yaml` (currently `57.0.16`). Update the importer entry in
`pnpm-lock.yaml` through pnpm; do not hand-edit the lockfile. Keep the app's
existing Babel config and NativeWind preset order unless validation proves a
separate issue.

The primary fix is the missing direct dependency. Do not initially restructure
the workflow, switch build services, add signing credentials, change the release
asset contract, add a public-hoist workaround, or change the Expo/React Native
SDK. Treat any new failure after Metro resolution as a separate evidence-backed
issue rather than broadening this patch speculatively.

## Files and components

| Path                                   | Change                                                                                         | Purpose                                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/mobile/package.json`             | Add the SDK-compatible `babel-preset-expo` dev dependency.                                     | Make the configured preset resolvable as an app-owned dependency under pnpm's isolated layout. |
| `pnpm-lock.yaml`                       | Regenerate via pnpm.                                                                           | Record the direct app dependency and preserve reproducible frozen installs.                    |
| `.github/workflows/mobile-release.yml` | No planned change.                                                                             | Existing jobs already reach Metro and fail at the same missing package on both platforms.      |
| `docs/core/mobile-release.md`          | No planned change unless implementation discovers the documented rerun behavior is inaccurate. | The fix does not alter release usage, signing or output semantics.                             |

## PR stack

One focused PR, `fix/mobile-release-babel-preset`, based on current `main`. Keep
the package manifest and generated lockfile change together. No dependency stack
or tooling PR is needed. Do not merge as part of implementation.

## Implementation sequence and completion signals

1. Recheck current `main`, open PRs touching `apps/mobile/package.json`,
   `pnpm-lock.yaml`, or the release workflow, and inspect the final v0.30.0
   result. Completion: implementation starts from the current base and records
   whether v0.30.0 reproduced the error.
2. Add the Expo Babel preset directly to the mobile workspace at the version
   compatible with Expo SDK 57; update the lockfile with pnpm. Completion:
   mobile importer declares the preset, frozen install succeeds, and the
   app-context resolver finds it.
3. Run app checks and explicit Android/iOS Expo bundle exports. Completion:
   Metro bundles successfully for both platforms and the mobile lint, typecheck
   and unit-test commands pass.
4. Complete pre-merge checks and open the focused PR; do not merge or publish as
   part of this implementation handoff. Completion: dependency resolution, both
   platform exports, mobile checks and PR CI pass.
5. After the fix is merged, have the release owner publish a new tag whose SHA
   contains the fix, then exercise the full release workflow. Completion:
   Android APK signature verification passes, unsigned iOS archive exists, both
   artifacts attach to that same release, and the workflow concludes
   successfully.
6. Inspect the attached assets and confirm the release's source SHA contains the
   dependency fix. Completion: objectively verified artifact names, job results
   and tag SHA are recorded in the implementation log.

## Verification strategy

Commands to run during implementation (planned, not run in this planning
session):

- `pnpm install --frozen-lockfile`
- `pnpm --filter mobile exec node -e 'console.log(require.resolve("babel-preset-expo"))'`
- `pnpm --filter mobile lint`
- `pnpm --filter mobile typecheck`
- `pnpm --filter mobile test`
- From `apps/mobile`, run Expo production exports for both `--platform android`
  and `--platform ios` using the repo's installed Expo CLI. Confirm each
  completes a Metro bundle. Keep generated exports out of the PR.
- Before merge, run the mobile PR CI jobs and both production Metro exports. Do
  not claim full native release verification from PR jobs unless an available
  tagged candidate that contains the fix is actually built.
- After merge and publication of a new tag containing the fix, run the existing
  Android `expo prebuild` +
  `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64 --no-daemon`,
  APK `apksigner` verification, and iOS `expo prebuild`, `pod install`, and
  unsigned `xcodebuild archive` paths from
  `.github/workflows/mobile-release.yml`.
- Confirm `gh run view <run-id>` reports successful Android, iOS, and
  `Attach to Release` jobs and inspect the release assets. Record the exact tag
  SHA and verify it contains the fix.

Cases covered:

- Success: each platform's production bundle resolves the preset, the native
  build succeeds and the expected asset is uploaded.
- Failure regression: a clean frozen pnpm install still resolves the
  app-declared Babel preset without relying on workspace hoisting or a warm CI
  cache.
- Release integration: both platform assets attach to the target release and
  upload remains idempotent under the existing `--clobber` behavior.
- Scope boundaries: run the workflow from a new tag containing the fix.
  Published v0.28.0/v0.29.0/v0.30.0 tags are immutable release inputs; do not
  force-move an existing tag to inject the source fix. If a release build is
  needed immediately, publish a new patch/recovery tag under the repository's
  release policy.

## Risks and rollback

- Pinning a preset version inconsistent with Expo SDK 57 could introduce a
  different Metro incompatibility. Use the version already resolved in the
  lockfile and verify Expo SDK compatibility before committing.
- A successful Metro bundle may expose a later native compilation problem that
  the current failures obscure. Keep the proposed patch limited to the direct
  dependency until such a second failure is observed.
- A source fix merged to `main` does not alter already-published tags because
  build jobs check out the selected tag. Full hosted release validation
  therefore requires a new tag published after merge. The implementation PR
  itself cannot satisfy that post-merge acceptance criterion; never rewrite
  existing tags to make the workflow appear green.
- Rollback is to revert the direct dependency and lockfile change together. This
  restores the prior broken dependency graph, so only use rollback if the new
  dependency causes a separately demonstrated regression.

## Acceptance criteria

- `apps/mobile` directly declares an Expo SDK 57-compatible `babel-preset-expo`
  dependency and the lockfile is consistent.
- A clean frozen install resolves the preset from the mobile app context.
- Android and iOS production Metro exports both pass.
- Mobile lint, typecheck and tests pass.
- Pre-merge CI and Android/iOS production Metro exports pass.
- After merge, a new release tag containing the fix produces and attaches the
  expected APK and unsigned iOS archive; all required release jobs conclude
  successfully. This is a post-merge release-owner verification step, not an
  implementation-PR gate.
- No existing tag is moved, and asset naming/signing semantics remain as
  documented.

## Open questions

None. Recommended default: one dependency-only PR, then validate on the next new
release tag. Confirm the live v0.30.0 outcome before implementation because that
run was still active during research.

## Research probes

- Read-only GitHub Actions run/job metadata for v0.28.0 and v0.29.0, plus their
  failed logs. Both platforms independently reached the JS bundle step and
  emitted the same missing-module error. This isolated the common failure to
  Metro dependency resolution.
- `pnpm --filter mobile why babel-preset-expo` showed the locked `57.0.16`
  preset only as a transitive dependency through Expo packages; it is absent
  from the mobile workspace manifest.
- Read-only inspection of the Babel config, workflow steps, lockfile, and
  release runbook corroborated the intended minimal repair and the requirement
  to validate a new tag.
- No production code, tests, schema, or generated files were changed during
  planning. The only repository changes are these untracked plan artifacts.
