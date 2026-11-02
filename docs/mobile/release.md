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
a second guard. The OTA workflow intentionally fails with a clear message until
`expo-updates` is added to `apps/mobile/package.json` and a compatible native
build has been released. Do not dispatch it to test that guard in production.

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

Configure secrets in the environments' settings, not as repository-wide
secrets. The staging environment should hold only staging credentials. Add
production credentials only when a release is planned. Check environment rules
in repository Settings → Environments and branch rules in Settings → Rules.
See GitHub's [deployment environments](https://docs.github.com/en/rest/deployments/environments)
and [branch protection](https://docs.github.com/en/rest/branches/branch-protection)
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

For the combined release history and mobile-release workflow, see
[`docs/core/mobile-release.md`](../core/mobile-release.md). The CI guarantees
and component-test coverage are described in [`docs/core/ci.md`](../core/ci.md).
