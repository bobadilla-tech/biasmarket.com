# Mobile deep links

The Expo app claims `https://biasmarket.com/store/*` on iOS and Android. Product
URLs open the product screen, store URLs open that store's catalog, and buyer
order URLs open the order screen. The web app remains the browser fallback.

The API association documents are served by Next.js at
`/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`.
`infra/vps/Caddyfile` routes the domain to the active web container without a
redirect; these handlers return `application/json` directly. The Caddy web
upstream already uses a direct `reverse_proxy`, so no Caddy rewrite is needed.

Before domain verification, set these values in the VPS shared environment:

- `IOS_TEAM_ID`: Apple Developer Team ID.
- `IOS_BUNDLE_ID`: must match the iOS bundle identifier (currently
  `com.biasmarket.mobile`).
- `ANDROID_APP_ID`: must match the Android application ID (currently
  `com.biasmarket.mobile`).
- `ANDROID_APP_SHA256_CERT_FINGERPRINT`: SHA-256 fingerprint of the Android
  signing certificate Google Play uses for the production app.

Both endpoints return HTTP 503 until their certificate identifiers are
configured, instead of publishing an association that cannot verify. After
deploying the values, check that both endpoints return HTTP 200 with JSON and
no redirect, then validate them with Apple's App Search API validator and
Android Digital Asset Links tools. Finally test the same product and order URL
on devices with and without the app installed.
