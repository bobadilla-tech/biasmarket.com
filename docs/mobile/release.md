# Mobile beta and release operations

Use `mobile-release` as the protected branch for mobile release candidates.
The branch should require CI and review before updates are accepted. The
`Mobile Maestro` workflow builds the EAS `preview` APK and runs the seeded
staging buyer flow on an Android emulator. Configure the `mobile-staging`
environment and EAS preview API URL as described in
`apps/mobile/.maestro/README.md` before expecting that workflow to pass.

The EAS build profiles and manual production OTA workflow are in
`apps/mobile/eas.json` and `.github/workflows/mobile-production-update.yml`.
Store submission remains an explicit `eas submit --profile production` step.
Production EAS credentials, App Store Connect app access, Play Console app and
service account, privacy policy URL, localized screenshots, and store privacy
declarations must be supplied before store review. A beta cohort must complete
a real checkout before the mobile release is approved.
