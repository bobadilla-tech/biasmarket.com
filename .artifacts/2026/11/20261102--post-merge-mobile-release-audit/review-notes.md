# Post-merge review and mobile release validation

## Scope

The 12 PRs in the handoff list were already merged at the start of this
follow-up. The additional findings below were verified against the merged main
commit and recorded on their original merged PRs before being implemented in
focused follow-up PRs.

## Findings and follow-ups

- Checkout multipart proof was accepted by the API but absent from OpenAPI and
  the generated client. Comment:
  https://github.com/bobadilla-tech/biasmarket.com/pull/603#issuecomment-6586556836.
  Fixed in PR #621 by documenting optional binary `file`, preserving the
  generated `CreateOrderDto` name, and regenerating OpenAPI/client output. A
  fresh review found an inaccurate image-only description; the finding was
  commented on #621 and corrected to list JPEG, PNG, and PDF. Fresh re-review
  was clean. Merged at `3ff6fa977c3f9c05ed309ebc6dbf99bd27fc68c2`.
- Mobile release change detection omitted the release workflow and its detector
  script from the mobile path filter. Comment:
  https://github.com/bobadilla-tech/biasmarket.com/pull/608#issuecomment-6586559232.
  Fixed in PR #622 by adding both paths to the mobile filter. Fresh independent
  review was clean. Merged at `dd5acf8d25501d6dc78ac89d162a301520a8f1bc`.

## Verification

- PR #621 local API build and metadata generation passed; generated OpenAPI and
  Orval client output passed; mobile typecheck passed after building workspace
  dependencies; API metadata typecheck and Prettier checks passed.
- PR #622 shell syntax and workflow formatting checks passed.
- Hosted PR CI, including API/mobile/web, API E2E, accessibility E2E, coverage,
  and `CI Success`, passed for both PR heads before merge.

## Release validation

Post-merge CI passed for final main head
`3ff6fa977c3f9c05ed309ebc6dbf99bd27fc68c2` (run `41513133251`). Published
v0.34.0 against that exact SHA; Mobile Release run `41514216478` passed
detector, Android, iOS, and attachment jobs.

Release assets attached:

- `mobile-android-v0.34.0-debug.apk` (67,984,903 bytes)
- `mobile-ios-v0.34.0-unsigned.xcarchive.zip` (52,145,763 bytes)
