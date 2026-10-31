# Mobile deep links

The Android intent filter claims all `https://biasmarket.com/store/*` URLs;
iOS claims store product and buyer order URLs, including the `/es` and `/en`
locale prefixes. The mobile router opens supported store catalog, product, and
buyer order routes. Other paths fall back to the app root on Android, so avoid
using `/store/*` for web-only flows that must remain in the browser. The web app
remains the browser fallback when the app is not installed.

The static association documents are generated into `apps/web/public/.well-known`
during the web image build when both signing identifiers are configured. They
are served directly at `/.well-known/apple-app-site-association` and
`/.well-known/assetlinks.json` with `application/json` content type.
`infra/vps/Caddyfile` routes the domain to the active web container without a
redirect. The Caddy web upstream already uses a direct `reverse_proxy`, so no
Caddy rewrite is needed.

Before domain verification, set these public repository-level GitHub Actions
variables so the web Docker build can generate the static files:

- `IOS_TEAM_ID`: Apple Developer Team ID.
- `IOS_BUNDLE_ID`: must match the iOS bundle identifier (currently
  `com.biasmarket.mobile`).
- `ANDROID_APP_ID`: must match the Android application ID (currently
  `com.biasmarket.mobile`).
- `ANDROID_APP_SHA256_CERT_FINGERPRINT`: SHA-256 fingerprint of the Android
  signing certificate Google Play uses for the production app.

The files are omitted from builds that lack both certificate identifiers, so
the site never publishes unverifiable placeholder data. Set
`MOBILE_ASSOCIATIONS_REQUIRED=true` as a repository-level variable to make a
production image build fail until both are configured. After deploying the
values, check that both URLs return HTTP 200 with JSON and no redirect, then
validate them with Apple's App Search API validator and Android Digital Asset
Links tools. Finally test the same product and order URL on devices with and
without the app installed.
