# Mobile beta and release operations

This repository has separate workflows for staging QA, production builds, OTA
updates, and store submission. The GitHub environments `mobile-staging` and
`mobile-production` have been created. The planned `mobile-release` branch is
for release candidates and must be protected before staging QA is run.

## Workflows

| Workflow                                                        | Trigger                            | Environment         | Inputs / purpose                                                                            |
| --------------------------------------------------------------- | ---------------------------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| `Mobile Maestro` (`mobile-maestro.yml`)                         | Push to `mobile-release` or manual | `mobile-staging`    | Builds a preview APK and runs the seeded Android buyer flow.                                |
| `Mobile production build` (`mobile-production-build.yml`)       | Manual on `main`                   | `mobile-production` | Builds iOS and Android production binaries and prints only their EAS build IDs.             |
| `Mobile production OTA update` (`mobile-production-update.yml`) | Manual on `main`                   | `mobile-production` | Requires a release message; publishes JavaScript changes after `expo-updates` is installed. |
| `Mobile store submission` (`mobile-store-submit.yml`)           | Manual on `main`                   | `mobile-production` | Requires a platform (`ios`, `android`, or `all`) and the matching EAS build ID or IDs.      |
| `Mobile release` (`mobile-release.yml`)                         | Published release or manual        | Repository secrets  | Builds release artifacts and attaches them to the GitHub release.                           |

Production jobs also check that they run from `main`. The environment deployment
branch policy and required reviewers are the release controls; the job check is
a second guard. The OTA workflow checks that `expo-updates` is declared in
`apps/mobile/package.json`. It cannot verify that a compatible native build has
been distributed, so the release owner must confirm that prerequisite before
dispatching an OTA update. Do not dispatch it to test the package guard in
production.

## One-time repository administration

The environments already exist. `mobile-staging` currently allows `main` and
`mobile-release`; `mobile-production` requires an approved reviewer and allows
protected branches only. Neither `main` nor `mobile-release` is protected yet,
so production deployments are blocked until a repository admin protects the
intended release branch. Create and protect `mobile-release` with pull-request
review and the required `CI Success` check before running staging QA. Protect
`main` before running the production workflows, which are pinned to that branch.
These settings are release prerequisites; merging the workflow changes does not
publish a build.

Configure secrets in the environments' settings, not as repository-wide secrets.
The staging environment should hold only staging credentials. Add production
credentials only when a release is planned. Check environment rules in
repository Settings → Environments and branch rules in Settings → Rules. See
GitHub's
[deployment environments](https://docs.github.com/en/rest/deployments/environments)
and
[branch protection](https://docs.github.com/en/rest/branches/branch-protection)
documentation.

Configure these `mobile-staging` environment secrets for Maestro:

- `EXPO_TOKEN`, `EAS_PROJECT_ID`
- `MAESTRO_STORE_SLUG`, `MAESTRO_PRODUCT_ID`, `MAESTRO_PRODUCT_NAME`
- `MAESTRO_BUYER_PHONE`, `MAESTRO_BUYER_PASSWORD`, `MAESTRO_PICKUP_LABEL`
- `MAESTRO_PAYMENT_METHOD`

Configure `EXPO_TOKEN` and `EAS_PROJECT_ID` as `mobile-production` environment
secrets. Add store submission credentials to that environment only when a
submission is planned. The workflow validates build IDs as UUIDs.

The staging store needs the published product, an enabled pickup point with no
required pickup date, and an enabled manual payment method. Set the EAS
`preview` environment's `EXPO_PUBLIC_API_URL` to the staging API. See the
[Maestro setup](../../apps/mobile/.maestro/README.md) for fixture details.

## Release order and verification

Deploy the Caddy log-redaction change (PR #594) before cutting any mobile build
that contains session refresh from PR #587. Deploy the checkout API changes in
PR #591 before building an app that contains the retry behavior from PR #600.
The owner must confirm that no affected mobile build reached users before those
builds are cut. Merging those changes does not itself publish a build.

The production EAS credentials, App Store Connect access, Play Console app and
service account, privacy policy URL, localized screenshots, and store privacy
declarations must be ready before store review. A beta cohort should complete a
real checkout before a production release is approved.

The CI guarantees and component-test coverage are described in [the CI guide](../core/ci.md).

## GitHub Release artifact workflow

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
next release instead of being lost. If no earlier release has mobile assets, the
build runs. Android and iOS are built together or not at all, and a release with
unrelated changes only skips both (the macOS runner never starts).

Manual run (also the way to rebuild): Actions → "Mobile Release" → Run workflow
with an existing tag. Tick `force` to build even when nothing mobile changed.

## Android APK

Download `mobile-android-<tag>-debug.apk` from the release, copy it to the
phone, and open it (allow "install unknown apps" for your browser/files app), or
`adb install mobile-android-<tag>-debug.apk`.

It is an optimized (`assembleRelease`) build, JS bundled in, but signed with the
Expo template's **debug keystore** because no production key exists. It covers
`arm64-v8a` (phones) and `x86_64` (emulators). Because the key is public, a
future production-signed build cannot update over it; uninstall first.

## iOS archive

`mobile-ios-<tag>-unsigned.xcarchive.zip` is the `.xcarchive` produced by
`xcodebuild archive` with `CODE_SIGNING_ALLOWED=NO`. It holds the compiled
`BiasMarket.app` for `iphoneos`, dSYMs and archive metadata. Its purpose is to
prove the iOS app compiles and to be signed later.

An iPhone only runs apps signed with a certificate and provisioning profile from
an Apple Developer account. This archive has neither, so it cannot be installed
on a normal device (nor via TestFlight). It is not a simulator build either.

## Rerunning

Re-run failed jobs from the workflow run page, or dispatch the workflow with the
tag. Uploads use `gh release upload --clobber`, which only replaces assets of
the same name; release notes and other assets are never touched, and no release
is created. The baseline for change detection never moves on a rerun.

## Adding production signing later (not implemented)

- Android: create an upload keystore, store it and its passwords as repository
  secrets, add a `release` signing config in the prebuild step (e.g. via an Expo
  config plugin), and switch to `assembleRelease` + `bundleRelease` for Play.
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

## Related

- [CI guide](../core/ci.md) for the `mobile` path filter this workflow reuses and the CI
  jobs that gate PRs.
- [deployment guide](../core/deploy.md) for how the server-side apps ship (mobile builds are
  independent of the production deploy).

