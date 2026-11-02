#!/usr/bin/env bash
set -euo pipefail

required=(
  BUILD_ID
  EXPO_TOKEN
  EAS_PROJECT_ID
  STORE_SLUG
  PRODUCT_ID
  PRODUCT_NAME
  BUYER_PHONE
  BUYER_PASSWORD
  PICKUP_LABEL
  PAYMENT_METHOD
)

for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    printf '%s is required in mobile-staging\n' "$name" >&2
    exit 1
  fi
done

cd apps/mobile
pnpm dlx eas-cli build:run --platform android --id "$BUILD_ID" --non-interactive
adb shell mkdir -p /sdcard/Pictures
adb push .maestro/fixtures/payment-proof.png /sdcard/Pictures/payment-proof.png
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/payment-proof.png
maestro test .maestro/flows/buyer-checkout-proof-order.yaml \
  --env STORE_SLUG="$STORE_SLUG" \
  --env PRODUCT_ID="$PRODUCT_ID" \
  --env PRODUCT_NAME="$PRODUCT_NAME" \
  --env BUYER_PHONE="$BUYER_PHONE" \
  --env BUYER_PASSWORD="$BUYER_PASSWORD" \
  --env PICKUP_LABEL="$PICKUP_LABEL" \
  --env PAYMENT_METHOD="$PAYMENT_METHOD"
