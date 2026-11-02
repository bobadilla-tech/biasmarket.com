#!/usr/bin/env bash
set -euo pipefail

: "${MAESTRO_VERSION:?Set MAESTRO_VERSION to a pinned Maestro release tag}"
: "${MAESTRO_SHA256:?Set MAESTRO_SHA256 to the release archive checksum}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_PATH:?GITHUB_PATH is required}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
archive="$tmp/maestro.zip"
url="https://github.com/mobile-dev-inc/Maestro/releases/download/${MAESTRO_VERSION}/maestro.zip"

curl --proto '=https' --tlsv1.2 --fail --location --retry 3 "$url" --output "$archive"
echo "${MAESTRO_SHA256}  ${archive}" | sha256sum --check --status
unzip -q "$archive" -d "$RUNNER_TEMP"
test -x "$RUNNER_TEMP/maestro/bin/maestro"
echo "$RUNNER_TEMP/maestro/bin" >> "$GITHUB_PATH"
echo "Installed verified Maestro ${MAESTRO_VERSION}"
