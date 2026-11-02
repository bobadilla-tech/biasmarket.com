# Mobile beta and release operations

This repository has separate workflows for staging QA, production builds, OTA
updates, and store submission. The protected `mobile-release` branch is for
release candidates. Configure GitHub environments before using these workflows;
missing environments are created without protection when a workflow first runs.

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

A repository admin must create and protect `mobile-staging` and
`mobile-production` before dispatching workflows. `mobile-production` should
require an approved reviewer and limit deployments to protected `main`.
`mobile-staging` should hold only staging credentials. Protect the
`mobile-release` branch with pull-request review and the required `CI Success`
check. Do not put production credentials in repository-wide secrets.

An admin can create the staging environment and configure production protection
through the GitHub REST API. Replace `OWNER/REPOSITORY` and the numeric
reviewer id with the repository's values. The examples do not set or expose any
secrets:

```bash
REPO=OWNER/REPOSITORY
gh api "repos/$REPO/environments/mobile-staging"
gh api --method PUT "repos/$REPO/environments/mobile-staging" \
  --input - <<'JSON'
{"deployment_branch_policy":{"protected_branches":true,"custom_branch_policies":false}}
JSON
REVIEWER_ID=12345678
gh api --method PUT "repos/$REPO/environments/mobile-production" \
  --input - <<JSON
{"wait_timer":0,"reviewers":[{"type":"User","id":$REVIEWER_ID}],"deployment_branch_policy":{"protected_branches":true,"custom_branch_policies":false}}
JSON
gh api "repos/$REPO/branches/mobile-release/protection"
```

Configure the `mobile-release` branch's required review and `CI Success` check
in repository settings, then verify it with the read-only `gh api` command
above. Configure secrets in the environments' settings. The implementation
session does not execute these admin commands or change branch protection.
See GitHub's REST API documentation for [deployment environments](https://docs.github.com/en/rest/deployments/environments) and [branch protection](https://docs.github.com/en/rest/branches/branch-protection).

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
