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

`apps/web/public/.well-known/apple-app-site-association` and
`apps/web/public/.well-known/assetlinks.json` are static files. Next.js serves
them from `public/` with `Content-Type: application/json` (`apps/web/next.config.ts`).
The intl proxy matcher ignores dotted paths, so these URLs are not redirected
to `/es` or `/en`.

`infra/vps/Caddyfile` handles `/.well-known/*` on `biasmarket.com` by proxying
to the active web container. That handle sets `Content-Type: application/json`
after the upstream responds and does not redirect.

The bundle id and package name match `apps/mobile/app.json`
(`com.biasmarket.mobile`). Two values are not in the repo and are placeholders:

- `REPLACE_WITH_APPLE_TEAM_ID` in the AASA `appIDs` entry. Replace it with the
  Apple Developer Team ID (the 10-character team id, keeping the
  `.com.biasmarket.mobile` suffix).
- `REPLACE_WITH_ANDROID_SHA256_CERT_FINGERPRINT` in `assetlinks.json`. Replace
  it with the colon-separated SHA-256 fingerprint of the Android signing
  certificate Google Play App Signing uses for the production app.

Until those two placeholders are replaced, Apple and Google domain verification
cannot pass. After deploying the edited files, confirm both URLs return HTTP
200, `Content-Type: application/json`, and no redirect:

- `https://biasmarket.com/.well-known/apple-app-site-association`
- `https://biasmarket.com/.well-known/assetlinks.json`

Then validate them with Apple's App Search API validator and Google's Digital
Asset Links tool. Finally open the same store, product, and order URL on a
device with the app installed (opens that screen) and on a device without it
(opens the web page).
