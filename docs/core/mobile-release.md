# Mobile release builds

Publishing a GitHub Release builds the Expo app (`apps/mobile`) for Android and
iOS and attaches the outputs to that release. Free GitHub-hosted runners only;
no signing secrets. Workflow: `.github/workflows/mobile-release.yml`.

| Platform | Release asset                             | Installable?            |
| -------- | ----------------------------------------- | ----------------------- |
| Android  | `mobile-android-<tag>-debug.apk`          | Yes (sideload)          |
| iOS      | `mobile-ios-<tag>-unsigned.xcarchive.zip` | No, build artifact only |

## Publishing a release

Publish a release **as a user** (GitHub UI or `gh release create vX.Y.Z`). A
release created by another workflow with `GITHUB_TOKEN` does not trigger
workflows, so it will not start this one; use the manual run below instead.

## When mobile builds run

The `detect-changes` job (`scripts/ci/mobile-release-changes.sh`) reuses the
`mobile` path filter from `ci.yml` (app, shared packages it depends on,
lockfile, root config, shared ESLint config and `lint-changed-files.mjs`), so PR
CI and releases share one list. A lint-config-only change therefore also counts
as a mobile change for release builds.

Unlike PR CI, a release is compared against the **newest earlier release that
has both mobile assets**, not the previous release. A release that skipped or
failed its mobile build leaves no assets, so its changes are picked up by the
next release instead of being lost. If no earlier release has mobile assets,
the build runs. Android and iOS are built together or not at all, and a release
with unrelated changes only skips both (the macOS runner never starts).

Manual run (also the way to rebuild): Actions → "Mobile Release" → Run workflow
with an existing tag. Tick `force` to build even when nothing mobile changed.

## Android APK

Download `mobile-android-<tag>-debug.apk` from the release, copy it to the
phone, and open it (allow "install unknown apps" for your browser/files app),
or `adb install mobile-android-<tag>-debug.apk`.

It is an optimized (`assembleRelease`) build, JS bundled in, but signed with the
Expo template's **debug keystore** because no production key exists. It covers
`arm64-v8a` (phones) and `x86_64` (emulators). Because the key is public, a
future production-signed build cannot update over it; uninstall first.

## iOS archive

`mobile-ios-<tag>-unsigned.xcarchive.zip` is the `.xcarchive` produced by
`xcodebuild archive` with `CODE_SIGNING_ALLOWED=NO`. It holds the compiled
`BiasMarket.app` for `iphoneos`, dSYMs and archive metadata. Its purpose is to
prove the iOS app compiles and to be signed later.

An iPhone only runs apps signed with a certificate and provisioning profile
from an Apple Developer account. This archive has neither, so it cannot be
installed on a normal device (nor via TestFlight). It is not a simulator build
either.

## Rerunning

Re-run failed jobs from the workflow run page, or dispatch the workflow with the
tag. Uploads use `gh release upload --clobber`, which only replaces assets of
the same name; release notes and other assets are never touched, and no release
is created. The baseline for change detection never moves on a rerun.

## Adding production signing later (not implemented)

- Android: create an upload keystore, store it and its passwords as repository
  secrets, add a `release` signing config in the prebuild step (e.g. via an
  Expo config plugin), and switch to `assembleRelease` + `bundleRelease` for
  Play.
- iOS: join the Apple Developer Program, add a distribution certificate and
  provisioning profile as secrets, import them into a temporary keychain, and
  drop `CODE_SIGNING_ALLOWED=NO` for `xcodebuild -exportArchive` to make an
  `.ipa`. Set explicit `ios.bundleIdentifier` / `android.package` in `app.json`
  first (see below).

## Known limitations

- `app.json` has no `ios.bundleIdentifier` / `android.package`; `expo prebuild`
  generates the placeholder `com.anonymous.biasmarketmobile` in CI. Set real IDs
  before sharing builds beyond testing.
- The native `ios/` and `android/` projects are generated on every build
  (`expo prebuild`); they are gitignored and never committed.
- Release runs execute on the tag ref, so GitHub cache entries they write are
  only reusable by reruns of that tag; caches written by `main` are readable.
