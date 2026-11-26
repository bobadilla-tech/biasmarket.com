# Mobile deep links

The Expo app claims localized store, product, and buyer-order URLs on iOS and
Android:

| Web URL                                        | App screen                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| `/{es,en}/store/:slug`                         | Store (`src/app/store/[storeSlug]/index.tsx`, which opens that store in search) |
| `/{es,en}/store/:slug/product/:productId`      | Product detail                                                                  |
| `/{es,en}/store/:slug/account/orders/:orderId` | Buyer order detail                                                              |

`src/app/+native-intent.ts` strips the locale prefix before Expo Router matches
those files. Other web URLs, including private `/pedido/:token` links, stay in
the browser.

## Association files

`apps/web/app/.well-known/apple-app-site-association/route.ts` and
`apps/web/app/.well-known/assetlinks.json/route.ts` generate the association
documents at request time. They return `application/json`; missing or invalid
runtime identifiers produce HTTP 503 instead of an unverifiable association.
The intl proxy matcher ignores dotted paths, so these URLs are not redirected
to `/es` or `/en`.

`infra/vps/Caddyfile` proxies requests for `biasmarket.com` to the active web
container without redirecting them.

The bundle id and package name match `apps/mobile/app.json`
(`com.biasmarket.mobile`). Set these runtime values for domain verification:

- `IOS_TEAM_ID`: the 10-character Apple Developer Team ID used in the AASA
  `appIDs` entry. `IOS_BUNDLE_ID` defaults to `com.biasmarket.mobile`.
- `ANDROID_APP_ID`: the Android package name (`com.biasmarket.mobile`).
- `ANDROID_APP_SHA256_CERT_FINGERPRINT`: the colon-separated SHA-256
  fingerprint of the Android signing certificate Google Play App Signing uses
  for the production app.

Until the required identifiers are configured, Apple and Google domain
verification cannot pass. After setting them on the web deployment, confirm
both URLs return HTTP 200, `Content-Type: application/json`, and no redirect:

- `https://biasmarket.com/.well-known/apple-app-site-association`
- `https://biasmarket.com/.well-known/assetlinks.json`

Then validate them with Apple's App Search API validator and Google's Digital
Asset Links tool. Finally open the same store, product, and order URL on a
device with the app installed (opens that screen) and on a device without it
(opens the web page).
