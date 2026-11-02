# Staging golden path

`buyer-checkout-proof-order.yaml` exercises the buyer login, store and product
deep links, cart, pickup checkout, payment proof upload, and private proof
rendering on an Android device.

The `mobile-staging` GitHub environment needs `EXPO_TOKEN`, `EAS_PROJECT_ID`, and these fixture
secrets: `MAESTRO_STORE_SLUG`, `MAESTRO_PRODUCT_ID`, `MAESTRO_PRODUCT_NAME`,
`MAESTRO_BUYER_PHONE`, `MAESTRO_BUYER_PASSWORD`, `MAESTRO_PICKUP_LABEL`, and
`MAESTRO_PAYMENT_METHOD`. The configured store needs the published product, an
enabled pickup point with no required pickup date, and an enabled manual payment
method. Configure the EAS `preview` environment's `EXPO_PUBLIC_API_URL` to the
staging API. The payment-proof image in `fixtures/` is synthetic QA data.

The release workflow builds the EAS preview APK, installs it in the Android
emulator, and runs this flow on pushes to `mobile-release`. It intentionally
fails before building if the staging fixture credentials are absent.
