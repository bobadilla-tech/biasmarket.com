# Mobile deep links

The Expo app claims localized product and buyer-order URLs on iOS and Android:
`/{es,en}/store/:slug/product/:productId` and
`/{es,en}/store/:slug/account/orders/:orderId`. These paths map to mobile
product and order screens; other web URLs remain in the browser.

The association documents are static files served by Next.js at
`/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`.
`infra/vps/Caddyfile` passes these paths to the active web container without a
redirect and sets their content type to `application/json`.

Before domain verification, replace the marked values in the static files under
`apps/web/public/.well-known/`:

- In `apple-app-site-association`, replace
  `REPLACE_WITH_APPLE_TEAM_ID` with the Apple Developer Team ID. Keep the app
  identifier suffix aligned with the iOS bundle identifier
  (`com.biasmarket.mobile`).
- In `assetlinks.json`, replace
  `REPLACE_WITH_ANDROID_SHA256_CERT_FINGERPRINT` with the SHA-256 fingerprint
  for the production Play App Signing certificate. The package name must remain
  aligned with the Android application ID (`com.biasmarket.mobile`).

Deploy the files, then check that both endpoints return HTTP 200 with JSON and
no redirect. Validate them with Apple's App Search API validator and Android
Digital Asset Links tools. Finally test the same product and order URL on
devices with and without the app installed.
